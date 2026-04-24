import { and, eq, isNull } from 'drizzle-orm'
import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { useDb } from '../../database/drizzle'
import { tasks, teamMembers } from '../../database/schema'
import { requireCaller } from '../../utils/require-auth'
import { createProblemError } from '../../utils/problem'
import {
  serializeTask,
  VALID_PRIORITY,
  VALID_STATUS,
  type TaskPriority,
  type TaskStatus,
} from '../../utils/task-shape'

interface PatchBody {
  title?: string
  notes?: string
  status?: string
  priority?: string | null
  due_at?: number | null
  assignee_email?: string | null
  sort_order?: number
}

type TaskPatch = Partial<{
  title: string
  notes: string
  status: TaskStatus
  priority: TaskPriority | null
  dueAt: number | null
  assigneeEmail: string | null
  sortOrder: number
  completedAt: number | null
}>

/**
 * PATCH /api/tasks/:id — update fields. Viewers cannot edit.
 *
 * Status change to/from 'done' also updates completed_at.
 */
export default defineEventHandler(async (event) => {
  const caller = await requireCaller(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createProblemError({ status: 400, title: 'Missing task id' })

  const body = await readBody<PatchBody>(event)
  const patch: TaskPatch = {}

  if (body.title !== undefined) {
    const t = body.title.trim()
    if (!t || t.length > 200) throw createProblemError({ status: 400, title: 'title must be 1–200 chars' })
    patch.title = t
  }
  if (body.notes !== undefined) patch.notes = body.notes
  if (body.status !== undefined) {
    if (!VALID_STATUS.has(body.status as TaskStatus)) {
      throw createProblemError({ status: 400, title: 'invalid status' })
    }
    patch.status = body.status as TaskStatus
  }
  if (body.priority !== undefined) {
    if (body.priority === null || body.priority === '') {
      patch.priority = null
    }
    else if (VALID_PRIORITY.has(body.priority as TaskPriority)) {
      patch.priority = body.priority as TaskPriority
    }
    else {
      throw createProblemError({ status: 400, title: 'invalid priority' })
    }
  }
  if (body.due_at !== undefined) patch.dueAt = body.due_at
  if (body.assignee_email !== undefined) {
    patch.assigneeEmail = body.assignee_email?.trim() || null
  }
  if (body.sort_order !== undefined && Number.isInteger(body.sort_order)) {
    patch.sortOrder = body.sort_order
  }

  if (Object.keys(patch).length === 0) {
    throw createProblemError({ status: 400, title: 'No fields to update' })
  }

  const db = useDb()
  const task = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
    .get()
  if (!task) throw createProblemError({ status: 404, title: 'Task not found' })

  const membership = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, task.teamId), eq(teamMembers.userEmail, caller.email)))
    .get()
  if (!membership) throw createProblemError({ status: 403, title: 'Not a team member' })
  if (membership.role === 'viewer') throw createProblemError({ status: 403, title: 'Viewers cannot edit tasks' })

  const now = Math.floor(Date.now() / 1000)
  if (patch.status !== undefined) {
    if (patch.status === 'done' && task.status !== 'done') patch.completedAt = now
    if (patch.status !== 'done' && task.status === 'done') patch.completedAt = null
  }

  await db
    .update(tasks)
    .set({ ...patch, updatedAt: now, updatedBy: caller.email })
    .where(eq(tasks.id, id))
    .run()

  const updated = await db.select().from(tasks).where(eq(tasks.id, id)).get()
  if (!updated) throw createProblemError({ status: 500, title: 'Task disappeared after update' })

  return serializeTask(updated)
})
