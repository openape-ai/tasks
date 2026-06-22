# Plan: ape-tasks M3 — Lanes (Trello-light) + Teams

> Self-contained. Ein Agent/Mensch ohne Vorwissen kann das von oben nach unten umsetzen.
> Maßgebliche Spec: `~/.claude/plans/2026-06-22-auto-code-skill-spec.md` (M3). Dieser Plan
> ist der Umsetzungs-Plan für das `openape-tasks`-Repo.

## Purpose / Big Picture

`ape-tasks` (tasks.openape.ai) bekommt **konfigurierbare Lanes** (Spalten) pro Board — die
fehlende Trello-light-Achse. Damit kann der spätere **auto-code-Loop** (M2) ape-tasks als
Task-Quelle nutzen: das „actionable"-Gate = *eine bestimmte Lane + Assignee*, „in Arbeit"/
„eskaliert" = Lane-Move (analog zu IURIOs „Sprint-Todos + assignedUser").

- **Ziel (user-sichtbar):**
  - Im Web (Handy): ein Board zeigt seine Tasks in **Lane-Tabs** (z. B. `Backlog · Ready ·
    Doing · Review · Done`); man wechselt die Lane oben, sieht darunter die vertikale
    Task-Liste, und verschiebt einen Task per Lane-Auswahl im Edit-Sheet. Abhaken (done)
    bleibt wie heute.
  - Owner kann die Lanes eines Boards in den List-Settings **umbenennen/hinzufügen/entfernen/
    sortieren** und je Lane einen Status-Bucket wählen.
  - Agent/CLI: `ape-tasks lanes`, `ape-tasks list --lane <name>`, `ape-tasks edit <id> --lane <name>`.
- **Kontext:** Patrick will die zentrale Board-UX (Lanes/Teams) als Basis, **bevor** der
  openape-Dev-Loop (auto-code M2) drauf läuft. M3 ist Prerequisite für M2.
- **Scope — drin:**
  - Lane-Definitionen pro Team (additiv zum bestehenden 4-Wert-`status`).
  - `tasks.lane_id` + Server-Logik, die Lane↔Status konsistent hält.
  - Web-Board mit Lane-Tabs + Lane-Editor in List-Settings.
  - CLI: Lanes lesen, nach Lane filtern, Task in Lane verschieben.
- **Scope — explizit NICHT:**
  - **Teams werden NICHT neu gebaut** — sie existieren bereits vollständig als Sharing-
    Boundary (siehe „Discovery: Teams sind schon fertig"). M3 = praktisch nur Lanes.
  - Kein Drag&Drop (YAGNI; Lane-Move via Selector reicht fürs Handy; später nachrüstbar).
  - Keine eigene `lanes`-DB-Tabelle (Lanes = JSON-Config auf dem Team; Upgrade-Pfad notiert).
  - Kein CLI-Editor für Lane-*Definitionen* (Owner editiert im Web; der Loop braucht nur
    lesen + verschieben). Nachrüstbar, falls gewünscht.
  - Voll-Trello (Checklisten, Labels, Attachments, WIP-Limits) — out of scope.

## Discovery: Teams sind schon fertig (Grounding-Ergebnis)

Das aktuelle Datenmodell deckt die „Teams"-Anforderung von M3 bereits ab — **nicht neu bauen**:
- `teams` = Sharing-Boundary (ein Task gehört genau einem Team). Hat optional `org_id`.
- `team_members` (PK `team_id+user_email`, `role` ∈ `owner|editor|viewer`) = **multi-human +
  Agent** (Agenten sind Member per E-Mail, z. B. `pmhofmann+n@…`).
- Invites (`team_invites`) inkl. Agent→Agent, signierte JWT-URLs, im Web + CLI.
- Webapp ist mobile-first. Vom Handy abhakbar ✔.

→ **M3 reduziert sich auf Lanes.** Der Loop-Agent wird einfach Team-Member; das war's für „Teams".

## Repo-Orientierung

- **Projekt:** `openape-tasks` — `~/Companies/private/repos/openape/openape-tasks/`
  (Forgejo `git.openape.ai`, push-mirror GitHub `openape-ai/tasks`).
- **Monorepo:** workspaces `app` (Nuxt 4 + Nitro API) + `cli` (`@openape/ape-tasks`, citty + tsup).
- **Tech-Stack:** Nuxt 4, Vue 3 (`<script setup>`, Composition API), `@nuxt/ui` 4, Tailwind 4,
  h3, Drizzle ORM + LibSQL/SQLite, ulid. **Hinweis:** dieses Repo nutzt Composition API +
  @nuxt/ui (nicht die IURIO-Options-API/Bootstrap-Regel) — dem bestehenden Code-Stil folgen.
- **Relevante Dateien:**
  - Schema: `app/server/database/schema.ts` (`teams`, `tasks`, `teamMembers`, `teamInvites`).
  - DB-Init/Migration: `app/server/plugins/02.database.ts` — **idempotente `CREATE TABLE IF
    NOT EXISTS` + `ALTER TABLE … ADD COLUMN` in try/catch** (KEIN drizzle-kit). Neue Spalten
    hier nach demselben Muster.
  - `--json`-Shape: `app/server/utils/task-shape.ts` → `serializeTask()` (snake_case).
  - API: `app/server/api/teams/[id]/tasks.get.ts` (list, `?status=`), `.../tasks.post.ts`
    (create), `app/server/api/tasks/[id].patch.ts` (edit/status-move),
    `app/server/api/teams/[id].get.ts` (detail), `app/server/api/teams/[id].patch.ts` (team edit).
  - Reminder-Worker: `app/server/jobs/sendReminders.ts` — filtert `status NOT IN
    (done,archived)` + `remind_at`. **Hängt nur an `status`, nicht an Lanes** → unberührt.
  - Web-Board: `app/app/pages/teams/[id]/index.vue` (heute reine Listen-UX, keine Spalten).
  - CLI: `cli/src/commands/tasks.ts` (`list/show/new/edit/status/done/reopen/rm`),
    `cli/src/commands/teams.ts`, `cli/src/cli.ts` (Command-Registrierung), `cli/src/api.ts`.
  - Doku: `cli/src/docs/agent.md`, `cli/src/docs/cli.md`, `cli/src/docs/tasks.md`, `README.md`.
- **Dev-Setup (exakte Kommandos):**
  - Install: `cd ~/Companies/private/repos/openape/openape-tasks && pnpm install`
  - Dev-Server (App): `pnpm --filter app dev` → lokal `http://localhost:3000` (SQLite
    `app/dev.db`; Nitro legt Tabellen via `02.database.ts` an).
  - Typecheck: `pnpm typecheck` (= `pnpm -r typecheck`). Tests: `pnpm test` (= `pnpm -r test`).
  - Lint: das Repo nutzt `@antfu/eslint-config` (kein Root-`lint`-Script vorhanden —
    **vor Milestone 1 prüfen** `pnpm -r lint` bzw. `pnpm --filter app exec eslint .`; siehe M1).
  - CLI-Build: `pnpm cli:build`. CLI lokal gegen Dev-Server: `--endpoint http://localhost:3000`
    bzw. `APE_TASKS_ENDPOINT`.

## Kern-Design (gilt für alle Milestones)

**Lanes sind eine additive Verfeinerung von `status`, kein Ersatz.** `status`
(`open|doing|done|archived`) bleibt die kanonische, backward-kompatible Achse (Reminder-Worker,
`done`, `list --status`, `completed_at`-Semantik). Lanes sind die feinere, konfigurierbare
UX-Achse darüber.

**Datenmodell (2 neue, nullable Spalten — kein neues Table):**
- `teams.lanes` `TEXT` (JSON, nullable). JSON-Array von Lane-Defs:
  `[{ "id": "<ulid>", "name": "Ready", "status": "open" }, …]`. `NULL` ⇒ Default-Lanes.
  Jede Lane bildet auf **genau einen** Status-Bucket `open|doing|done` ab (kein `archived`:
  archivierte Tasks erscheinen wie heute nicht auf dem Board). Cap: ≤ 12 Lanes, name ≤ 40 Zeichen.
- `tasks.lane_id` `TEXT` (nullable). `NULL` ⇒ effektive Lane = **erste** Lane, deren `status`
  dem Task-`status` entspricht. (Alte Tasks ohne `lane_id` landen so deterministisch in der
  ersten passenden Lane — z. B. alles offene in der ersten open-Lane.)

**Default-Lanes (für `teams.lanes = NULL`):** status-abgeleitet, optisch wie heute →
`[{Open, open}, {Doing, doing}, {Done, done}]`. (Patrick-Entscheid: bestehende Teams sehen
unverändert aus.) Ein **Ein-Klick-Preset** „Dev-Workflow" setzt
`Backlog(open) · Ready(open) · Doing(doing) · Review(doing) · Done(done)`.

**Invarianten (Server erzwingt sie zentral in einem Util):**
- Move zu Lane L ⇒ `lane_id := L.id` **und** `status := L.status` (atomar im selben PATCH).
- `done <id>` / Done-Toggle ⇒ `status := done` **und** `lane_id :=` letzte Lane mit
  `status==done` (Backward-Compat-Shortcut bleibt unverändert nutzbar).
- `status`-Move ohne Lane (alter Pfad `edit --status doing`) ⇒ `status` wechselt; `lane_id`
  wird auf die erste Lane des neuen Buckets gesetzt (bleibt konsistent, nie „verwaist").
- Lane aus `teams.lanes` entfernt ⇒ Tasks mit dieser `lane_id` werden auf die erste Lane
  desselben Status-Buckets (oder erste open-Lane) reassigned, im selben PATCH.

**Shared Util (neu):** `app/server/utils/lanes.ts` mit:
- `DEFAULT_LANES` (die 3 status-abgeleiteten) + `DEV_WORKFLOW_LANES` (Preset).
- `resolveLanes(team.lanes): Lane[]` (parsen + Defaults).
- `effectiveLaneId(lanes, status, lane_id): string` (Null-/Verwaisungs-Auflösung).
- `validateLanes(input): Lane[]` (Schema/Cap/Status-Bucket-Validierung, ids server-seitig vergeben).
- `laneById(lanes, idOrName): Lane | undefined` (Resolve per id **oder** name, für CLI `--lane`).

> `ponytail:` Lanes als JSON-Spalte statt eigener Tabelle — wenige (≤12), selten editierte
> Lanes, kein Join/CRUD-Endpoint nötig. Upgrade-Pfad: eigene `lanes`-Tabelle erst, wenn
> per-Lane-Metadaten (WIP-Limits, Farben, Automationen) oder häufiges Reordering das verlangen.

## Backward-Compat-Checkliste (HART — darf nicht brechen)

- [ ] `ape-tasks new/list/edit/done` verhalten sich unverändert, wenn keine `--lane`-Flags genutzt werden.
- [ ] `list --status open,doing` filtert weiter nach `status` (unverändert).
- [ ] `done <id>` setzt `status=done` + `completed_at` (zusätzlich Lane → done-Lane).
- [ ] Reminder-Worker (`sendReminders.ts`) unverändert (filtert nur `status`/`remind_at`).
- [ ] `--json`-Shape: nur **additive** Felder (`lane_id`). Kein Rename/Removal (sonst major).
  Global-CLAUDE.md-Verhalten (Wiedervorlage, `--remind-at`, `--context-*`, `--dedup-key`) intakt.
- [ ] Bestehende Teams ohne `teams.lanes` rendern wie heute (3 status-Lanes).

## Milestones

Jeder Milestone ist unabhängig testbar. Pro Session max. ein Milestone.
Reihenfolge nach Aufwand/Abhängigkeit: Backend zuerst (CLI + UI hängen dran).

### Milestone 0: Baseline + Lint-Setup klären

**Ziel:** Grüne Baseline + sicher wissen, wie lint/typecheck/test in diesem Repo laufen.

**Schritte:**
1. `pnpm install`; Dev-Server starten (`pnpm --filter app dev`), `http://localhost:3000`
   einmal einloggen (DDISA) oder mit `OPENAPE_E2E`-Pfad prüfen, ein Team + Task anlegen.
2. `pnpm typecheck` und `pnpm test` laufen lassen → Baseline-Status notieren.
3. Lint-Kommando ermitteln (kein Root-`lint`-Script): prüfen ob `app`/`cli` je ein
   `lint`-Script haben bzw. `pnpm --filter app exec eslint .` funktioniert. Das **eine**
   funktionierende Kommando im Plan-Progress festhalten (wird Quality-Gate für M1–M3).

**Akzeptanzkriterien:**
- [ ] `pnpm typecheck` → 0 Fehler (oder Baseline-Fehler dokumentiert).
- [ ] Lint-Kommando identifiziert und grün auf `main`.
- [ ] Dev-Server zeigt ein Board mit der heutigen Listen-UX (Screenshot „vorher").

**Rollback:** keine Code-Änderung.

### Milestone 1: Backend — Lane-Datenmodell, Util, API, `--json`

**Ziel:** Lanes existieren in DB + API; Tasks tragen `lane_id`; Server hält Lane↔Status
konsistent; `--json` enthält `lane_id`. Alles backward-kompatibel.

**Schritte:**
1. **Schema** `app/server/database/schema.ts`: `teams` → `lanes: text('lanes')`;
   `tasks` → `laneId: text('lane_id')` + Index `idx_tasks_lane` auf `(teamId, laneId)`.
2. **Migration** `app/server/plugins/02.database.ts`: in den `CREATE TABLE IF NOT EXISTS`
   Defaults `lanes TEXT` (teams) / `lane_id TEXT` (tasks) ergänzen **und** idempotente
   `ALTER TABLE … ADD COLUMN` im try/catch-Block (wie bei `remind_at` etc.) + `CREATE INDEX
   IF NOT EXISTS idx_tasks_lane`.
3. **Util** `app/server/utils/lanes.ts` (siehe Kern-Design): `DEFAULT_LANES`,
   `DEV_WORKFLOW_LANES`, `resolveLanes`, `effectiveLaneId`, `validateLanes`, `laneById`.
   Types in `app/server/utils/lanes.ts` getrennt vom Logik-Code halten.
4. **`serializeTask`** (`task-shape.ts`): additiv `lane_id: row.laneId` ergänzen.
5. **`GET /api/teams/:id`**: `lanes: resolveLanes(team.lanes)` in die Response (immer aufgelöst,
   inkl. Defaults). `task_count` zusätzlich pro Lane (`by_lane: { <laneId>: n }`) — optional,
   nur falls die UI es braucht; sonst weglassen (YAGNI).
6. **`PATCH /api/teams/:id`** (`teams/[id].patch.ts`): `lanes`-Feld erlauben →
   `validateLanes`. Beim Entfernen einer Lane: verwaiste Tasks reassignen (ein UPDATE pro
   betroffenem Bucket). Owner/Editor-Rolle wie bei anderen Team-Edits.
7. **`PATCH /api/tasks/:id`** (`tasks/[id].patch.ts`): `lane_id`-Feld akzeptieren →
   validieren dass die Lane zum Team gehört (`laneById`); setzt `lane_id` **und**
   `status = lane.status` (+ `completed_at`-Logik wie beim bestehenden Done-Pfad). Wenn
   `status` direkt gesetzt wird (ohne `lane_id`): `lane_id` auf erste Lane des Buckets nachziehen.
8. **`POST /api/teams/:id/tasks`**: optional `lane_id` im Body (sonst Default-Lane via
   `effectiveLaneId(status)`). Bei gesetztem `lane_id`: `status` aus Lane ableiten.
9. **`GET /api/teams/:id/tasks`**: optionaler `?lane=<id|name>`-Filter (resolve via
   `laneById` + `effectiveLaneId` für `lane_id IS NULL`-Tasks). `status`-Filter bleibt.

**Akzeptanzkriterien (gegen Dev-Server, `curl`/`ape-tasks --endpoint`):**
- [ ] `GET /api/teams/:id` liefert `lanes:[{id,name,status}…]` (Default = 3 status-Lanes bei `lanes=NULL`).
- [ ] `PATCH /api/teams/:id {lanes:[…Dev-Workflow…]}` → 200; erneuter GET zeigt 5 Lanes.
- [ ] `PATCH /api/tasks/:id {lane_id:"<Ready-id>"}` → Task hat `lane_id=Ready`, `status=open`.
- [ ] `PATCH /api/tasks/:id {lane_id:"<Review-id>"}` (Review→doing) → `status=doing`.
- [ ] `ape-tasks done <id> --endpoint …` → `status=done` **und** `lane_id`=Done-Lane.
- [ ] Lane „Review" entfernen (Team-PATCH) → Tasks aus Review wandern nach erste doing-Lane, kein 500.
- [ ] `GET /api/teams/:id/tasks?lane=Ready` → nur Ready-Tasks.
- [ ] `serializeTask`-Output enthält `lane_id`; `list --status open,doing` unverändert.
- [ ] `pnpm typecheck` + lint grün. Mind. 1 Test für `lanes.ts` (`effectiveLaneId`,
      `validateLanes`, Reassign-Logik) — kleinster Test, der bei Logikbruch failt.

**Rollback:** Spalten sind nullable + additiv; Feature-Code revertbar ohne Datenverlust
(alte Rows haben `lanes=NULL`/`lane_id=NULL` → Default-Verhalten).

### Milestone 2: CLI — Lanes lesen, filtern, verschieben

**Ziel:** Agent/CLI kann Lanes sehen, nach Lane filtern und Tasks verschieben — die Ops, die
der auto-code-Loop (M2 des Roadmaps) als Quelle braucht.

**Schritte:**
1. **`ape-tasks lanes`** (neuer Command, `cli/src/commands/tasks.ts` + Registrierung in
   `cli/src/cli.ts`): `--team <id>` (oder aktiver Team-Default), `--json`. Holt
   `GET /api/teams/:id` und druckt die Lanes (human + `--json`).
2. **`list --lane <name|id>`**: Arg ergänzen; reicht `?lane=` an die API durch (oder filtert
   client-seitig über aufgelöste Lanes). Kombinierbar mit `--status`/`--assignee`.
   `--assignee`-Filter clientseitig ergänzen, falls noch nicht vorhanden (der Loop braucht
   Lane **+** Assignee zusammen).
3. **`edit <id> --lane <name|id>`**: Arg ergänzen → `PATCH {lane_id}`; akzeptiert Name oder id
   (CLI resolved via `lanes`-Response des Teams). Bestehende `edit`-Flags unberührt.
4. **Doku:** `cli/src/docs/agent.md` (Task-Schema um `lane_id` + Lane-Workflow-Abschnitt),
   `cli/src/docs/tasks.md`, `--help`-Beispiele der neuen/erweiterten Commands. Doku wie
   Produkt-Doku schreiben (nicht wie Changelog/Testfall).

**Akzeptanzkriterien (CLI gegen Dev-Server, `--endpoint http://localhost:3000`):**
- [ ] `ape-tasks lanes --team <id> --json` → Array der Lanes.
- [ ] `ape-tasks edit <id> --lane Ready` → `ape-tasks show <id> --json | jq '.lane_id'` = Ready-id.
- [ ] `ape-tasks list --team <id> --lane Ready --assignee <agent-email> --json` → genau die
      actionable Tasks (deterministisch — das ist das spätere Loop-Gate).
- [ ] `ape-tasks list` ohne Lane-Flags + `ape-tasks done <id>` verhalten sich wie vor M2.
- [ ] `pnpm cli:build` + `pnpm typecheck` + lint grün.

**Rollback:** rein additive CLI-Flags/Commands; revertbar ohne Server-Impact.

### Milestone 3: Web-Board — Lane-Tabs + Lane-Editor (mobile-first)

**Ziel:** Das Board zeigt Lane-Tabs; man wechselt Lanes, sieht die Task-Liste der aktiven
Lane, verschiebt Tasks per Lane-Selector; Owner editiert Lanes in den List-Settings.

**Schritte (in `app/app/pages/teams/[id]/index.vue`, bestehenden Stil + Komponenten nutzen):**
1. `loadDetail()` liefert jetzt `lanes`; State `lanes` + `activeLaneId` (Default: erste Lane).
   `loadTasks()` weiter alle `open,doing,done` laden; clientseitig je Lane gruppieren über
   die effektive Lane (Util-Logik aus M1 als kleine clientseitige Hilfsfunktion spiegeln, oder
   `lane_id` direkt + Fallback „erste Lane des Status").
2. **Lane-Tabs** oben (Segmented-Control / `UTabs` aus @nuxt/ui), horizontal scrollbar bei
   vielen Lanes; je Tab Task-Count-Badge. Darunter die **bestehende** Task-Listen-UX (Row,
   Done-Toggle, Edit-Sheet, Delete) — nur gefiltert auf `activeLaneId`. „Completed"-Sektion
   entfällt zugunsten einer Done-Lane (Done-Tab).
3. **Lane-Move im Edit-Sheet:** ein „Lane"-Selector (Buttons/`USelect`) zusätzlich zu Titel/
   Notizen; Auswahl → `PATCH {lane_id}` (Status zieht server-seitig nach). Done-Toggle-Kreis
   am Row bleibt (→ Done-Lane).
4. **Lane-Editor** in der List-Settings-Sheet (Owner): editierbare Lane-Liste (Name-Input,
   Status-Bucket-`USelect` `open|doing|done`, Hoch/Runter-Reorder, Entfernen, Hinzufügen) +
   Button „Dev-Workflow-Preset übernehmen". Speichern → `PATCH /api/teams/:id {lanes}`.
   Beim Entfernen einer Lane mit Tasks: Hinweis, dass Tasks in die erste Lane des Buckets wandern.
5. Mobile-Safe-Area / Sticky-Bars wie bestehend beibehalten.

**Akzeptanzkriterien (visuelle Verifikation, Headless-Chrome-Screenshots — siehe unten):**
- [ ] Board zeigt Lane-Tabs; aktive Lane listet nur ihre Tasks; Tab-Wechsel funktioniert.
- [ ] Task im Edit-Sheet von `Backlog`→`Ready` verschieben → erscheint im Ready-Tab,
      `status` bleibt `open`.
- [ ] Task → `Review` (doing-Bucket) → erscheint in Review, `status=doing` (per `show --json` geprüft).
- [ ] Done-Toggle → Task im Done-Tab, `status=done`.
- [ ] Owner: Lanes umbenennen/hinzufügen/sortieren/entfernen in List-Settings; nach Reload persistent.
- [ ] „Dev-Workflow-Preset" setzt die 5 Lanes.
- [ ] Bestehendes Team ohne konfigurierte Lanes zeigt 3 Tabs (Open/Doing/Done), Verhalten wie vorher.
- [ ] `pnpm typecheck` + lint grün; `pnpm --filter app build` erfolgreich.

**Rollback:** Page-Änderung revertbar; Backend (M1) bleibt, Daten unberührt.

## Visuelle Verifikation (Pflicht für M3, siehe globales CLAUDE.md)

Nach M3 mit Headless-Chrome rendern, PNG mit Read-Tool selbst ansehen, dann per SendUserFile schicken:
```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --hide-scrollbars --window-size=420,900 --screenshot=/tmp/board-mobile.png \
  "http://localhost:3000/teams/<id>"
```
Zustände abdecken: (1) Board mit Dev-Workflow-Lanes (Tabs), (2) Edit-Sheet mit Lane-Selector,
(3) Lane-Editor in List-Settings, (4) bestehendes Team mit Default-Lanes (Backward-Compat).
Optional `visual-qa-reviewer`-Subagent über die „nachher"-Screenshots laufen lassen.

## Quality Gates (nicht verhandelbar, fail-fast in Reihenfolge)

Pro Milestone: **lint → typecheck → build → test**, beim ersten roten Schritt stoppen/fixen/
neu. Exakte Kommandos aus M0. Erst „grün" behaupten, wenn die Akzeptanzkriterien beobachtbar
erfüllt sind (Output/Screenshot als Beweis).

## Deploy (nach Approval + grünen Milestones)

`main` ist protected → Branch + PR + grüner CI (Forgejo). Prod-Deploy via tested-image:
`pnpm run deploy:image` (siehe `docs/deploy.md`). **Migration läuft automatisch** beim
Container-Start über `02.database.ts` (idempotente ALTERs) — kein separater Migrationsschritt.
CLI-Release (`@openape/ape-tasks`) separat publishen, falls die neuen CLI-Commands ausgeliefert
werden sollen.

## Progress

- [x] `[2026-06-22]` Plan erstellt, Grounding, Board-UX (Lane-Tabs) + Default-Lanes
      (status-abgeleitet) geklärt. **Freigabe erhalten.**
- [x] `[2026-06-22 13:55]` M0: Baseline grün. Quality-Gate = **typecheck + build** (kein Lint
      im Repo; CI baut nur typecheck+build). Dev-Port = **3004**. `vue-tsc` als app-devDep
      ergänzt (Nuxt-empfohlen, fixt kaputten lokalen Gate).
- [x] `[2026-06-22 14:05]` M1: Backend fertig + E2E verifiziert (14/14 API-Checks, Commit
      `57f206d`). Schema/Migration/`lanes.ts`/API/`--json`. 13 Unit-Tests grün.
- [x] `[2026-06-22 14:20]` M2: CLI fertig + E2E verifiziert (lanes/list --lane/edit --lane/
      new --lane/--assignee-Filter; Doku agent.md+tasks.md+cli.md; v1.3.0; Commit `49b17e6`).
- [x] `[2026-06-22 14:35]` M3: Web-Board fertig + visuell verifiziert (4 Screenshots: Board mit
      Lane-Tabs+Counts, Tab-Wechsel, Edit-Sheet-Lane-Selector, Lane-Editor; 0 Console-Errors).
      typecheck+build grün. Commit `0c7538e`. **Alle Milestones erledigt.**

## Surprises & Discoveries

- `[2026-06-22]` **Teams sind bereits vollständig** (Sharing-Boundary + Rollen + Agent-Member +
  Invites + mobile) → M3 = praktisch nur Lanes. Evidenz: `schema.ts` (`teams`/`team_members`/
  `team_invites`), `README.md` („Teams as sharing boundary").
- `[2026-06-22]` **Keine drizzle-kit-Migrationen** — Schema wird via idempotente `CREATE/ALTER`
  in `app/server/plugins/02.database.ts` gepflegt. Evidenz: Datei + fehlendes `drizzle.config`.
- `[2026-06-22]` Reminder-Worker hängt nur an `status`/`remind_at`, nicht an Lanes → durch
  „Lanes additiv über `status`" automatisch unberührt. Evidenz: `sendReminders.ts:selectDue`.
- `[2026-06-22]` UI zeigt heute `doing` gar nicht separat (open+doing in einer Liste, done
  collapsed) → Lane-Tabs machen `doing`/`Review` erstmals sichtbar. Evidenz: `teams/[id]/index.vue:103`.

## Decision Log

| Datum | Entscheidung | Begründung | Alternativen verworfen |
|-------|-------------|------------|----------------------|
| 2026-06-22 | Lanes = additive Verfeinerung von `status` (Lane→status-Bucket-Mapping) | Backward-Compat: Reminder-Worker/`done`/`list --status`/`completed_at` bleiben unverändert | Status durch konfigurierbare Lanes ersetzen (zu invasiv, bricht Worker + CLI) |
| 2026-06-22 | Lanes als JSON-Spalte auf `teams` (nicht eigene Tabelle) | Wenige, selten editierte Lanes; kein CRUD/Join nötig; editierbar via vorhandenes Team-PATCH | Eigene `lanes`-Tabelle (mehr Migration/Endpoints; YAGNI bis WIP-Limits/Metadaten nötig) |
| 2026-06-22 | Board-UX = Lane-Tabs, eine Spalte (mobil) | Patrick-Entscheid; behält saubere mobile Listen-UX, handy-tauglich, kein Drag&Drop | Horizontale Trello-Spalten / responsive Beides (mehr Aufwand, mobil enger) |
| 2026-06-22 | Default-Lanes = status-abgeleitet (Open/Doing/Done) | Patrick-Entscheid; bestehende Teams sehen unverändert aus, max. Backward-Compat | Dev-Workflow-Set überall vorsetzen (überrascht bestehende Nutzer) |
| 2026-06-22 | Kein CLI-Editor für Lane-Definitionen; Owner editiert im Web | Der Loop braucht nur lesen + verschieben; Definitions-Editing ist Owner-Web-Aufgabe | CLI-`lanes set` (YAGNI; nachrüstbar) |
| 2026-06-22 | Loop-Gate = Lane-Name + Assignee aus Loop-Config (kein `actionable`-Flag) | Spiegelt IURIO (`lane: Sprint-Todos`); keine Schema-Sonderspalte | Per-Lane `actionable`-Boolean (unnötige Schema-Komplexität) |
| 2026-06-22 | Teams NICHT neu bauen | Bereits vollständig als Sharing-Boundary + Rollen + Invites + mobil | — |

## Session-Checkliste

1. Plan lesen, Progress prüfen.
2. Git-Log seit letztem Commit lesen.
3. Dev-Server starten, Baseline (M0-Kommandos) laufen lassen.
4. Nächsten offenen Milestone identifizieren.
5. Implementieren; nach jedem Milestone committen (conventional commit, kein AI-Co-Author).
6. E2E-Verifikation der Akzeptanzkriterien (API/CLI/UI, nicht nur Unit-Tests).
7. Progress + Discoveries aktualisieren.

## Outcomes & Retrospective

- **Ergebnis:** Lanes als additive Achse über `status` geliefert — Schema (`teams.lanes` JSON +
  `tasks.lane_id`), `lanes.ts`-Util, API (team-PATCH lanes + orphan-reassign, task-PATCH/POST
  lane_id, list `?lane=`), CLI (`lanes` / `--lane` / `--assignee`, v1.3.0), Web-Board (Lane-Tabs +
  Editor + Mover). Backward-Compat voll erhalten (Reminder-Worker/`done`/`list --status`/`--json`
  intakt, alte Teams = 3 Default-Lanes). 14/14 API-E2E, CLI-E2E, 13 Unit-Tests, 4 UI-Screenshots.
- **Abweichungen vom Plan:** (1) Kein Lint im Repo → Gate = typecheck+build. (2) `vue-tsc` als
  app-devDep ergänzt (lokaler typecheck war kaputt). (3) `new --lane` zusätzlich umgesetzt (billig,
  Loop-nützlich). (4) Dev-Port 3004, nicht 3000.
- **Learnings:** Auth-gated SPA headless verifizierbar via geforgtem h3-`useSession`-Seal
  (iron-webcrypto) als `x-openape-sp-session`-Header + Playwright `extraHTTPHeaders` — kein
  echter DDISA-Login nötig. Kleiner offener Kosmetik-Punkt: List-Settings-Modal mischt EN
  (Name/Description/Save) mit DE (Lane-Editor) — vorbestehende Sprach-Inkonsistenz, nicht blockend.

## Für M2 (openape-Loop, separate auto-code-Session)
Das actionable-Gate steht: `ape-tasks list --team <id> --lane <Lane> --assignee <agent> --json`
liefert deterministisch die offene Arbeit; Lane-Move (`edit --lane`) = in-progress/eskalieren.
`--json` trägt `lane_id`; `ape-tasks lanes --json` mappt Name↔id.
