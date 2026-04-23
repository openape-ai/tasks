import { defineEventHandler, readBody } from 'h3'
import { requireCaller } from '../../utils/require-auth'
import { signCliToken } from '../../utils/cli-token'
import { createProblemError } from '../../utils/problem'

/**
 * POST /api/cli/token — mint a bearer token for the caller's active session.
 * Intended to be called from the /cli-login page after DDISA login, so the
 * CLI can authenticate subsequent requests without requiring browser cookies.
 *
 * Body: { ttl_hours?: number (1–2160, default 720 = 30d) }
 * Response: { token, expires_at, email, act }
 *
 * The token is an HS256 JWT signed with NUXT_CLI_TOKEN_SECRET and is not
 * persisted server-side. To revoke all outstanding tokens, rotate the secret.
 */
export default defineEventHandler(async (event) => {
  const caller = await requireCaller(event)
  const body = await readBody<{ ttl_hours?: number }>(event)
  const ttlHours = typeof body?.ttl_hours === 'number' ? Math.floor(body.ttl_hours) : 24 * 30
  if (ttlHours < 1 || ttlHours > 2160) {
    throw createProblemError({ status: 400, title: 'ttl_hours must be 1–2160' })
  }

  const { token, expiresAt } = await signCliToken({
    email: caller.email,
    act: caller.act,
    ttlSeconds: ttlHours * 3600,
  })

  return {
    token,
    expires_at: expiresAt,
    email: caller.email,
    act: caller.act,
  }
})
