# Arjun's Day Tasks — Sync Notes

This file persists project context across opencode sessions so Arjun doesn't have to re-explain anything.

## Project Overview

- **What:** A single-file HTML todo app (`index.html`, ~60KB) with Work / Personal panels, nested groups, due dates, overdue tracking, timers, and panel hide/show for screen-share privacy.
- **Location:** `/Users/arjunsena/projects-todo/index.html` (also symlinked as `/Users/arjunsena/todo.html`).
- **Live site:** https://arjunsena-git.github.io/todo/  (GitHub Pages, served from `main` branch)
- **Repo:** https://github.com/arjunsena-git/todo  (remote `origin`, branch `main`)
- **Data sync:** GitHub Contents API, repo `arjunsena-git/todo`, branch `data`, path `state.json`. The app stores a fine-grained GitHub token in browser-local `localStorage` under `todo.arjun.v2.githubToken`; do not hardcode a token into `index.html`. Cloud is source of truth once `state.json` exists; localStorage caches locally and reconciles on focus/visibility change every 30s.

## Architecture (key facts)

- Single `index.html` contains all HTML, CSS, and JS. No build step, no dependencies.
- State shape: `state.work` and `state.personal`, each `{ tasks: [], children: [], collapsed: false }`. Children are nested groups (recursive). Tasks: `{ id, text, done, due, created, timer, timerStarted, timerRemaining }`.
- `STORAGE_KEY = "todo.arjun.v2"`. Hidden panels flag stored at `"todo.arjun.v2.hidden"` as `{ work, personal }` booleans. GitHub sync token is stored per browser at `"todo.arjun.v2.githubToken"`.
- `render()` calls `renderColumn("work")`, `renderColumn("personal")`, `renderProgress()`, `restartRunningTimers()`.
- **Known footgun (fixed):** `renderColumn` does `col.innerHTML = ""` which destroys the static `col-restore` button. Fix = recreate the restore button in JS on every render with its click handler attached. Do NOT revert this.
- Sync logic guards against clobbering: `dirty` flag prevents stale remote overwriting local; `isEditing()` skips re-render while user is typing; `saveFocus()`/`restoreFocus()` preserve the focused field across remote-triggered re-renders.

## Critical Workflow Rule — DEPLOY EVERY CHANGE

**Arjun requires that every code change be deployed to GitHub and verified live on GitHub Pages before considering the task done.**

After any edit to `index.html`:

1. `git add index.html && git commit -m "<message>" && git push`
2. Wait ~60-90s for the GitHub Pages build.
3. Verify the build succeeded and is live:
   - `gh api repos/arjunsena-git/todo/pages --jq '.status'`  → should print `built`
   - `gh run list --limit 3`  → latest `pages-build-deployment` should be `success`
   - `curl -s "https://arjunsena-git.github.io/todo/?v=$(date +%s)" | grep -c "<some-unique-new-string>"`  → should print `1`
4. If the Pages deploy step fails with "Deployment failed, try again later" (a transient GitHub error), force a redeploy with an empty commit: `git commit --allow-empty -m "Trigger Pages redeploy" && git push`, then re-verify.
5. Tell Arjun to hard-refresh on his device (`Cmd + Shift + R`) since the browser caches the old `index.html`.

**Do not** consider a task complete until the fix is confirmed live on https://arjunsena-git.github.io/todo/.

## Past Issues (do not reintroduce)

1. **Deleted groups/tasks reappearing** — remote sync was overwriting local deletions. Fixed by setting `dirty=true` and saving state *before* the delete animation, so a focus-triggered `loadRemote()` can't clobber it.
2. **Typing wipe on sync** — `saveFocus`/`restoreFocus` use `closest("[data-taskid]")` / `closest("[data-groupid]")` to find the field being edited, and `isEditing()` pauses re-render while typing.
3. **Hidden panel un-restorable** — clicking the eye icon to hide a panel wiped the restore button via `innerHTML=""`. Fixed by recreating the `col-restore` button in JS on each render. (commit `65120e1`)
4. **Pages deploy transient failures** — GitHub sometimes returns "Deployment failed, try again later" even when the build is fine. Retry with an empty commit; do NOT change code to work around it.
5. **JsonBin quota exhausted** — JsonBin now returns 403 "Requests exhausted." Sync was migrated away from JsonBin. Do NOT restore JsonBin constants unless Arjun explicitly buys/rotates a working JsonBin account.
6. **Do not publish GitHub tokens** — GitHub-backed sync must prompt/store tokens per browser. A public GitHub Pages app cannot safely contain `GH_TOKEN = "...";`.

## Useful Commands

```bash
# Work in the project dir
cd /Users/arjunsena/projects-todo

# Check Pages status
gh api repos/arjunsena-git/todo/pages --jq '.status'

# Check recent deploy runs
gh run list --limit 5

# Verify live site has a change
curl -s "https://arjunsena-git.github.io/todo/?v=$(date +%s)" | grep -c "<unique-string>"

# Check whether GitHub state has been seeded
gh api repos/arjunsena-git/todo/contents/state.json -f ref=data --jq '.path'

# Force redeploy on transient failure
git commit --allow-empty -m "Trigger Pages redeploy" && git push
```

## Local Quick-Reset (for Arjun, browser console)

If a panel gets stuck hidden and the restore button isn't working for some reason:

```js
localStorage.removeItem("todo.arjun.v2.hidden"); location.reload();
```
