# Project Memory

A running log of decisions, milestones, and conventions for the Event Management Platform.

## Repository

- Local path: `~/Desktop/Event Manager`
- Remote: `origin` → https://github.com/LiquifiedDoormat/event-management-platform.git (public)
- Default branch: `main`

## Ground rules

- Never commit passwords, API keys, OTP secrets, database credentials, or `.env` files.
- `.env.example` holds placeholders only.
- Never force-push or rewrite published history.
- After each milestone: run checks, update this file and `README.md`, review the diff, then commit and push.

## Milestones

### 2026-10-18: Repository setup
- Initialized Git on `main` and added the GitHub remote.
- Added `.gitignore` (excludes `.env*` except `.env.example`, key files, dependencies, build output, local databases, OS files).
- Added `.env.example` with placeholder values, plus `README.md` and this file.

## Open decisions

- Tech stack (frontend, backend, database) not chosen yet.

## Git identity

- Pushes use the `LiquifiedDoormat` GitHub account via the GitHub CLI (`gh auth setup-git`).
- Commits in this repo are authored as `LiquifiedDoormat <324446387+LiquifiedDoormat@users.noreply.github.com>` (repo-local config).
