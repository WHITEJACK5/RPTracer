# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Email the maintainers via GitHub Security Advisories: `Security` → `Report a vulnerability` on `WHITEJACK5/RPTracer`, or open a private issue with label `security`.

We will acknowledge within 48h and aim to patch within 7 days.

## Webhook Security

- Set `RAZORPAY_WEBHOOK_SECRET` (≥32 chars in `production`, enforced by `ConfigError`)
- Without it, `POST /api/v1/webhooks/razorpay` returns `200` with `webhook_signature_verified: false` + skip reason (never silently verified)
- Set `REQUIRE_WEBHOOK_SECRET=1` to enforce `403` on unsigned traffic — HMAC-SHA256 via `hmac.compare_digest` (constant-time)

## Prompt Injection

All attacker-controlled strings (`vpa`, `email`, `notes`) are sanitized before any LLM call: control/zero-width stripped, injection markers dropped, length capped at `SANITIZE_MAX_LEN=500`. Tested in `test_prompt_injection_is_neutralized`.

## Secrets

- Never commit `.env` (gitignored). Copy `.env.example` → `.env` and fill.
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` are optional — dossiers fall back to deterministic templates.
- Enable GitHub **Secret scanning** and **Dependabot alerts** in Settings → Code security.

## Audit Ledger

`data/ledger.jsonl` is append-only `SHA256(prev_hash||canonical)` double-entry. `GET /healthz` returns `audit_chain_verified` in O(1); `GET /api/v1/ledger/stats?deep=true` does a full re-scan.

## Rate Limiting & Idempotency

- Sliding window `5000/min` per IP, `20000/min` per merchant (configurable via `RATE_LIMIT_*`)
- `X-Idempotency-Key` TTL `600` (Redis → in-memory fallback), `409` on `in_progress`, `X-Idempotent-Replay: true` on replay

## Past Audits

See `WIRING_AUDIT.md` (33/33 verified), `LIMITATIONS.md`, and `COST_MODEL.md` for honest disclosures.
