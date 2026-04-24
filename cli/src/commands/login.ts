import { defineCommand } from 'citty'
import { createInterface } from 'node:readline/promises'
import { createApiError } from '../api.ts'
import { resolveEndpoint, setActiveSession } from '../config.ts'
import { info, printLine } from '../output.ts'

/**
 * Log in to tasks.openape.ai.
 *
 * The flow is paste-based because tasks.openape.ai is a web SP that relies on
 * DDISA-discovered identity providers for the actual sign-in. You sign in once
 * in a browser at {endpoint}/cli-login, copy the token shown there, and paste
 * it here.
 *
 * EXAMPLE
 *   $ ape-tasks login patrick@example.com
 *   Open in browser: https://tasks.openape.ai/cli-login
 *   After signing in, paste the token shown there.
 *   Token: eyJhbGciOi…
 *   Logged in as patrick@example.com (endpoint: https://tasks.openape.ai)
 *
 * The token is stored at ~/.openape/auth-tasks.json (chmod 600). Tokens are valid
 * for 30 days; run `ape-tasks login` again to refresh.
 */
export const loginCommand = defineCommand({
  meta: {
    name: 'login',
    description: 'Log in by pasting a CLI token from {endpoint}/cli-login.',
  },
  args: {
    email: {
      type: 'positional',
      required: false,
      description: 'Email to associate with this session (informational; the token carries identity).',
    },
    endpoint: {
      type: 'string',
      description: 'Override plans endpoint (default https://tasks.openape.ai or APE_TASKS_ENDPOINT).',
    },
  },
  async run({ args }) {
    const endpoint = resolveEndpoint(args.endpoint)
    const browserUrl = `${endpoint}/cli-login`

    printLine(`1. Open this URL in a browser:\n   ${browserUrl}`)
    printLine('2. Sign in with your email, then click "Generate CLI token".')
    printLine('3. Copy the token and paste it below.')
    printLine('')

    const rl = createInterface({ input: process.stdin, output: process.stderr })
    const token = (await rl.question('Token: ')).trim()
    rl.close()

    if (!token) throw createApiError(400, 'Token cannot be empty')

    // Verify the token by pinging /api/me with it directly (bypassing stored creds)
    const verified = await verifyToken(endpoint, token)
    const email = args.email?.trim() || verified.email || verified.sub || 'unknown'

    setActiveSession({
      endpoint,
      token,
      email,
      act: verified.act === 'agent' ? 'agent' : 'human',
      tokenExpiresAt: verified.exp,
    })

    info(`Logged in as ${email} (endpoint: ${endpoint})`)
  },
})

async function verifyToken(endpoint: string, token: string): Promise<{ sub?: string, email?: string, act?: string, exp?: number }> {
  try {
    const res = await fetch(`${endpoint}/api/cli/me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { title?: string }
      throw createApiError(res.status, body.title ?? `Token rejected (HTTP ${res.status})`)
    }
    return (await res.json()) as { sub?: string, email?: string, act?: string, exp?: number }
  }
  catch (err) {
    if (err && typeof err === 'object' && 'status' in err) throw err
    throw createApiError(0, `Network error talking to ${endpoint}: ${(err as Error).message}`)
  }
}
