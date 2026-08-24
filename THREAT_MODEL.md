# THREAT_MODEL.md — TRACER v2.0 Security Threat Model

## 1. Graph Memory Exhaustion via Junk-Node Flooding
- **Attack**: Attacker sends millions of unique device/VPA events to inflate the in-memory NetworkX graph beyond `_MAX_NODES` (5,000).
- **Mitigation**: LRU eviction removes leaf nodes when node count exceeds the cap. Core payment identity nodes (device/vpa/card) are protected from eviction.
- **Residual Risk**: Sustained flooding at >5,000 unique entities/min could cause eviction churn. Rate limiting (100 req/min per IP) bounds the ingestion rate.

## 2. Webhook Signature Bypass Under Misconfiguration
- **Attack**: If `REQUIRE_WEBHOOK_SECRET=0` (dev default), an attacker can submit unsigned webhook payloads.
- **Mitigation**: Production deployment sets `REQUIRE_WEBHOOK_SECRET=1` and `RAZORPAY_WEBHOOK_SECRET` >= 32 chars (enforced by `ConfigError`). HMAC verification uses `hmac.compare_digest` (constant-time).
- **Residual Risk**: Misconfigured production deployment without `REQUIRE_WEBHOOK_SECRET=1` silently accepts unsigned webhooks.

## 3. Replay Attacks Against the Event Log
- **Attack**: Replaying a valid signed webhook event multiple times to trigger duplicate scoring or graph inflation.
- **Mitigation**: Idempotency middleware (`SET NX` + TTL) deduplicates by event_id + path. SQLite event log enforces `UNIQUE(event_id)` constraint.
- **Residual Risk**: If Redis is unavailable and in-memory store is used, deduplication is per-process only (multi-worker gap).

## 4. Adversarial Evasion of Ring Detector
- **Attack**: Rotating device IDs across transactions while keeping per-device fan-out below threshold.
- **Mitigation**: Phase 2 device-rotation correlation detection (shared card fingerprint + IP subnet clustering across distinct devices). Phase 3 EWMA trajectory forecasting provides early warning before hard threshold breach.
- **Residual Risk**: Attackers using fully unique devices, unique IPs, unique cards with no shared secondary signals evade multi-signal correlation. Evasion cost estimate: see `EVASION_COST.md`.

## 5. Prompt Injection in LLM Dossier Path
- **Attack**: Embedding injection markers in transaction fields (VPA name, email) to manipulate LLM output.
- **Mitigation**: `sanitize_prompt()` strips zero-width characters, control characters, and injection markers. Input is truncated to 500 chars.
- **Residual Risk**: Novel injection techniques not covered by the marker list.
