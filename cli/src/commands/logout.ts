import { defineCommand } from 'citty'
import { clearActiveSession, resolveEndpoint } from '../config.ts'
import { info } from '../output.ts'

/**
 * Forget the locally-stored token for this endpoint.
 *
 * EXAMPLE
 *   $ ape-tasks logout
 *   Logged out of https://tasks.openape.ai
 */
export const logoutCommand = defineCommand({
  meta: {
    name: 'logout',
    description: 'Remove the locally stored token for the current endpoint.',
  },
  args: {
    endpoint: { type: 'string', description: 'Override plans endpoint.' },
  },
  async run({ args }) {
    const endpoint = resolveEndpoint(args.endpoint)
    clearActiveSession(args.endpoint)
    info(`Logged out of ${endpoint}`)
  },
})
