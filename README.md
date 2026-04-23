# OpenApe Tasks

Shared task lists for humans **and AI agents**. Persistent task lists
across devices and conversations, shared per team.

> _"Everyone needs structure. Even binary brains."_

- **Webapp** — mobile-first Nuxt SPA ([tasks.openape.ai](https://tasks.openape.ai))
- **CLI** — `@openape/ape-tasks`, agent-first with verbose `--help`
- **Auth** — [DDISA](https://openape.ai) decentralized identity discovery
- **Data** — SQLite + Drizzle, local to the deploy host
- **License** — MIT

---

## Why

You work with multiple AI agents across multiple devices. A task list
started in a conversation on one laptop needs to be readable and
actionable from the phone, from another laptop, or from an agent in a
completely different session. Local todo files do not bridge that gap.

Tasks live here, on a server you control, behind DDISA auth. Humans use
the webapp; agents use the CLI; both see the same list.

---

## Features

- **Teams as sharing boundary.** A task belongs to exactly one team. All
  members see and (by default) edit.
- **Signed-JWT invite URLs.** Generate a link in the webapp or CLI, share it,
  recipient joins after DDISA login. Agents can invite other agents.
- **Mobile-first webapp.** Triage and check off tasks from a phone;
  safe-area-aware FAB / sticky save bar.
- **Verbose agent CLI.** Every subcommand's `--help` carries a full example.
  `ape-tasks docs <topic>` prints an embedded reference without internet
  access.

---

## Quickstart (CLI)

```bash
npm i -g @openape/ape-tasks
ape-tasks login you@example.com        # paste the token from {endpoint}/cli-login
ape-tasks teams --json
ape-tasks new --team 01HXX... --title "Ship the thing"
ape-tasks list --team 01HXX... --status open
ape-tasks done 01HXX...
```

See [`docs/agent.md`](./docs/agent.md) for agent-focused workflows.

## Quickstart (Web)

1. Open [tasks.openape.ai](https://tasks.openape.ai) on your phone or laptop.
2. Sign in with your email — DDISA resolves the right identity provider.
3. Create a team, invite others with a signed URL, and start adding tasks.

## Self-host

```bash
git clone https://github.com/openape-ai/tasks && cd tasks
pnpm install
pnpm --filter @openape-tasks/app dev
```

For production: see [`docs/deploy.md`](./docs/deploy.md) — host-agnostic
`scripts/deploy.sh` + GitHub Actions auto-deploy over SSH.

## Docs

| Topic | File |
|-------|------|
| **Claude Code skill** (recommended for agents) | [`skills/ape-tasks/SKILL.md`](./skills/ape-tasks/SKILL.md) |
| Agent workflows | [`docs/agent.md`](./docs/agent.md) |
| Operator deploy guide | [`docs/deploy.md`](./docs/deploy.md) |
| CLI reference (also inline: `ape-tasks docs cli`) | [`cli/src/docs/cli.md`](./cli/src/docs/cli.md) |
| Claude Code onboarding snippet | [`docs/claude-example.md`](./docs/claude-example.md) |

### Claude Code skill

Install the skill so fresh Claude sessions auto-discover `ape-tasks`:

```bash
# clone once
git clone https://github.com/openape-ai/tasks ~/Dev/openape-tasks
# symlink into Claude's skills directory
mkdir -p ~/.claude/skills
ln -s ~/Dev/openape-tasks/skills/ape-tasks ~/.claude/skills/ape-tasks
```

Next session, Claude picks it up automatically when the task involves
shared task tracking — cross-device, multi-agent, or just a list you
want to survive the conversation.

## Project layout

```
openape-tasks/
├─ app/                    Nuxt 4 webapp + Nitro API
│  ├─ server/api/           REST endpoints (teams, tasks, invites, cli)
│  ├─ server/database/      Drizzle schema + libsql
│  ├─ server/utils/         require-auth, invite-jwt, cli-token, problem
│  └─ app/pages/            Login, teams, tasks, invite, cli-login
├─ cli/                    @openape/ape-tasks — citty + tsup
│  └─ src/
│     ├─ commands/          login, teams, accept, list/show/new/edit/status/done/reopen/rm, docs
│     └─ docs/              Embedded Markdown references printed by `ape-tasks docs`
├─ scripts/
│  ├─ deploy.sh             Host-agnostic deploy (env-driven)
│  └─ server-setup.sh       One-shot root setup on a fresh host
├─ .github/workflows/
│  ├─ ci.yml                typecheck + build (PRs + main)
│  └─ deploy.yml            auto-deploy on main push w/ rollback
└─ docs/
```

## Contributing

Patches welcome. Open a PR with a concise conventional-commit message.

## License

[MIT](./LICENSE)
