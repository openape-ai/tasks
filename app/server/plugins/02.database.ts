import { sql } from 'drizzle-orm'
import { useDb } from '../database/drizzle'

export default defineNitroPlugin(async () => {
  if (process.env.OPENAPE_E2E === '1') return

  try {
    const db = useDb()

    await db.run(sql`CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      archived_at INTEGER
    )`)
    // In-place add for pre-existing rows created under v0.1. Ignore if the
    // column is already there — sqlite has no IF NOT EXISTS for columns.
    try { await db.run(sql`ALTER TABLE teams ADD COLUMN archived_at INTEGER`) }
    catch { /* column already present */ }

    await db.run(sql`CREATE TABLE IF NOT EXISTS team_members (
      team_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      role TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (team_id, user_email)
    )`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_tm_email ON team_members(user_email)`)

    await db.run(sql`CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT,
      due_at INTEGER,
      assignee_email TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      owner_email TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      updated_by TEXT NOT NULL,
      completed_at INTEGER,
      deleted_at INTEGER
    )`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_id)`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_tasks_team_status ON tasks(team_id, status)`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_email)`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks(updated_at)`)

    await db.run(sql`CREATE TABLE IF NOT EXISTS team_invites (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      note TEXT,
      max_uses INTEGER NOT NULL DEFAULT 5,
      used_count INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      created_at INTEGER NOT NULL
    )`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_ti_team ON team_invites(team_id)`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_ti_active ON team_invites(revoked_at, expires_at)`)
  }
  catch (err) {
    console.error('[database] Table creation failed (tables may already exist):', err)
  }
})
