# PlanScope desktop client

Wahab owns this implementation boundary. The user confirmed that Electron/Tauri and web interface technologies are permitted for the desktop application; the selected implementation is Electron with HTML/CSS/JavaScript. The Python backend retains the v0.2 JSON contract.

Read `docs/prompts/frontend.md` for the complete handoff. Suggested structure:

```text
desktop/
  main.cjs                  Window, restricted IPC and local backend lifecycle
  preload.cjs               Narrow contextBridge API
  renderer/
    index.html              Desktop interface
    styles.css
    app.js
```

No Electron window, launcher, package.json or installer has been implemented in this backend increment. The planned `npm run desktop` command is a client task and does not work yet.

Start the backend with `uv run python -m app`, then implement restricted IPC calls to `http://127.0.0.1:8000/api/v1/options` and `/api/v1/recommendations`. The Electron main process owns HTTP; the renderer uses methods exposed by preload and needs no broad backend CORS exception. Keep context isolation enabled, Node integration disabled, and do not expose arbitrary fetch, shell or IPC access.

The first acceptance flow is GBP 10 -> Board Game Night / GBP 5, GBP 4 -> Acoustic Hour, GBP 0 -> no match. All source datasets are fictional and must stay visibly labelled.

References: [Electron preload](https://www.electronjs.org/docs/latest/tutorial/tutorial-preload), [context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation).
