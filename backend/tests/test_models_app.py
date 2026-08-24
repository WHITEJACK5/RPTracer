"""Tests for backend.app.models: risk_model, shap_explainer, report, schemas."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.app.models.risk_model import (
    FEATURES,
    RiskModel,
    featurize,
    get_risk_model,
    heuristic_proba,
    policy_floor,
)
from backend.app.models.schemas import (
    DisputeDossier,
    GraphEvidence,
    RiskEvaluation,
    ShapContribution,
    TransactionEvent,
)
from backend.app.models.shap_explainer import explain, reason_codes


def _event(amount=1499.0, **kw):
    base = {
        "event_id": "m1", "amount": amount,
        "instrument": {"method": "upi", "vpa": "x@ybl"},
        "customer": {"id": "c1", "account_age_days": 900},
        "context": {"device_id": "DEV-1", "ip": "1.2.3.4",
                    "email": "a@b.com", "hour_of_day": 14},
    }
    base.update(kw)
    return TransactionEvent.model_validate(base)


def test_featurize_returns_clipped_vector():
    gs = {"device_fan_out": 14, "vpa_degree": 6, "card_share": 5,
          "ip_crowding": 6, "mule_ring_score": 90, "component_size": 40}
    feats = featurize(_event(), gs)
    assert set(feats) == set(FEATURES)
    for v in feats.values():
        assert 0.0 <= v <= 1.0


def _full_feats(**over):
    f = {k: 0.0 for k in FEATURES}
    f.update(over)
    return f


def test_policy_floor_mule_fanout():
    assert policy_floor(_full_feats(), {"device_fan_out": 5}) == 88
    assert policy_floor(_full_feats(), {"device_fan_out": 3, "component_size": 8}) == 76


def test_policy_floor_cod_rto():
    feats = _full_feats(is_cod=1.0, address_mismatch=1.0, rto_rate=0.5)
    assert policy_floor(feats, {}) == 80


def test_policy_floor_synthetic_identity():
    feats = _full_feats(address_mismatch=1.0, disposable_email=1.0,
                        account_newness=0.95, device_spread=0.7)
    assert policy_floor(feats, {}) == 84


def test_policy_floor_zero():
    feats = _full_feats()
    assert policy_floor(feats, {"device_fan_out": 1, "component_size": 1}) == 0


def test_probability_in_unit_interval():
    feats = featurize(_event(), {})
    model = get_risk_model()
    p = model.probability(feats)
    assert 0.0 <= p <= 1.0


def test_heuristic_proba_bounds():
    feats = {f: 0.5 for f in FEATURES}
    assert 0.0 < heuristic_proba(feats) < 1.0
    assert heuristic_proba({f: 0.0 for f in FEATURES}) < 0.5


def test_risk_model_version_and_importance():
    model = get_risk_model()
    assert isinstance(model.version(), str) and "-" in model.version()
    assert model.kind in ("xgboost", "calibrated-linear")
    imp = model.importance_map()
    assert set(imp) == set(FEATURES)
    assert abs(sum(imp.values()) - 1.0) < 1e-6


def test_artifact_sha256_is_string():
    model = get_risk_model()
    digest = model.artifact_sha256()
    assert isinstance(digest, str)
    if digest:
        assert len(digest) == 64


def test_shap_explain_bounds_and_order():
    gs = {"device_fan_out": 14, "vpa_degree": 6, "card_share": 5,
          "ip_crowding": 6, "mule_ring_score": 90, "component_size": 40}
    feats = featurize(_event(), gs)
    contribs = explain(88, feats)
    assert contribs
    assert len(contribs) <= 7
    assert all(abs(c.contribution) <= 100 for c in contribs)
    assert all(isinstance(c, ShapContribution) for c in contribs)
    # sorted by absolute contribution
    abs_vals = [abs(c.contribution) for c in contribs]
    assert abs_vals == sorted(abs_vals, reverse=True)


def test_shap_explain_full_sum_close_to_target():
    feats = featurize(_event(), {})
    full = explain(88, feats, top_k=len(FEATURES))
    assert abs(sum(c.contribution for c in full) - (88 - 4)) < 1.0


def test_reason_codes():
    assert "GRAPH_MULE_RING" in reason_codes({}, {"mule_ring_score": 90})
    codes = reason_codes(
        {"device_fan_out": 0.5, "is_cod": 1.0, "address_mismatch": 1.0,
         "rto_rate": 0.5, "disposable_email": 1.0, "account_newness": 0.95,
         "txn_rate_24h": 0.7, "night_hour": 1.0}, {"mule_ring_score": 0})
    assert "DEVICE_FAN_OUT" in codes
    assert "ODD_HOUR" in codes
    # empty signal -> LOW_SIGNAL_PROFILE
    assert reason_codes({f: 0.0 for f in
                         ("device_fan_out", "is_cod", "address_mismatch",
                          "rto_rate", "disposable_email", "account_newness",
                          "txn_rate_24h", "night_hour")}, {"mule_ring_score": 0}) \
        == ["LOW_SIGNAL_PROFILE"]


def test_report_structure():
    from backend.app.models.report import get_report

    rep = get_report()
    for key in ("auprc", "bayes_ceiling_auprc", "efficiency_vs_ceiling",
                "model_kind", "model_version", "prevalence",
                "fixed_threshold_operating_points",
                "flag_rate_operating_points"):
        assert key in rep
    assert 0.0 <= rep["auprc"] <= 1.0
    assert isinstance(rep["fixed_threshold_operating_points"], dict)


def test_schemas_reject_negative_amount():
    with pytest.raises(ValidationError):
        TransactionEvent.model_validate({"event_id": "x", "amount": -5})


def test_schemas_reject_missing_event_id():
    with pytest.raises(ValidationError):
        TransactionEvent.model_validate({"amount": 100.0})


def test_schemas_round_trip_and_defaults():
    ev = TransactionEvent.model_validate({"event_id": "rt", "amount": 500.0})
    dump = ev.model_dump()
    assert dump["event_id"] == "rt"
    assert dump["amount"] == 500.0
    assert dump["currency"] == "INR"


def test_riskevaluation_schema_validates():
    ev = _event()
    graph = GraphEvidence(component_size=2, shared_device_vpas=1)
    dossier = DisputeDossier(
        dossier_id="dossier-x", generated_by="template", title="t",
        executive_summary="s", evidence=["e"],
        recommended_actions=["a"], regulatory_note="r")
    reval = RiskEvaluation(
        event_id=ev.event_id, risk_score=10, risk_band="LOW",
        decision="AUTO_APPROVE", latency_ms=5.0,
        top_factors=[ShapContribution(feature="x", label="l", value=1,
                                       contribution=1.0, direction="RISK_UP")],
        graph_evidence=graph, trace=[], dispute_dossier=dossier,
        audit_ref="audit:x", model_version="v")
    assert reval.risk_band == "LOW"
    assert reval.model_dump()["decision"] == "AUTO_APPROVE"
