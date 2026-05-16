import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { verifyAuthzJWT } from '@openape/grants'
import { createProblemError } from '../../utils/problem'
import { signCliToken } from '../../utils/cli-token'
import { resolveIssuerForToken } from '../../utils/ddisa-issuer'

interface ExchangeBody {
  subject_token?: string
  scopes?: string[]
}

/**
 * POST /api/cli/exchange — RFC 8693-style token exchange.
 *
 * Accepts an IdP-issued subject_token (signed by id.openape.ai with
 * `aud='apes-cli'`), verifies it via JWKS, and mints an SP-scoped HS256
 * token for tasks.openape.ai. The CLI side (`@openape/cli-auth`
 * `getAuthorizedBearer`) caches the result so subsequent ape-tasks
 * commands don't hit this endpoint until the SP-token expires (default
 * 30 days).
 *
 * Body: `{ subject_token: <jwt>, scopes?: string[] }`
 *
 * Response (201): `{ access_token, token_type: "Bearer", expires_at, aud, scopes? }`
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<ExchangeBody>(event)
  if (!body?.subject_token || typeof body.subject_token !== 'string') {
    throw createProblemError({ status: 400, title: 'subject_token required' })
  }

  const config = useRuntimeConfig(event)
  const idpAudience = (config.idpAudience as string) || 'apes-cli'

  // DDISA: resolve the authoritative issuer from the SUBJECT's domain
  // (protocol sp-data-access.md §2.1) — never hardcoded, no allowlist.
  // Behaviour-preserving: a subject whose domain has no DDISA record (or
  // points at id.openape.ai) verifies against id.openape.ai exactly as before.
  const resolved = await resolveIssuerForToken(body.subject_token)
  if (!resolved) {
    throw createProblemError({
      status: 401,
      title: 'subject_token has no usable subject claim',
      detail: 'Expected sub to be an email address.',
    })
  }

  const result = await verifyAuthzJWT(body.subject_token, {
    expectedIss: resolved.issuer,
    expectedAud: idpAudience,
    jwksUri: resolved.jwksUri,
  })

  if (!result.valid || !result.claims) {
    throw createProblemError({
      status: 401,
      title: 'Invalid subject_token',
      detail: result.error ?? `Token must be issued by ${resolved.issuer} (DDISA-resolved from ${resolved.sub}) with aud=${idpAudience}.`,
    })
  }

  const claims = result.claims as unknown as Record<string, unknown>
  const sub = claims.sub
  if (typeof sub !== 'string' || !sub.includes('@')) {
    throw createProblemError({
      status: 401,
      title: 'subject_token has no usable subject claim',
      detail: 'Expected sub to be an email address.',
    })
  }

  const act = claims.act === 'agent' ? 'agent' : 'human'

  const { token, expiresAt } = await signCliToken({
    email: sub,
    act,
    ttlSeconds: 30 * 24 * 3600,
  })

  setResponseStatus(event, 201)
  return {
    access_token: token,
    token_type: 'Bearer' as const,
    expires_at: expiresAt,
    aud: 'tasks.openape.ai',
    ...(Array.isArray(body.scopes) ? { scopes: body.scopes } : {}),
  }
})
