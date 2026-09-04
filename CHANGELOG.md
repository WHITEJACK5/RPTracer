# Changelog

All notable changes to TRACER are documented here. Follows [Keep a Changelog](https://keepachangelog.com) and [Semantic Versioning](https://semver.org).

## [1.0.0] - 2026-09-04 — Buildathon Submission

### Added
- **Mule-ring defense:** NetworkX `MuleDetector` (fan-out ≥4, `ring_structural_ratio`, `component_size` 8) + `amount_repeat` detector (same amount ±₹5/2% ×4 in 1h/20 → HIGH) — pattern-driven, amount-agnostic till ₹1000
- **Risk engine:** XGBoost 24k rows + heuristic fallback (`mule 3.40` >> `amount 0.18`), `policy_floor` 88/76, bounded agent (LOW/MED/HIGH)
- **Frontend:** Next.js 14, 14/14 static — Overview (Model Quality + Ledger Flow live pie), Sandbox (Presets + 5-Ring + Randomized Burst 200-400 `25-5000` per-mule fixed), Graph (per-session isolated, radial hub, zoom/pan, click inspector, 120 nodes, bottom-right ↻ Refresh), Ledger (120 live, 3s poll, band/amount), Transactions, Settings/Profile/Account/Accessibility (all functional)
- **Design system:** `frontend/styles/globals.css` holds all hex, `tailwind.config.ts` maps `danger/ok/warn/neon-green` → `var(--color-*)`, 0 hardcoded hex outside `globals.css`
- **Header:** `56×56` logo (`/logo.png` transparent, `h-14 w-14`, `gap-1.5`) on every page
- **Auth:** `localStorage tracer.session` guard in `dashboard/layout.tsx`, login → dashboard, AccountMenu sign out
- **Tests:** `154` pytest (hypothesis property + live-API ring), `17` vitest, `14/14` static build

### Fixed
- Recharts tooltip `itemStyle`+`labelStyle`, MUI palette recolor, mojibake, `ring_confidence` → `ring_structural_ratio`, `rate_limit` `5000/min` for bursts, `ledger.jsonl` chain corruption, CORS explicit headers, `amount` column now shows transaction amount (was risk_score)

### Security
- HMAC-SHA256 webhook verified, prompt injection sanitizer, idempotency `TTL 600`, ledger `SHA256(prev||json)` double-entry

## [0.9.0] - 2026-08-28 — Credibility Pass

### Added
- `WIRING_AUDIT.md` 26/26 → 33/33 verified, `EVASION_COST.md` threshold-boundary self-consistency, `COST_MODEL.md`, `LIMITATIONS.md`

### Fixed
- Latency single source of truth `p50 53.3ms 18 req/s`, test count `23→154`, `ring_detector` disclosure

## [0.1.0] - 2026-01-15 — Initial Prototype

- Backend `backend/app` + Frontend `frontend/` split, Docker Compose, `.env.example`
