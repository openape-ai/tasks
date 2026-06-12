# Deploy — tested-image Docker on chatty

tasks.openape.ai runs as a Docker container on chatty, following the same
pipeline as the four monorepo web apps (idp/troop/chat/org):

```
pnpm build (.output, native)
  → docker buildx --platform linux/amd64 -f compose/package.Dockerfile (COPY-only)
  → local smoke run (/api/health with dummy env)
  → docker push registry.openape.ai/openape-tasks:prod-<sha>
  → chatty: scp compose/chatty.yml → /home/openape/prod-tasks/docker-compose.yml
            pin TASKS_TAG in /home/openape/prod-tasks/.env (PREV kept for rollback)
            docker compose pull + up
  → external health gate https://tasks.openape.ai/api/health
  → on failure: revert pin + up again
```

## Commands

```bash
pnpm run deploy:image        # local deploy (needs docker login + ssh openape@chatty)
```

The GitHub Actions `Deploy` workflow runs the same script on every main push.

Required GH secrets/vars: `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`,
`REGISTRY_PASSWORD` (push password for user `openape`, source:
`/home/openape/registry/push-credentials.txt` on chatty) and var
`DEPLOY_HOST=chatty.delta-mind.at`.

## Runtime layout on chatty

- `/home/openape/prod-tasks/docker-compose.yml` + `.env` (`TASKS_TAG`,
  `TASKS_TAG_PREV`) — the compose project (`openape-tasks`).
- The container mounts `/home/openape/projects/openape-tasks/shared` at the
  identical path and reads the systemd-era `shared/.env` via `env_file` —
  SQLite (`NUXT_TURSO_URL=file:…/shared/data/tasks.db`) and secrets are
  untouched by deploys. The reminder worker runs in-process as before.
- Port publishes on `127.0.0.1:3005`, exactly where nginx already proxies.
- `user: 999:988` (openape) keeps DB/WAL files openape-owned.

## Rollback

```bash
# automatic: deploy-image.mjs reverts to TASKS_TAG_PREV when the health gate fails
# manual:
ssh openape@chatty.delta-mind.at
cd ~/prod-tasks && sed -i 's/^TASKS_TAG=.*/TASKS_TAG=<known-good>/' .env
docker compose --env-file .env -f docker-compose.yml up -d tasks
```

## Emergency fallback (systemd)

The pre-container unit stays installed but disabled. If the registry or
Docker is broken, the last rsync release on disk still works:

```bash
ssh openape@chatty.delta-mind.at 'cd ~/prod-tasks && docker compose down'
ssh ubuntu@chatty.delta-mind.at 'sudo systemctl start openape-tasks'
```
