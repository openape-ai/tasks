import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull(),
  archivedAt: integer('archived_at'),
})

export const teamMembers = sqliteTable('team_members', {
  teamId: text('team_id').notNull(),
  userEmail: text('user_email').notNull(),
  role: text('role', { enum: ['owner', 'editor', 'viewer'] }).notNull(),
  joinedAt: integer('joined_at').notNull(),
}, t => [
  primaryKey({ columns: [t.teamId, t.userEmail] }),
  index('idx_tm_email').on(t.userEmail),
])

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull(),
  title: text('title').notNull(),
  notes: text('notes').notNull().default(''),
  status: text('status', { enum: ['open', 'doing', 'done', 'archived'] }).notNull().default('open'),
  priority: text('priority', { enum: ['low', 'med', 'high'] }),
  dueAt: integer('due_at'),
  assigneeEmail: text('assignee_email'),
  sortOrder: integer('sort_order').notNull().default(0),
  // Reminder / Wiedervorlage. `remindAt` triggers the worker to email the
  // assignee; if the task stays open past `lastReminderAt + 24h`, it
  // escalates with another mail until `reminderCount == reminderMax`.
  // `contextUrl` / `contextSummary` are presentation-only — typically a
  // deep-link back to the source (e.g. an Outlook web URL for a triaged mail).
  remindAt: integer('remind_at'),
  reminderCount: integer('reminder_count').notNull().default(0),
  lastReminderAt: integer('last_reminder_at'),
  reminderMax: integer('reminder_max').notNull().default(5),
  contextUrl: text('context_url'),
  contextSummary: text('context_summary'),
  ownerEmail: text('owner_email').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  updatedBy: text('updated_by').notNull(),
  completedAt: integer('completed_at'),
  deletedAt: integer('deleted_at'),
}, t => [
  index('idx_tasks_team').on(t.teamId),
  index('idx_tasks_team_status').on(t.teamId, t.status),
  index('idx_tasks_assignee').on(t.assigneeEmail),
  index('idx_tasks_updated').on(t.updatedAt),
  // Hot index for the reminder worker — only rows with `remind_at` set.
  index('idx_tasks_remind_at').on(t.remindAt),
])

export const teamInvites = sqliteTable('team_invites', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull(),
  createdBy: text('created_by').notNull(),
  note: text('note'),
  maxUses: integer('max_uses').notNull().default(5),
  usedCount: integer('used_count').notNull().default(0),
  expiresAt: integer('expires_at').notNull(),
  revokedAt: integer('revoked_at'),
  createdAt: integer('created_at').notNull(),
}, t => [
  index('idx_ti_team').on(t.teamId),
  index('idx_ti_active').on(t.revokedAt, t.expiresAt),
])
