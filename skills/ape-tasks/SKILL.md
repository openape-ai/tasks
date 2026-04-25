---
name: ape-tasks
description: Use for any non-trivial task that benefits from a written plan — single-session local work, multi-session projects, multi-device work, and anything another agent or human will later read. Plans live on tasks.openape.ai via the `ape-tasks` CLI and act as living documents the harness updates while the work progresses. Writing style is self-contained and newbie-readable so the plan can be executed by someone (human or agent) without prior context.
---

# ape-tasks — the default planning surface

Use this skill whenever the work has any of the following:

- **More than ~30 minutes of mental state** that would be lost between sessions or hand-offs.
- **Multiple steps** where getting them out of order is costly.
- **Unknowns** worth listing before attempting (risks, prerequisites, open questions).
- **Another reader** — a future session, another agent, the human on their phone.
- **Experiments whose outcome you want to remember** even after the code is gone.

This covers **almost all real engineering work**. Write-the-plan-first is the default, not the exception.

`.claude/plans/<name>.md` on disk is still fine for one-shot scratch notes inside a single conversation that you intend to throw away. For anything else, use the CLI — it persists across devices, across agents, and is versionable from the web UI.

## The discipline (this is the part that actually matters)

**A plan is a living document.** Not a one-shot writeup. The harness (you, during this session) is expected to:

1. **Create the plan up-front**, before implementation, with enough detail that a total stranger could execute it.
2. **Mark progress as you go** using `ape-tasks edit --replace-section "## Progress"` — check off milestones, add timestamps.
3. **Append discoveries** as you find them — via `ape-tasks edit --append-body` or a dedicated `## Surprises & Discoveries` section. Non-obvious facts. Evidence (actual error messages, curl output, test names).
4. **Record decisions** in a `## Decision Log` table — what you chose, why, what you rejected. Future you (or the next agent) should not have to re-debate these.
5. **End each session** by leaving the plan in a state another agent could pick up cleanly. If you made a partial change, note exactly what is half-done.

The CLI commands that make this cheap:

```
ape-tasks show <id>                                     # read it back
ape-tasks edit <id> --append-body --body-from-stdin     # add a new block
ape-tasks edit <id> --replace-section "## Progress" --body-from-stdin   # tick off
ape-tasks status <id> active                            # mark in-flight
ape-tasks status <id> done                              # wrap up
```

A plan nobody updates dies. Keep it alive while you work — it costs <10 seconds per checkpoint and saves hours when someone else (including future-you) has to resume.

## Writing style — newbie-readable, self-contained

Anyone (human or agent) should be able to open the plan, read top-to-bottom, and produce a working result. That means:

- **State the goal in user-visible terms** first — what the user can do after that they couldn't before. *Not* "refactor X" but "user clicks Login and is redirected to the IdP".
- **Every file path is repo-relative and exact** — `app/server/api/teams/[id].patch.ts`, not "the team patch endpoint".
- **Every command is literally runnable** — `pnpm --filter @openape-tasks/app build`, not "run the build".
- **Every acceptance criterion is observable** — `curl -fsS https://id.openape.ai/api/me` returns `401`, not "the auth endpoint works".
- **No implicit knowledge.** If the plan assumes the reader knows what "chatty" is, put one sentence explaining it inline. Strangers read plans; strangers don't know your in-house jargon.
- **Prerequisites listed explicitly** — env vars, secrets, DNS records, package versions. Check them off before milestones.
- **Each milestone is independently testable.** Pattern: **Goal → Steps → Proof**. No milestone is "done" without a reproducible proof command.
- **Risks section with mitigations** — not "could break" but "breaking change if X happens; mitigation: Y".
- **End with an E2E verification block** — the sequence of commands that proves the whole thing works end-to-end.

If you're an agent, use the existing Patrick-template style as reference — see `~/TASKS-TEMPLATE.md` for a long-form example, and look at existing plans on tasks.openape.ai for real examples to imitate.

## When to use — decision table

| Situation | Use this skill? | Notes |
|-----------|:---------------:|-------|
| User asks for a plan for anything non-trivial | **Yes** | Default — propose it and create the plan on tasks.openape.ai |
| Multi-session project | **Yes** | Session-handoff is the strongest reason to use this |
| One-shot command-line task (<10 min) | No | Just do it. Planning overhead > task |
| Cross-device work (laptop + phone + another machine) | **Yes** | Only this skill persists that far |
| Another agent will continue | **Yes** | Invite them via `ape-tasks teams invite` |
| Refactor affecting >1 file | **Yes** | Milestones prevent rabbit-holes |
| Bug fix, ~localized | Usually no | Unless it reveals architecture questions worth recording |
| Throwaway experiment | No, unless you want to remember the outcome | `.claude/plans/` local file is fine |

## CLI cheatsheet (minimum useful subset)

```
# Install once
npm i -g @openape/apes @openape/ape-tasks

# Login once per device (covers ape-tasks, ape-plans, all OpenApe CLIs)
apes login you@example.com               # DDISA via id.openape.ai

# Discover existing plans first — never start fresh if one might already exist
ape-tasks whoami --json
ape-tasks teams                          # `*` marks your default team
ape-tasks teams use <team-id>            # set a default so you don't repeat --team
ape-tasks list --json                    # all plans you can see
ape-tasks list --status active           # what's in flight

# Read before writing — never overwrite someone else's work silently
ape-tasks show <plan-id>                 # Markdown body to stdout
ape-tasks show <plan-id> --json          # full object incl updated_by

# Create
ape-tasks new --title "..." --body-from-stdin <<'EOF'
# Goal
...
EOF
# (uses active team; or pass --team <id>. Add --id-only for scripts.)

# Update — living-document discipline
ape-tasks edit <id> --append-body --body-from-stdin <<<"
## Surprises
- Discovered X; evidence: <paste actual output>"
ape-tasks edit <id> --replace-section "## Progress" --body-from-stdin <<'EOF'
- [x] M1 — done 2026-04-22
- [ ] M2 — next
EOF
ape-tasks status <id> active
ape-tasks status <id> done

# Share
ape-tasks teams invite <team-id> --max-uses 1 --expires-in 24h
ape-tasks accept <url-or-token>          # on the receiving side

# Browse (humans)
ape-tasks open <id>                      # opens the web view

# Full reference
ape-tasks docs agent
ape-tasks <cmd> --help
```

## Common pitfalls to avoid

- **Silent overwrite.** `ape-tasks edit --body-from-file` replaces the whole body. If someone else edited since you last read, their work is gone. Prefer `--append-body` / `--replace-section` for incremental updates, or `show --json` first to verify `updated_at`/`updated_by`.
- **Letting the plan rot.** If the plan says M2 is pending but you've already finished M2 in code, the plan lies. Update it before moving on, not at the end.
- **Webapp-only edits.** You can edit in the browser, but then agents don't see the update until they re-fetch. Prefer the CLI so both surfaces are in sync.
- **Implicit context.** "Deploy is broken" is not actionable. "After `./scripts/deploy.sh`, `curl https://id.openape.ai/api/me` returns 502; journalctl shows `no such table: users`" is.
- **Too many plans.** One plan per project, not per PR. Use the `## Progress` section to track within.

## How this skill relates to other surfaces

- `ape-tasks docs agent` — static Markdown reference (JSON schemas, error codes). This skill tells you *when* to use the CLI; the docs tell you *how* each command behaves.
- `ape-tasks --help` — per-command flags + one example. Read when you need the exact syntax.
- `~/TASKS-TEMPLATE.md` — long-form writing template. Use as starting point for non-trivial plans.
- `.claude/plans/<name>.md` — local throwaway. Not cross-session, not searchable by others.

Start by reading the plans that already exist on the server — `ape-tasks list --json`. If one matches the task at hand, continue it. Don't fork silently.
