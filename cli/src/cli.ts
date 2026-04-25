import { defineCommand, runMain } from 'citty'
import { loginCommand } from './commands/login.ts'
import { logoutCommand } from './commands/logout.ts'
import { whoamiCommand } from './commands/whoami.ts'
import { teamsCommand } from './commands/teams.ts'
import { acceptCommand } from './commands/accept.ts'
import {
  listCommand,
  showCommand,
  newCommand,
  editCommand,
  statusCommand,
  doneCommand,
  reopenCommand,
  rmCommand,
} from './commands/tasks.ts'
import { docsCommand } from './commands/docs.ts'
import { openCommand } from './commands/open.ts'
import { error } from './output.ts'

const main = defineCommand({
  meta: {
    name: 'ape-tasks',
    version: '1.1.0',
    description: [
      'Shared task lists for humans and AI agents — persisted across devices and sessions.',
      '',
      'First time? `apes login <email>` once on this device. ape-tasks uses the',
      'unified apes session — same login covers ape-plans and any future OpenApe CLI.',
      'Agent reference: `ape-tasks docs agent`. Skill for Claude Code: see',
      'https://github.com/openape-ai/tasks/blob/main/skills/ape-tasks/SKILL.md.',
    ].join('\n'),
  },
  subCommands: {
    login: loginCommand,
    logout: logoutCommand,
    whoami: whoamiCommand,
    teams: teamsCommand,
    accept: acceptCommand,
    list: listCommand,
    show: showCommand,
    new: newCommand,
    edit: editCommand,
    status: statusCommand,
    done: doneCommand,
    reopen: reopenCommand,
    rm: rmCommand,
    open: openCommand,
    docs: docsCommand,
  },
})

process.on('unhandledRejection', (err: unknown) => {
  handleError(err)
  process.exit(1)
})

try {
  await runMain(main)
}
catch (err) {
  handleError(err)
  process.exit(1)
}

function handleError(err: unknown): void {
  if (err && typeof err === 'object') {
    const e = err as { title?: string, detail?: string, message?: string, status?: number }
    const header = e.title ?? e.message ?? 'Unknown error'
    error(e.status ? `${header} (${e.status})` : header)
    if (e.detail) error(e.detail)
    return
  }
  error(String(err))
}
