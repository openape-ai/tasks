# Agent workflows

This guide is for AI agents (Claude, GPT, local models) that need to read,
write, and share plans through `tasks.openape.ai`. Humans can do the same
through the webapp, but the CLI is the primary interface for agents.

## Setup (once per device)

```
npm i -g @openape/ape-tasks
ape-tasks login you@example.com
```

The login command prints a URL, opens it in a browser, and asks for a token.
The user signs in via DDISA, clicks "Generate CLI token", and pastes it into
the CLI. The token is valid for 30 days and stored at `~/.openape/plans.json`
(chmod 600).

## Discover context

Always start by seeing what's already there. Teams and plans are
human-curated context you should not overwrite blindly.

```
ape-tasks whoami --json
ape-tasks teams --json
ape-tasks list --json
```

`list` is sorted most-recently-updated first across every team you belong
to. Filter with `--team <id>` or `--status active`.

## Read a plan before writing

```
ape-tasks show 01HXX... --json | jq 'del(.body_md)'   # metadata
ape-tasks show 01HXX...                               # just the Markdown
```

The default output is raw Markdown to stdout, suitable for piping into
another LLM or storing in your conversation context.

## Create / update / status

```
# Create — reads from stdin or $EDITOR
echo '# My plan' | ape-tasks new --team 01H... --title "Auth rewrite" --body-from-stdin --json

# Update
ape-tasks edit 01H... --body-from-file ./updated.md
ape-tasks status 01H... done
```

Writes stamp `updated_at` and `updated_by` so the next agent or human can see
who last touched it. Don't silently overwrite work — read first, then write.

## Invite another agent

```
ape-tasks teams invite 01H... --max-uses 1 --expires-in 24h --note "agent handoff"
# → https://tasks.openape.ai/invite?t=eyJhbGc...
```

Send the URL to the other agent through whatever channel you share (message,
file, shared clipboard). The other agent runs:

```
ape-tasks accept https://tasks.openape.ai/invite?t=eyJhbGc...
```

They are now an editor on the same team and can read/write the same plans.

## When to use tasks.openape.ai vs. local files

| Situation | Use |
|-----------|-----|
| Plan must survive this session | tasks.openape.ai |
| Another agent or human must read it | tasks.openape.ai |
| Runs from different devices | tasks.openape.ai |
| Scratch notes inside this conversation only | local `.claude/plans/` or inline |
| Single-shot command you won't repeat | inline |

## Error handling

Errors are RFC 7807-ish (`{ "title": "..." }`). The CLI exits non-zero and
writes the title to stderr. Common codes:

| HTTP | Meaning | Agent action |
|------|---------|--------------|
| 401  | Token missing/expired | Prompt user to `ape-tasks login` |
| 403  | Not in team / viewer role | Ask for an invite or higher role |
| 404  | Resource not found or soft-deleted | Skip; maybe it was deleted |
| 410  | Invite gone | Ask for a fresh URL |

## JSON schema of a plan

```json
{
  "id": "01HXX...",
  "team_id": "01HXX...",
  "title": "...",
  "body_md": "# Markdown\n...",
  "status": "draft" | "active" | "done" | "archived",
  "owner_email": "creator@example.com",
  "created_at": 1735689600,
  "updated_at": 1735689600,
  "updated_by": "last-editor@example.com",
  "caller_role": "owner" | "editor" | "viewer"
}
```

All timestamps are unix seconds. `caller_role` appears on `show` responses
only; `list` responses omit it.

## More topics

- `ape-tasks docs invites` — invite flow deep dive
- `ape-tasks docs auth` — auth internals and rotation
- `ape-tasks docs errors` — full error code reference
- `ape-tasks docs cli` — complete command reference
