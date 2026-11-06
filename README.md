# oak-office

A virtual office where you talk to a department lead while hired agents work at their desks.

The office has three states.

**办公** is the live room. You talk to the hired lead. The lead is a Pi agent and may only dispatch people already in the roster. A dispatched person is another Pi agent, using that person's file. The lead listens, waits while people work, then listens to the report. When the lead starts someone who is out, that person walks in from the door and a staff agent is kept. After finishing they stay done; with no new task they become idle, then walk out, and that walk aborts the agent. Someone still done or idle keeps the same agent and starts the next task from the desk. The assignment, the staff reply, and the lead's summary are separate messages. Poses are the same ones the rehearsal uses.

**编制** is the roster for this one department. People exist before a scene. A lead and a staff member use the same file: name, gender, and appearance are required; a one-line brief and a longer dossier are optional. Blank text resolves to a generic identity. The hire form has one lead switch. The department has a single lead, who sits at the inner desk; turning the switch on sends the previous lead to the first empty staff desk. Eight employee desks and the lead desk stay in the room. Hiring reserves the first empty desk, and the person stays out of the room until the lead starts them. Leaving removes the file and leaves that desk empty. A ninth employee is refused. Files live in D1. The page hires, edits, and dismisses through the Worker.

**排练** is the scripted scene. The left side is the pixel office. The right side is the department lead. Both play from the same timeline so the working states can be checked before any agent runtime is connected. The scene covers idle, arrival, thinking, reading, typing, running, waiting, handoff, report, done, and blocked. It keeps the original four people and the original lines. Roster edits do not change the rehearsal.

[herdr-office](https://github.com/zuccs/herdr-office-layout) is a visual reference for desks, walks, and status poses. It is not a dependency. No sprites, fonts, or layout files are copied from it.

## Run

```sh
npm install
npm run dev
```

`npm run dev` applies the D1 migrations to Wrangler's local SQLite, then starts Vite. No remote database and no Cloudflare account are required. Open the local URL Vite prints. `npm run build` typechecks and builds the Worker asset bundle.

Put `DEEPSEEK_API_KEY` in `.dev.vars` before talking in 办公. `AI_MODEL` defaults to `deepseek-flash`. See `.dev.vars.example`.

The Worker serves `GET /api/health`, `GET /api/people`, `POST /api/people`, `PATCH /api/people/:id`, `DELETE /api/people/:id`, `GET /api/work`, and `POST /api/work`.

## Not in this cut

Creating a company, extra departments, and shared offices are not wired up. Rehearsal stays the place to check working states.
