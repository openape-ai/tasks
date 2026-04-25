import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { verifyAuthzJWT } from '@openape/grants'
import { createProblemError } from '../../utils/problem'
import { signCliToken } from '../../utils/cli-token'

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
  const idpIssuer = (config.idpIssuer as string) || 'https://id.openape.ai'
  const idpJwksUri = (config.idpJwksUri as string) || `${idpIssuer}/.well-known/jwks.json`
  const idpAudience = (config.idpAudience as string) || 'apes-cli'

  const result = await verifyAuthzJWT(body.subject_token, {
    expectedIss: idpIssuer,
    expectedAud: idpAudience,
    jwksUri: idpJwksUri,
  })

  if (!result.valid || !result.claims) {
    throw createProblemError({
      status: 401,
      title: 'Invalid subject_token',
      detail: result.error ?? `Token must be issued by ${idpIssuer} with aud=${idpAudience}.`,
    })
  }

  const sub = result.claims.sub as string | undefined
  if (!sub || typeof sub !== 'string' || !sub.includes('@')) {
    throw createProblemError({
      status: 401,
      title: 'subject_token has no usable subject claim',
      detail: 'Expected sub to be an email address.',
    })
  }

  const act = result.claims.act === 'agent' ? 'agent' : 'human'

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
