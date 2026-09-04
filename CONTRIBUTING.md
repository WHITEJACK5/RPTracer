# Contributing to TRACER

Thank you for considering contributing to TRACER — Real-Time Mule-Ring Defense!

## Quick Start

```bash
git clone https://github.com/WHITEJACK5/RPTracer.git
cd RPTracer
pip install -r backend/requirements.txt
cd frontend && npm install
```

## Before You Push

```bash
# Backend
python -m pytest -q          # 154 tests must pass
python -m ruff check backend/

# Frontend
npx tsc --noEmit             # no type errors
npm run build                # 14/14 static
npm run test                 # 17 tests
```

## Pull Request Process

1. Fork the repo and create a branch: `git checkout -b feat/your-feature`
2. Make your changes with **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`)
3. Ensure design tokens are respected — **no hardcoded hex** outside `frontend/styles/globals.css`
4. Update `WIRING_AUDIT.md` if you add/remove buttons/links
5. Open a PR — template will guide you

## Code Style

- Backend: `ruff`, `black`, Pydantic v2 strict
- Frontend: `eslint`, `prettier`, Tailwind tokens via `var(--color-*)`
- Tests: `pytest` + `hypothesis` for property tests, `vitest` for frontend

## Reporting Issues

Use the bug report template in `.github/ISSUE_TEMPLATE/bug_report.md`.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
