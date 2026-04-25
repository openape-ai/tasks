import { and, eq, isNull } from 'drizzle-orm'
import { defineEventHandler, getRouterParam, readBody, setResponseStatus } from 'h3'
import { ulid } from 'ulid'
import { useDb } from '../../../database/drizzle'
import { tasks, teamMembers } from '../../../database/schema'
import { requireCaller } from '../../../utils/require-auth'
import { createProblemError } from '../../../utils/problem'
import {
  serializeTask,
  VALID_PRIORITY,
  VALID_STATUS,
  type TaskPriority,
  type TaskStatus,
} from '../../../utils/task-shape'

interface CreateBody {
  title?: string
  notes?: string
  status?: string
  priority?: string
  due_at?: number | null
  assignee_email?: string | null
  remind_at?: number | null
  reminder_max?: number
  context_url?: string | null
  context_summary?: string | null
}

/**
 * POST /api/teams/:id/tasks — create a task. Viewer role may not create.
 *
 * Body: { title (required), notes?, status?, priority?, due_at?, assignee_email? }
 */
export default defineEventHandler(async (event) => {
  const caller = await requireCaller(event)
  const teamId = getRouterParam(event, 'id')
  if (!teamId) throw createProblemError({ status: 400, title: 'Missing team id' })

  const body = await readBody<CreateBody>(event)
  const title = body?.title?.trim()
  if (!title || title.length > 200) {
    throw createProblemError({ status: 400, title: 'title must be 1–200 chars' })
  }

  const status = (body?.status ?? 'open') as TaskStatus
  if (!VALID_STATUS.has(status)) {
    throw createProblemError({ status: 400, title: 'invalid status' })
  }

  let priority: TaskPriority | null = null
  if (body?.priority != null && body.priority !== '') {
    if (!VALID_PRIORITY.has(body.priority as TaskPriority)) {
      throw createProblemError({ status: 400, title: 'invalid priority' })
    }
    priority = body.priority as TaskPriority
  }

  const dueAt = typeof body?.due_at === 'number' ? body.due_at : null
  const assigneeEmail = body?.assignee_email?.trim() || null

  const now0 = Math.floor(Date.now() / 1000)
  const remindAt = typeof body?.remind_at === 'number' ? body.remind_at : null
  if (remindAt !== null && remindAt < now0 - 60) {
    // Allow up to a minute of clock skew; reject anything substantially in the past.
    throw createProblemError({ status: 400, title: 'remind_at must be in the future' })
  }
  const reminderMax = (typeof body?.reminder_max === 'number' && body.reminder_max >= 0 && body.reminder_max <= 50)
    ? Math.floor(body.reminder_max)
    : 5
  const contextUrl = body?.context_url?.trim() || null
  if (contextUrl && contextUrl.length > 2048) {
    throw createProblemError({ status: 400, title: 'context_url must be ≤ 2048 chars' })
  }
  const contextSummary = body?.context_summary?.trim() || null
  if (contextSummary && contextSummary.length > 1000) {
    throw createProblemError({ status: 400, title: 'context_summary must be ≤ 1000 chars' })
  }

  const db = useDb()
  const membership = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userEmail, caller.email)))
    .get()
  if (!membership) throw createProblemError({ status: 403, title: 'Not a team member' })
  if (membership.role === 'viewer') {
    throw createProblemError({ status: 403, title: 'Viewers cannot create tasks' })
  }

  // Append to end: sort_order = max(sort_order) + 1 for non-done tasks in this team.
  const existing = await db
    .select({ sortOrder: tasks.sortOrder })
    .from(tasks)
    .where(and(eq(tasks.teamId, teamId), isNull(tasks.deletedAt)))
    .all()
  const maxOrder = existing.reduce((m, t) => (t.sortOrder > m ? t.sortOrder : m), 0)
  const sortOrder = maxOrder + 1

  const now = Math.floor(Date.now() / 1000)
  const id = ulid()
  await db.insert(tasks).values({
    id,
    teamId,
    title,
    notes: body?.notes ?? '',
    status,
    priority,
    dueAt,
    assigneeEmail,
    sortOrder,
    remindAt,
    reminderMax,
    contextUrl,
    contextSummary,
    ownerEmail: caller.email,
    createdAt: now,
    updatedAt: now,
    updatedBy: caller.email,
    completedAt: status === 'done' ? now : null,
  })

  const row = await db.select().from(tasks).where(eq(tasks.id, id)).get()
  if (!row) throw createProblemError({ status: 500, title: 'Task disappeared after insert' })

  setResponseStatus(event, 201)
  return serializeTask(row)
})
