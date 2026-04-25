# Changelog

All notable changes to `@openape/ape-tasks` (CLI) and the `tasks.openape.ai` app are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com).

## [CLI 1.0.0] — 2026-04-25

### BREAKING — unified login via `apes`

- **`ape-tasks login` is gone.** Auth is now shared with every other OpenApe CLI (ape-plans, upcoming ape-secrets / ape-seeds) via `@openape/cli-auth`. Run `apes login <email>` **once** on a device; `ape-tasks` works from then on.
- **`ape-tasks login` is a stub** that prints the migration hint and exits 1.
- **`ape-tasks logout`** now clears the cached SP-token at `~/.config/apes/sp-tokens/tasks.openape.ai.json`. Pass `--legacy` to also delete the pre-1.0 `~/.openape/auth-tasks.json` file.
- Pre-1.0 `~/.openape/auth-tasks.json` files are no longer read.

### How it works under the hood

- New dependency: `@openape/cli-auth@^0.2.3`.
- API calls go through `getAuthorizedBearer`: cached SP-token if valid (60 s skew), otherwise refresh IdP token via OIDC and exchange it at `${endpoint}/api/cli/exchange` (the endpoint added in [PR #6](https://github.com/openape-ai/tasks/pull/6)) for a 30-day SP-scoped token.
- The exchange endpoint verifies the IdP token via JWKS against `id.openape.ai` with `expectedAud='apes-cli'`.

### Migration

```bash
# Old (still works on 0.x):
ape-tasks login patrick@example.com
# New (1.0+):
apes login patrick@example.com
ape-tasks list   # works
```

If you have an `~/.openape/auth-tasks.json` from before:
```bash
ape-tasks logout --legacy
```

## [CLI 0.1.1] — 2026-04-24

- **`login --token <value>`** — pass the CLI token directly instead of the
  interactive prompt. Useful for scripts, agents, and CI smoke tests.
  (Piped stdin and the interactive prompt still work — `--token` is just the
  third equivalent input path.)
- **Better 401 error on login:** the verify step now points at the exact
  endpoint it hit and suggests regenerating the token at `{endpoint}/cli-login`,
  instead of only surfacing the bare server message.

## [CLI 0.1.0] — 2026-04-24

Initial public release of `@openape/ape-tasks`, the CLI companion to `tasks.openape.ai`.

### Commands

- **Auth:** `login`, `logout`, `whoami`.
- **Lists (teams):** `teams`, `teams show`, `teams new`, `teams use`, `teams update`, `teams archive|unarchive|rm`, `teams invite`, `teams invites`, `teams revoke-invite`. Invite-accept via `accept <url-or-token>`.
- **Tasks:** `list`, `show`, `new`, `edit`, `status`, `done`, `reopen`, `rm`, `open`.
- **Docs:** `docs [agent|auth|cli|errors|invites|tasks|teams]` prints embedded Markdown for offline agent consumption.

### Task fields

`new` and `edit` accept `--title`, `--notes` (inline / stdin / file), `--status` (`open|doing|done|archived`), `--priority` (`low|med|high` or `none`), `--due` (ISO 8601 or shorthand `+2h`/`+1d`/`+30m`/`+2w`, or `none`), `--assignee <email>` (or `none`). All optional fields support `none`/empty string to clear.

### Conventions

- `--json` on every read command for agent-scriptable output.
- `--id-only` on create commands for pipe-friendly scripting.
- `--endpoint <url>` / `APE_TASKS_ENDPOINT` env var override the default.
- Token stored at `~/.openape/auth-tasks.json` (chmod 600).

## [App 0.2.0] — 2026-04-24

### Webapp

- **Task board (Apple-Reminders style):** replaces the Markdown plan surface. Orange circle checkbox toggles done; tap the title opens a sheet with title/notes/due/priority/assignee/delete; completed section collapsed below; members + invite links moved to footer sections.
- **List settings:** owner-only `···` menu in the sticky header → rename, description, delete list (cascade via `?force=true`).
- **My Lists:** list-of-lists view shows open-task count per list.

### Schema

- `plans` table → `tasks` (`status: open|doing|done|archived`, `priority`, `due_at`, `assignee_email`, `sort_order`, `completed_at`, `notes`).
- New indexes: `idx_tasks_team_status`, `idx_tasks_assignee`.

### API

- Removed `/api/plans/*` and `/api/teams/:id/plans.*`.
- Added `/api/teams/:id/tasks` (GET with `?status=` filter, POST), `/api/tasks/:id` (GET/PATCH/DELETE).
- `/api/teams` returns `open_task_count` + `total_task_count`; `/api/teams/:id` returns `task_count: {open, doing, done, archived, total}`.
- `DELETE /api/teams/:id?force=true` cascade-soft-deletes tasks.

## [App 0.1.0] — 2026-04-24

Initial scaffold — forked from `openape-plans`, retooled for task-list semantics.

- Web app at `tasks.openape.ai` — shared task lists for humans + agents, team-based.
- Hero landing page with tagline *"Everyone needs structure. Even binary brains."*, orange/zinc theme, dark-mode default.
- DDISA login via `@openape/nuxt-auth-sp`; 30-day CLI token at `/cli-login`.
- Signed-JWT invite URLs (rate-limited, revokable).
- Host-agnostic deploy: chatty systemd `openape-tasks.service` on :3005, auto-deploy on main push.
