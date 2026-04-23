import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

/**
 * CLI state lives at `~/.openape/auth-tasks.json` (chmod 600). Multiple
 * endpoints (e.g. local dev vs prod) can coexist under `endpoints["<url>"]`;
 * the `activeEndpoint` key selects the default.
 *
 * Override endpoint per invocation via `--endpoint <url>`. Override the
 * default at startup via `APE_TASKS_ENDPOINT` env var.
 *
 * **Migration note:** v0.2.x stored this at `~/.openape/plans.json`. The
 * name overloaded "plans" (state vs. content). On first load we still read
 * the old path as a fallback; any `save` writes the new name. Users can
 * delete `~/.openape/plans.json` once they've logged in once on the new
 * CLI version.
 */

const DEFAULT_ENDPOINT = process.env.APE_TASKS_ENDPOINT ?? 'https://tasks.openape.ai'

export interface EndpointState {
  endpoint: string
  token: string
  email: string
  act?: 'human' | 'agent'
  tokenExpiresAt?: number
  /** Default team ULID for this endpoint. `teams use <id>` sets it. */
  activeTeamId?: string
}

export interface CliConfig {
  activeEndpoint: string
  endpoints: Record<string, EndpointState>
}

const CONFIG_DIR = join(homedir(), '.openape')
const CONFIG_FILE = join(CONFIG_DIR, 'auth-tasks.json')
const LEGACY_CONFIG_FILE = join(CONFIG_DIR, 'plans.json')

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
}

export function loadConfig(): CliConfig {
  const path = existsSync(CONFIG_FILE)
    ? CONFIG_FILE
    : (existsSync(LEGACY_CONFIG_FILE) ? LEGACY_CONFIG_FILE : null)
  if (!path) {
    return { activeEndpoint: DEFAULT_ENDPOINT, endpoints: {} }
  }
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<CliConfig>
    return {
      activeEndpoint: parsed.activeEndpoint ?? DEFAULT_ENDPOINT,
      endpoints: parsed.endpoints ?? {},
    }
  }
  catch {
    return { activeEndpoint: DEFAULT_ENDPOINT, endpoints: {} }
  }
}

export function saveConfig(config: CliConfig): void {
  ensureConfigDir()
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 })
  try { chmodSync(CONFIG_FILE, 0o600) } catch { /* best effort */ }
  // Once we've written the new-name file, clean up the legacy one.
  if (existsSync(LEGACY_CONFIG_FILE)) {
    try { unlinkSync(LEGACY_CONFIG_FILE) } catch { /* best effort */ }
  }
}

export function resolveEndpoint(override?: unknown): string {
  if (typeof override === 'string' && override.length > 0) return override.replace(/\/$/, '')
  const config = loadConfig()
  return (config.activeEndpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, '')
}

export function getActiveSession(endpointOverride?: unknown): EndpointState | null {
  const endpoint = resolveEndpoint(endpointOverride)
  const config = loadConfig()
  const state = config.endpoints[endpoint]
  if (!state?.token) return null
  return state
}

export function setActiveSession(state: EndpointState): void {
  const config = loadConfig()
  config.activeEndpoint = state.endpoint
  config.endpoints[state.endpoint] = state
  saveConfig(config)
}

export function clearActiveSession(endpointOverride?: unknown): void {
  const endpoint = resolveEndpoint(endpointOverride)
  const config = loadConfig()
  delete config.endpoints[endpoint]
  if (Object.keys(config.endpoints).length === 0) {
    for (const f of [CONFIG_FILE, LEGACY_CONFIG_FILE]) {
      if (existsSync(f)) {
        try { unlinkSync(f) } catch { /* best effort */ }
      }
    }
    return
  }
  if (config.activeEndpoint === endpoint) {
    config.activeEndpoint = Object.keys(config.endpoints)[0] ?? DEFAULT_ENDPOINT
  }
  saveConfig(config)
  // Prune the legacy file once we've migrated to the new name so we don't
  // end up with stale tokens sitting around.
  if (existsSync(LEGACY_CONFIG_FILE) && existsSync(CONFIG_FILE)) {
    try { unlinkSync(LEGACY_CONFIG_FILE) } catch { /* best effort */ }
  }
}

export function configPath(): string {
  return CONFIG_FILE
}

/** Per-endpoint active team, set via `teams use <id>`. */
export function getActiveTeamId(endpointOverride?: unknown): string | undefined {
  return getActiveSession(endpointOverride)?.activeTeamId
}

export function setActiveTeamId(teamId: unknown, endpointOverride?: unknown): void {
  const endpoint = resolveEndpoint(endpointOverride)
  const config = loadConfig()
  const state = config.endpoints[endpoint]
  if (!state) return
  if (typeof teamId === 'string' && teamId.length > 0) state.activeTeamId = teamId
  else delete state.activeTeamId
  saveConfig(config)
}

/**
 * Resolve a team id for a command: explicit `--team` wins, then the stored
 * active team, then throw a clear error pointing the user at `teams use`.
 */
export function resolveTeamId(explicit?: unknown, endpointOverride?: unknown): string {
  if (typeof explicit === 'string' && explicit.length > 0) return explicit
  const active = getActiveTeamId(endpointOverride)
  if (active) return active
  throw Object.assign(new Error('No team. Pass --team <id> or run `ape-tasks teams use <id>` to set a default.'), {
    status: 400,
    title: 'No team',
  })
}

export { DEFAULT_ENDPOINT, dirname }
