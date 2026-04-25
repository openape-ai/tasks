import { defineCommand } from 'citty'
import { readFileSync } from 'node:fs'
import { apiCall, createApiError } from '../api.ts'
import { resolveTeamId } from '../config.ts'
import { printJson, printLine } from '../output.ts'

type TaskStatus = 'open' | 'doing' | 'done' | 'archived'
type TaskPriority = 'low' | 'med' | 'high'
const VALID_STATUS: readonly TaskStatus[] = ['open', 'doing', 'done', 'archived']
const VALID_PRIORITY: readonly TaskPriority[] = ['low', 'med', 'high']

interface Task {
  id: string
  team_id: string
  title: string
  notes: string
  status: TaskStatus
  priority: TaskPriority | null
  due_at: number | null
  assignee_email: string | null
  sort_order: number
  remind_at: number | null
  reminder_count: number
  last_reminder_at: number | null
  reminder_max: number
  context_url: string | null
  context_summary: string | null
  owner_email: string
  created_at: number
  updated_at: number
  updated_by: string
  completed_at: number | null
}

interface TeamListItem {
  id: string
  name: string
  role: string
  open_task_count: number
}

function parseStatusFilter(v: unknown): TaskStatus[] | undefined {
  if (!v) return undefined
  const parts = String(v).split(',').map(s => s.trim()).filter(Boolean)
  const bad = parts.find(p => !VALID_STATUS.includes(p as TaskStatus))
  if (bad) throw createApiError(400, `Invalid status "${bad}"`, `Valid: ${VALID_STATUS.join(', ')}.`)
  return parts as TaskStatus[]
}

/**
 * Parse --due argument into unix seconds, or null to clear, or undefined to
 * skip. Accepts:
 *   ISO 8601 (`2026-05-01T09:00:00`, `2026-05-01`)
 *   Relative shorthand: `+2h`, `+1d`, `+30m`, `+2w`
 *   `none` | `clear` | `""` — explicit clear
 */
function parseDue(v: unknown): number | null | undefined {
  if (v === undefined) return undefined
  const s = String(v).trim()
  if (s === '' || s === 'none' || s === 'clear') return null
  const rel = s.match(/^\+(\d+)(m|h|d|w)$/i)
  if (rel) {
    const n = Number(rel[1])
    const unit = rel[2]!.toLowerCase()
    const sec = { m: 60, h: 3600, d: 86400, w: 604800 }[unit] ?? 0
    return Math.floor(Date.now() / 1000) + n * sec
  }
  const ms = Date.parse(s)
  if (!Number.isFinite(ms)) {
    throw createApiError(400, `Invalid --due "${s}"`, 'Use ISO 8601 (2026-05-01T09:00) or shorthand (+2h, +1d, +30m, +2w), or "none" to clear.')
  }
  return Math.floor(ms / 1000)
}

function parsePriority(v: unknown): TaskPriority | null | undefined {
  if (v === undefined) return undefined
  const s = String(v).trim().toLowerCase()
  if (s === '' || s === 'none' || s === 'clear') return null
  if (s === 'medium' || s === 'm') return 'med'
  if (s === 'l') return 'low'
  if (s === 'h') return 'high'
  if (!VALID_PRIORITY.includes(s as TaskPriority)) {
    throw createApiError(400, `Invalid --priority "${s}"`, `Valid: ${VALID_PRIORITY.join(', ')} (or "none").`)
  }
  return s as TaskPriority
}

function parseAssignee(v: unknown): string | null | undefined {
  if (v === undefined) return undefined
  const s = String(v).trim()
  if (s === '' || s === 'none' || s === 'clear') return null
  return s
}

/**
 * Parse --remind-at. Same grammar as --due (ISO 8601 or +N{m|h|d|w}); `none`/empty
 * clears, undefined skips. We could integrate `chrono-node` for natural language
 * later, but for v1 the shorthand keeps the dep surface tiny.
 */
function parseRemindAt(v: unknown): number | null | undefined {
  if (v === undefined) return undefined
  const s = String(v).trim()
  if (s === '' || s === 'none' || s === 'clear') return null
  const rel = s.match(/^\+(\d+)(m|h|d|w)$/i)
  if (rel) {
    const n = Number(rel[1])
    const unit = rel[2]!.toLowerCase()
    const sec = { m: 60, h: 3600, d: 86400, w: 604800 }[unit] ?? 0
    return Math.floor(Date.now() / 1000) + n * sec
  }
  const ms = Date.parse(s)
  if (!Number.isFinite(ms)) {
    throw createApiError(400, `Invalid --remind-at "${s}"`, 'Use ISO 8601 (2026-05-01T09:00) or shorthand (+2h, +1d, +30m, +2w), or "none" to clear.')
  }
  return Math.floor(ms / 1000)
}

function parseTextOrClear(v: unknown): string | null | undefined {
  if (v === undefined) return undefined
  const s = String(v).trim()
  if (s === '' || s === 'none' || s === 'clear') return null
  return s
}

function formatDue(ts: number | null): string {
  if (!ts) return ''
  const now = Math.floor(Date.now() / 1000)
  const diff = ts - now
  const absS = Math.abs(diff)
  if (absS < 86400) {
    const d = new Date(ts * 1000)
    return d.toLocaleString([], { hour: '2-digit', minute: '2-digit' })
  }
  const days = Math.round(diff / 86400)
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days < 0) return `${-days}d overdue`
  if (days < 7) return `in ${days}d`
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

function formatRow(t: Task): string {
  const statusGlyph = t.status === 'done' ? '[x]' : t.status === 'doing' ? '[~]' : t.status === 'archived' ? '[a]' : '[ ]'
  const prio = t.priority === 'high' ? ' !!!' : t.priority === 'med' ? ' !!' : t.priority === 'low' ? ' !' : ''
  const due = t.due_at ? `  (due ${formatDue(t.due_at)})` : ''
  const assignee = t.assignee_email ? `  @${t.assignee_email}` : ''
  return `${statusGlyph} ${t.id}  ${t.title}${prio}${due}${assignee}  [team ${t.team_id}]`
}

async function fetchAllTasks(endpoint: string | undefined, teamFilter: string | undefined, statuses: TaskStatus[]): Promise<Task[]> {
  const statusQuery = statuses.join(',')
  if (teamFilter) {
    return await apiCall<Task[]>('GET', `/api/teams/${teamFilter}/tasks?status=${statusQuery}`, { endpoint })
  }
  const teams = await apiCall<TeamListItem[]>('GET', '/api/teams', { endpoint })
  const all: Task[] = []
  for (const team of teams) {
    try {
      const rows = await apiCall<Task[]>('GET', `/api/teams/${team.id}/tasks?status=${statusQuery}`, { endpoint })
      all.push(...rows)
    }
    catch {
      // Skip teams the caller can no longer access rather than failing the whole list.
    }
  }
  all.sort((a, b) => a.sort_order - b.sort_order || a.created_at - b.created_at)
  return all
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    process.stdin.on('data', chunk => chunks.push(Buffer.from(chunk)))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    process.stdin.on('error', reject)
  })
}

async function resolveNotesInput(args: { notes?: unknown, 'notes-from-stdin'?: unknown, 'notes-from-file'?: unknown }): Promise<string | undefined> {
  if (typeof args['notes-from-file'] === 'string' && args['notes-from-file']) {
    return readFileSync(args['notes-from-file'], 'utf-8')
  }
  if (args['notes-from-stdin']) return await readStdin()
  if (typeof args.notes === 'string') return args.notes
  return undefined
}

/**
 * List tasks across the lists (teams) you belong to.
 *
 * EXAMPLES
 *   $ ape-tasks list
 *   [ ] 01HX...  Call the dentist  !!  (due tomorrow)  [team 01HY...]
 *
 *   $ ape-tasks list --team 01HXX... --status open,doing --json | jq '.[].title'
 */
export const listCommand = defineCommand({
  meta: {
    name: 'list',
    description: 'List tasks. Default filter: open,doing. Use --status to change.',
  },
  args: {
    team: { type: 'string', description: 'Team (list) ULID to filter by.' },
    status: { type: 'string', description: 'Comma-separated statuses (default open,doing). Options: open|doing|done|archived.' },
    json: { type: 'boolean', description: 'JSON output.' },
    endpoint: { type: 'string', description: 'Override tasks endpoint.' },
  },
  async run({ args }) {
    const statuses = parseStatusFilter(args.status) ?? (['open', 'doing'] as TaskStatus[])
    const rows = await fetchAllTasks(args.endpoint, args.team, statuses)
    if (args.json) { printJson(rows); return }
    if (rows.length === 0) { printLine('(no tasks)'); return }
    for (const t of rows) printLine(formatRow(t))
  },
})

/**
 * Show a single task (title, metadata, notes).
 *
 * EXAMPLES
 *   $ ape-tasks show 01HXX...
 *   $ ape-tasks show 01HXX... --json | jq .status
 */
export const showCommand = defineCommand({
  meta: {
    name: 'show',
    description: 'Show a task. Default: human summary to stdout.',
  },
  args: {
    taskId: { type: 'positional', required: true, description: 'Task ULID.' },
    json: { type: 'boolean', description: 'JSON output (full task).' },
    endpoint: { type: 'string', description: 'Override tasks endpoint.' },
  },
  async run({ args }) {
    const t = await apiCall<Task>('GET', `/api/tasks/${args.taskId}`, { endpoint: args.endpoint })
    if (args.json) { printJson(t); return }
    printLine(`${t.title}`)
    printLine(`  id:        ${t.id}`)
    printLine(`  team:      ${t.team_id}`)
    printLine(`  status:    ${t.status}`)
    if (t.priority) printLine(`  priority:  ${t.priority}`)
    if (t.due_at) printLine(`  due:       ${new Date(t.due_at * 1000).toISOString()}`)
    if (t.assignee_email) printLine(`  assignee:  ${t.assignee_email}`)
    if (t.remind_at) {
      const escSuffix = t.reminder_count > 0
        ? ` (sent ${t.reminder_count}/${t.reminder_max}${t.last_reminder_at ? `, last ${new Date(t.last_reminder_at * 1000).toISOString()}` : ''})`
        : ''
      printLine(`  remind:    ${new Date(t.remind_at * 1000).toISOString()}${escSuffix}`)
    }
    if (t.context_url) printLine(`  context:   ${t.context_url}`)
    if (t.context_summary) printLine(`  about:     ${t.context_summary}`)
    printLine(`  owner:     ${t.owner_email}`)
    printLine(`  created:   ${new Date(t.created_at * 1000).toISOString()}`)
    printLine(`  updated:   ${new Date(t.updated_at * 1000).toISOString()} by ${t.updated_by}`)
    if (t.notes) {
      printLine('')
      process.stdout.write(t.notes.endsWith('\n') ? t.notes : `${t.notes}\n`)
    }
  },
})

/**
 * Create a task in a list.
 *
 * EXAMPLES
 *   $ ape-tasks new --title "Call the dentist"
 *   01HXX...
 *
 *   $ ape-tasks new --team 01HYY... --title "Draft Q3 plan" --priority high --due +2d --assignee me@x.eco
 *
 *   $ ape-tasks new --title "Review PR" --notes "Focus on auth refactor"
 *
 *   $ echo 'multi-line\\nnotes' | ape-tasks new --title Foo --notes-from-stdin
 *
 * Team comes from --team, or the active list set via `ape-tasks teams use <id>`.
 */
export const newCommand = defineCommand({
  meta: {
    name: 'new',
    description: 'Create a task in a list.',
  },
  args: {
    team: { type: 'string', description: 'Team (list) ULID. Falls back to `teams use <id>` default.' },
    title: { type: 'string', required: true, description: 'Task title (1–200 chars).' },
    notes: { type: 'string', description: 'Notes body (plain text or Markdown).' },
    'notes-from-stdin': { type: 'boolean', description: 'Read notes from stdin.' },
    'notes-from-file': { type: 'string', description: 'Read notes from a file.' },
    status: { type: 'string', description: 'open|doing|done|archived (default open).' },
    priority: { type: 'string', description: 'low|med|high (default none).' },
    due: { type: 'string', description: 'ISO 8601 or shorthand (+2h, +1d, +30m, +2w).' },
    assignee: { type: 'string', description: 'Assignee email.' },
    'remind-at': { type: 'string', description: 'When to email the assignee a reminder. ISO 8601 or shorthand (+2h, +1d, +30m, +2w).' },
    'reminder-max': { type: 'string', description: 'Max reminder mails before silence (default 5).' },
    'context-url': { type: 'string', description: 'Deep-link back to the source (e.g. an Outlook web URL).' },
    'context-summary': { type: 'string', description: 'One-liner shown in the reminder mail (e.g. "Mail from X: subject Y").' },
    json: { type: 'boolean', description: 'JSON output.' },
    'id-only': { type: 'boolean', description: 'Print only the new task id.' },
    endpoint: { type: 'string', description: 'Override tasks endpoint.' },
  },
  async run({ args }) {
    const teamId = resolveTeamId(args.team, args.endpoint)
    const status = (args.status ?? 'open') as TaskStatus
    if (!VALID_STATUS.includes(status)) {
      throw createApiError(400, `Invalid status "${args.status}"`, `Valid: ${VALID_STATUS.join(', ')}.`)
    }

    const priority = parsePriority(args.priority)
    const dueAt = parseDue(args.due)
    const assignee = parseAssignee(args.assignee)
    const remindAt = parseRemindAt(args['remind-at'])
    const contextUrl = parseTextOrClear(args['context-url'])
    const contextSummary = parseTextOrClear(args['context-summary'])
    const notes = await resolveNotesInput(args) ?? ''

    const body: Record<string, unknown> = { title: args.title, notes, status }
    if (priority !== undefined) body.priority = priority
    if (dueAt !== undefined) body.due_at = dueAt
    if (assignee !== undefined) body.assignee_email = assignee
    if (remindAt !== undefined) body.remind_at = remindAt
    if (contextUrl !== undefined) body.context_url = contextUrl
    if (contextSummary !== undefined) body.context_summary = contextSummary
    if (typeof args['reminder-max'] === 'string') {
      const n = Number(args['reminder-max'])
      if (Number.isInteger(n) && n >= 0 && n <= 50) body.reminder_max = n
    }

    const t = await apiCall<Task>('POST', `/api/teams/${teamId}/tasks`, {
      endpoint: args.endpoint,
      body,
    })
    if (args['id-only']) { printLine(t.id); return }
    if (args.json) { printJson(t); return }
    printLine(t.id)
  },
})

/**
 * Update any field on a task. Pass `none` or empty string to clear priority /
 * due / assignee.
 *
 * EXAMPLES
 *   $ ape-tasks edit 01HXX... --title "Call the dentist 3pm"
 *   $ ape-tasks edit 01HXX... --priority high --due +1d
 *   $ ape-tasks edit 01HXX... --assignee none        # clear
 *   $ ape-tasks edit 01HXX... --notes-from-file notes.md
 */
export const editCommand = defineCommand({
  meta: {
    name: 'edit',
    description: 'Update task fields.',
  },
  args: {
    taskId: { type: 'positional', required: true, description: 'Task ULID.' },
    title: { type: 'string', description: 'New title.' },
    status: { type: 'string', description: 'New status (open|doing|done|archived).' },
    priority: { type: 'string', description: 'low|med|high, or "none" to clear.' },
    due: { type: 'string', description: 'ISO 8601 / shorthand (+2h, +1d), or "none" to clear.' },
    assignee: { type: 'string', description: 'Assignee email, or "none" to clear.' },
    notes: { type: 'string', description: 'New notes (replaces current).' },
    'notes-from-stdin': { type: 'boolean', description: 'Read notes from stdin.' },
    'notes-from-file': { type: 'string', description: 'Read notes from a file.' },
    'remind-at': { type: 'string', description: 'When to email the assignee a reminder. ISO 8601 / shorthand (+2h, +1d), or "none" to clear. Setting a new value also resets the escalation counter.' },
    'reminder-max': { type: 'string', description: 'Max reminder mails before silence.' },
    'context-url': { type: 'string', description: 'Deep-link back to the source, or "none" to clear.' },
    'context-summary': { type: 'string', description: 'One-liner shown in the reminder mail, or "none" to clear.' },
    'reset-reminders': { type: 'boolean', description: 'Reset reminder_count + last_reminder_at without changing remind_at (snooze UX).' },
    json: { type: 'boolean', description: 'JSON output.' },
    endpoint: { type: 'string', description: 'Override tasks endpoint.' },
  },
  async run({ args }) {
    const patch: Record<string, unknown> = {}
    if (typeof args.title === 'string' && args.title) patch.title = args.title
    if (typeof args.status === 'string' && args.status) {
      if (!VALID_STATUS.includes(args.status as TaskStatus)) {
        throw createApiError(400, `Invalid status "${args.status}"`, `Valid: ${VALID_STATUS.join(', ')}.`)
      }
      patch.status = args.status
    }
    const priority = parsePriority(args.priority)
    if (priority !== undefined) patch.priority = priority
    const due = parseDue(args.due)
    if (due !== undefined) patch.due_at = due
    const assignee = parseAssignee(args.assignee)
    if (assignee !== undefined) patch.assignee_email = assignee
    const remindAt = parseRemindAt(args['remind-at'])
    if (remindAt !== undefined) patch.remind_at = remindAt
    const contextUrl = parseTextOrClear(args['context-url'])
    if (contextUrl !== undefined) patch.context_url = contextUrl
    const contextSummary = parseTextOrClear(args['context-summary'])
    if (contextSummary !== undefined) patch.context_summary = contextSummary
    if (typeof args['reminder-max'] === 'string') {
      const n = Number(args['reminder-max'])
      if (Number.isInteger(n) && n >= 0 && n <= 50) patch.reminder_max = n
    }
    if (args['reset-reminders']) patch.reset_reminders = true
    const notes = await resolveNotesInput(args)
    if (notes !== undefined) patch.notes = notes

    if (Object.keys(patch).length === 0) {
      throw createApiError(400, 'No changes', 'Pass at least one field to update.')
    }

    const updated = await apiCall<Task>('PATCH', `/api/tasks/${args.taskId}`, {
      endpoint: args.endpoint,
      body: patch,
    })
    if (args.json) { printJson(updated); return }
    printLine(`updated ${updated.id}`)
  },
})

/**
 * Change status. Shortcuts: `ape-tasks done <id>`, `ape-tasks reopen <id>`.
 *
 * EXAMPLE
 *   $ ape-tasks status 01HXX... doing
 *   01HXX... → doing
 */
export const statusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Change a task status (open|doing|done|archived).',
  },
  args: {
    taskId: { type: 'positional', required: true, description: 'Task ULID.' },
    status: { type: 'positional', required: true, description: 'New status.' },
    endpoint: { type: 'string', description: 'Override tasks endpoint.' },
  },
  async run({ args }) {
    if (!VALID_STATUS.includes(args.status as TaskStatus)) {
      throw createApiError(400, `Invalid status "${args.status}"`, `Valid: ${VALID_STATUS.join(', ')}.`)
    }
    await apiCall('PATCH', `/api/tasks/${args.taskId}`, {
      endpoint: args.endpoint,
      body: { status: args.status },
    })
    printLine(`${args.taskId} → ${args.status}`)
  },
})

/**
 * Mark a task done. Shorthand for `ape-tasks status <id> done`.
 */
export const doneCommand = defineCommand({
  meta: {
    name: 'done',
    description: 'Mark a task done.',
  },
  args: {
    taskId: { type: 'positional', required: true, description: 'Task ULID.' },
    endpoint: { type: 'string', description: 'Override tasks endpoint.' },
  },
  async run({ args }) {
    await apiCall('PATCH', `/api/tasks/${args.taskId}`, {
      endpoint: args.endpoint,
      body: { status: 'done' },
    })
    printLine(`${args.taskId} ✓ done`)
  },
})

/**
 * Move a task back to open. Shorthand for `ape-tasks status <id> open`.
 */
export const reopenCommand = defineCommand({
  meta: {
    name: 'reopen',
    description: 'Move a task back to open.',
  },
  args: {
    taskId: { type: 'positional', required: true, description: 'Task ULID.' },
    endpoint: { type: 'string', description: 'Override tasks endpoint.' },
  },
  async run({ args }) {
    await apiCall('PATCH', `/api/tasks/${args.taskId}`, {
      endpoint: args.endpoint,
      body: { status: 'open' },
    })
    printLine(`${args.taskId} ↻ open`)
  },
})

/**
 * Soft-delete a task. Only team members with editor or owner role can delete.
 *
 * EXAMPLE
 *   $ ape-tasks rm 01HXX...
 *   deleted 01HXX...
 */
export const rmCommand = defineCommand({
  meta: {
    name: 'rm',
    description: 'Soft-delete a task.',
  },
  args: {
    taskId: { type: 'positional', required: true, description: 'Task ULID.' },
    endpoint: { type: 'string', description: 'Override tasks endpoint.' },
  },
  async run({ args }) {
    await apiCall('DELETE', `/api/tasks/${args.taskId}`, { endpoint: args.endpoint })
    printLine(`deleted ${args.taskId}`)
  },
})
