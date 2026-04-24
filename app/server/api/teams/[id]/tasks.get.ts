import { and, eq, isNull } from 'drizzle-orm'
import { defineEventHandler, getQuery, getRouterParam } from 'h3'
import { useDb } from '../../../database/drizzle'
import { tasks, teamMembers } from '../../../database/schema'
import { requireCaller } from '../../../utils/require-auth'
import { createProblemError } from '../../../utils/problem'
import { serializeTask, VALID_STATUS, type TaskStatus } from '../../../utils/task-shape'

/**
 * GET /api/teams/:id/tasks — list tasks in a team.
 *
 * Query:
 *   status=open,doing,done,archived  (comma-separated; default: open,doing,done)
 *
 * Ordering: sort_order asc, created_at asc (stable).
 */
export default defineEventHandler(async (event) => {
  const caller = await requireCaller(event)
  const teamId = getRouterParam(event, 'id')
  if (!teamId) throw createProblemError({ status: 400, title: 'Missing team id' })

  const db = useDb()
  const membership = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userEmail, caller.email)))
    .get()
  if (!membership) throw createProblemError({ status: 403, title: 'Not a team member' })

  const { status } = getQuery(event) as { status?: string }
  const requested = status
    ? status.split(',').map(s => s.trim()).filter((s): s is TaskStatus => VALID_STATUS.has(s as TaskStatus))
    : (['open', 'doing', 'done'] as TaskStatus[])

  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.teamId, teamId), isNull(tasks.deletedAt)))
    .all()

  const filtered = rows.filter(r => requested.includes(r.status))
  filtered.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.createdAt - b.createdAt
  })

  return filtered.map(serializeTask)
})
