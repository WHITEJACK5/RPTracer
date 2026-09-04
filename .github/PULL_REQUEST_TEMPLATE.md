## What
<!-- What does this PR change? Link issue if applicable -->

## Why
<!-- Why is this needed? What problem does it solve? -->

## How Tested
- [ ] `python -m pytest -q` — 154 passed
- [ ] `npx tsc --noEmit` — no errors
- [ ] `npm run build` — 14/14 static
- [ ] Manual: `http://localhost:3000` + `http://127.0.0.1:8000/healthz`

## Checklist
- [ ] No hardcoded hex outside `frontend/styles/globals.css`
- [ ] `WIRING_AUDIT.md` updated if buttons/links changed
- [ ] No secrets committed (`.env` is gitignored)
- [ ] Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`)
