import { defineCommand } from 'citty'
import agent from '../docs/agent.md'
import auth from '../docs/auth.md'
import cli from '../docs/cli.md'
import errors from '../docs/errors.md'
import invites from '../docs/invites.md'
import tasks from '../docs/tasks.md'
import teams from '../docs/teams.md'
import { printLine } from '../output.ts'

const DOCS: Record<string, string> = {
  agent,
  auth,
  cli,
  errors,
  invites,
  tasks,
  teams,
}

/**
 * Print full documentation. Useful for agents that need the reference without
 * web access.
 *
 * EXAMPLES
 *   $ ape-tasks docs                # lists topics
 *   $ ape-tasks docs agent          # full agent-focused reference
 *   $ ape-tasks docs tasks          # task commands + data shape
 */
export const docsCommand = defineCommand({
  meta: {
    name: 'docs',
    description: 'Print documentation. Topics: agent, auth, cli, errors, invites, tasks, teams.',
  },
  args: {
    topic: { type: 'positional', required: false, description: 'Topic name. Omit to list topics.' },
  },
  async run({ args }) {
    if (!args.topic) {
      printLine('Available topics:')
      for (const key of Object.keys(DOCS).sort()) printLine(`  ${key}`)
      printLine('')
      printLine('Example: `ape-tasks docs agent`')
      return
    }
    const doc = DOCS[args.topic.toLowerCase()]
    if (!doc) {
      printLine(`No such topic "${args.topic}". Available: ${Object.keys(DOCS).sort().join(', ')}.`)
      process.exit(1)
    }
    process.stdout.write(doc.endsWith('\n') ? doc : `${doc}\n`)
  },
})
