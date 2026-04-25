import { clearSpToken } from '@openape/cli-auth'
import { defineCommand } from 'citty'
import { existsSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveEndpoint } from '../config.ts'
import { info } from '../output.ts'

/**
 * Drop the cached SP-token for tasks.openape.ai. Doesn't touch the IdP
 * session — that's owned by `apes login` / `apes logout`. Use
 * `--legacy` to also delete the pre-1.0 `~/.openape/auth-tasks.json`
 * file if it's still hanging around from before the SSO refactor.
 */
export const logoutCommand = defineCommand({
  meta: {
    name: 'logout',
    description: 'Forget the cached tasks SP-token (does NOT log you out of `apes`).',
  },
  args: {
    endpoint: { type: 'string', description: 'Override tasks endpoint.' },
    legacy: { type: 'boolean', description: 'Also delete the legacy ~/.openape/auth-tasks.json file.' },
  },
  async run({ args }) {
    const endpoint = resolveEndpoint(args.endpoint)
    const aud = (() => {
      try { return new URL(endpoint).host }
      catch { return 'tasks.openape.ai' }
    })()
    clearSpToken(aud)
    info(`Cleared tasks SP-token cache for ${endpoint}.`)

    if (args.legacy) {
      const legacy = join(homedir(), '.openape', 'auth-tasks.json')
      if (existsSync(legacy)) {
        unlinkSync(legacy)
        info(`Removed legacy ${legacy}.`)
      }
      else {
        info('No legacy auth-tasks.json to remove.')
      }
    }

    info('IdP session (~/.config/apes/auth.json) untouched. Run `apes logout` to clear it.')
  },
})
