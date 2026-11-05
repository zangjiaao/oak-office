# oak-office

A virtual office where you talk to a department lead while hired agents work at their desks.

This repository starts with a scripted scene, not a live model. The left side is a pixel office. The right side is the department lead. Both play from the same timeline so the working states can be checked before any agent runtime is connected.

The scene covers idle, arrival, thinking, reading, typing, running, waiting, handoff, report, done, and blocked. People are already hired. Nothing is created during playback.

[herdr-office](https://github.com/zuccs/herdr-office-layout) is a visual reference for desks, walks, and status poses. It is not a dependency. No sprites, fonts, or layout files are copied from it.

## Run

```sh
npm install
npm run dev
```

Open the local URL Vite prints. `npm run build` typechecks and builds the Worker asset bundle.

## Not in this cut

Hiring, departments, Pi sessions, and shared offices are not wired up yet. The Worker only answers `/api/health`.
