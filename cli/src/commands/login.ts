import { defineCommand } from 'citty'
import { createInterface } from 'node:readline/promises'
import { createApiError } from '../api.ts'
import { resolveEndpoint, setActiveSession } from '../config.ts'
import { info, printLine } from '../output.ts'

/**
 * Log in to tasks.openape.ai.
 *
 * Paste-based because tasks.openape.ai relies on DDISA-discovered identity
 * providers for the actual sign-in. You authenticate once in a browser at
 * {endpoint}/cli-login, copy the token shown there, and feed it to this
 * command.
 *
 * Three equivalent input paths:
 *   1. Interactive prompt (TTY).
 *   2. `--token <value>` flag (scripts, agents).
 *   3. Piped stdin (`echo $TOKEN | ape-tasks login <email>`).
 *
 * EXAMPLES
 *   $ ape-tasks login patrick@example.com
 *   Open in browser: https://tasks.openape.ai/cli-login
 *   After signing in, paste the token shown there.
 *   Token: eyJhbGciOi…
 *   Logged in as patrick@example.com (endpoint: https://tasks.openape.ai)
 *
 *   $ ape-tasks login patrick@example.com --token eyJhbGciOi...
 *   $ echo "$OPENAPE_CLI_TOKEN" | ape-tasks login patrick@example.com
 *
 * Token goes to ~/.openape/auth-tasks.json (chmod 600). 30-day lifetime;
 * run `ape-tasks login` again to refresh.
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
    token: {
      type: 'string',
      description: 'Pass the CLI token directly instead of the prompt (useful for scripts / agents).',
    },
    endpoint: {
      type: 'string',
      description: 'Override tasks endpoint (default https://tasks.openape.ai or APE_TASKS_ENDPOINT).',
    },
  },
  async run({ args }) {
    const endpoint = resolveEndpoint(args.endpoint)
    const browserUrl = `${endpoint}/cli-login`

    const token = (args.token?.trim() || await promptForToken(browserUrl)).trim()
    if (!token) throw createApiError(400, 'Token cannot be empty')

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

async function promptForToken(browserUrl: string): Promise<string> {
  printLine(`1. Open this URL in a browser:\n   ${browserUrl}`)
  printLine('2. Sign in with your email, then click "Generate CLI token".')
  printLine('3. Copy the token and paste it below.')
  printLine('')

  const rl = createInterface({ input: process.stdin, output: process.stderr })
  try {
    return await rl.question('Token: ')
  }
  finally {
    rl.close()
  }
}

async function verifyToken(endpoint: string, token: string): Promise<{ sub?: string, email?: string, act?: string, exp?: number }> {
  const target = `${endpoint}/api/cli/me`
  try {
    const res = await fetch(target, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { title?: string, detail?: string }
      const title = body.title ?? `Token rejected (HTTP ${res.status})`
      const hint = res.status === 401
        ? `Endpoint rejected the token at ${target}. Generate a fresh one at ${endpoint}/cli-login.`
        : body.detail
      throw createApiError(res.status, title, hint)
    }
    return (await res.json()) as { sub?: string, email?: string, act?: string, exp?: number }
  }
  catch (err) {
    if (err && typeof err === 'object' && 'status' in err) throw err
    throw createApiError(0, `Network error talking to ${target}: ${(err as Error).message}`)
  }
}
