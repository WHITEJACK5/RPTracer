# EVASION_COST.md — Threshold-Boundary Ring-Detector Evaluation (Self-Consistency Check)

This document reports precision, recall, F1, 95% bootstrap confidence intervals, and
known-threshold sensitivity sweep for TRACER v2.0's ring detector.

**Evaluation design — threshold-boundary test (self-consistency check, NOT independent)**:
Labels are assigned by sampling fan-out from overlapping ranges (ring operators
K=2-12 payment identities per device vs benign household/small-shop users
K=1-5), then predictions come from the production `MuleDetector.observe()` code
path fed one `TransactionEvent` at a time. The actor population intentionally
overlaps at the decision boundary (small rings 2-3 vs benign 3-5) so a perfect
score is impossible by construction — but labels and predictions **share the
same fan-out signal** as the detector's own rule (`fan_out >= 4`). The
0.646/0.880 numbers therefore demonstrate self-consistency and the cost of
the overlapping boundary, not generalization to a separately-collected,
independently-labeled fraud dataset.

---

## 1. Actor-Level Evaluation (n=1,000 actors)

Simulated 500 ring operators (one device controlling K=2-12 payment identities)
and 500 benign users (household/small-shop device sharing, fan-out K=1-5 with
overlap into the ring range). Each actor's transactions are fed through the real
production `MuleDetector.observe()` pipeline.

| Metric | Point Estimate | 95% Bootstrap CI |
|---|---|---|
| **Precision** | **0.646** | [0.610, 0.681] |
| **Recall** | **0.880** | [0.852, 0.907] |
| **F1 Score** | **0.745** | [0.717, 0.772] |

- False positives: 240 benign actors flagged (480.0 per 1K benign actors)
- False negatives: 60 ring operators missed (120.0 per 1K ring operators)

---

## 2. Known-Threshold Sensitivity Sweep (n=200 adversaries)

This tests a sweep of the already-known constant (`fan_out >= 4`), with
variants ordered cheapest-to-hardest for the operator. We report which variant
is the *cheapest that actually stays below threshold* per adversary.

| Strategy | Description | Detection Rate | Evasion Rate | Cheapest Wins |
|---|---|---|---|---|
| minimal_fan_out | Keep device fan-out at 2 (below all thresholds) | 0.0% | 100.0% | 200/200 |
| shared_card | fan-out 2 + shared card fingerprint (cheaper than unique devices) | 0.0% | 100.0% | 0/200 |
| shared_ip_crowd | fan-out 3 + shared IP subnet across 5 devices | 0.0% | 100.0% | 0/200 |
| moderate_overlap | fan-out 3 + shared card + shared IP (multi-signal, still under rule threshold) | 100.0% | 0.0% | 0/200 |
| full_rotation | Unique devices, unique cards, unique IPs (maximum evasion cost) | 0.0% | 100.0% | 0/200 |

**Most common cheapest evasion strategy**: minimal_fan_out
(Keep device fan-out at 2 (below all thresholds))

---

## 3. Interpretation

- **Why this is NOT independent (read before quoting 0.646/0.880):** Labels are
  assigned by the same fan-out ranges the detector thresholds on (`fan_out >= 4`
  for `MuleDetector`); predictions also derive from fan-out counted from the
  live graph. Because labels and predictions share this signal, the table above
  is a **threshold-boundary self-consistency check** — it shows how the rule
  behaves when the test population straddles its own boundary — not an
  independent, separately-labeled fraud hold-out. Do not quote 0.646/0.880 as
  generalization to real-world rings.

- **Why not 1.000?** The actor population includes rings with fan-out 2-3 (below the
  detector's hard `fan_out >= 4` rule) and benign users with fan-out 3-5 (above the
  rule). This overlap means the detector cannot perfectly separate the two classes,
  and any reported metric is meaningful because it reflects real detection tradeoffs
  *within this shared-signal, boundary-overlap population*.
- **Sweep result (cheapest variant that stays below threshold)**: `minimal_fan_out`
  — operators must keep fan-out at 2 to stay below the known `fan_out >= 4`
  rule; staying below threshold requires limiting identities per device.
- **CI width**: Wide confidence intervals reflect genuine variance across bootstrap
  resamples of the actor population, not a circular evaluation artifact.
