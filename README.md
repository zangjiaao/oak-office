# oak-office

A virtual office where you talk to a department lead while hired agents work at their desks.

The office has two states.

**编制** is the roster for this one department. People exist before a scene. A lead and a staff member use the same file: name, gender, and appearance are required; a one-line brief and a longer dossier are optional. Blank text resolves to a generic identity. The hire form has one lead switch. The department has a single lead, who sits at the inner desk; turning the switch on sends the previous lead back to a staff desk. Files live in D1. The page hires and edits through the Worker, and it does not start a model.

**排练** is the scripted scene. The left side is the pixel office. The right side is the department lead. Both play from the same timeline so the working states can be checked before any agent runtime is connected. The scene covers idle, arrival, thinking, reading, typing, running, waiting, handoff, report, done, and blocked. It keeps the original four people and the original lines. Roster edits do not change the rehearsal.

[herdr-office](https://github.com/zuccs/herdr-office-layout) is a visual reference for desks, walks, and status poses. It is not a dependency. No sprites, fonts, or layout files are copied from it.

## Run

```sh
npm install
npm run dev
```

`npm run dev` applies the D1 migrations to Wrangler's local SQLite, then starts Vite. No remote database and no Cloudflare account are required. Open the local URL Vite prints. `npm run build` typechecks and builds the Worker asset bundle.

The Worker serves `GET /api/health`, `GET /api/people`, `POST /api/people`, and `PATCH /api/people/:id`.

## Not in this cut

Creating a company, extra departments, shared offices, and Pi sessions are not wired up. When a session exists, the lead may only dispatch people already in `people`. Rehearsal stays the place to check working states.
