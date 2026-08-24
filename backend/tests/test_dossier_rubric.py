"""Phase 5 Tests: Dispute Dossier Quality Rubric & Fallback Labeling.

Evaluates dossier outputs on:
1. Explicit fallback reporting ('template' vs 'llm').
2. Completeness (all required evidence fields included).
3. Citation accuracy (citations in text match actual event IDs and VPA details).
"""
from __future__ import annotations

from backend.app.models.schemas import GraphEvidence, ShapContribution, TransactionEvent
from backend.app.services.llm_dossier import generate_dossier


def test_dossier_explicit_template_fallback_label(monkeypatch):
    """When LLM API keys are unconfigured, dossier MUST report generated_by='template'."""
    from backend.app.core import config

    monkeypatch.setattr(config, "OPENAI_API_KEY", None)
    monkeypatch.setattr(config, "ANTHROPIC_API_KEY", None)

    ev = TransactionEvent.model_validate({
        "event_id": "pay_rubric_01",
        "amount": 45000.0,
        "instrument": {"method": "upi", "vpa": "mule.rubric@ybl"},
        "context": {"device_id": "DEV-RUBRIC-01", "ip": "1.2.3.4"},
    })
    graph = GraphEvidence(ring_detected=True, component_size=8, shared_device_vpas=5)
    shap = [ShapContribution(feature="mule_confidence", label="Mule Ring", value=0.9, contribution=45.0, direction="RISK_UP")]

    dossier = generate_dossier(ev, score=88, shap=shap, graph=graph)

    # Assert explicit fallback labeling
    assert dossier.generated_by == "template"
    assert dossier.dossier_id.startswith("dossier-")


def test_dossier_rubric_completeness_and_citation_accuracy():
    """Dossier output must correctly cite the exact event_id and VPA details without unsupported claims."""
    ev = TransactionEvent.model_validate({
        "event_id": "pay_cite_999",
        "amount": 35000.0,
        "instrument": {"method": "upi", "vpa": "target.vpa@ybl"},
        "context": {"device_id": "DEV-CITE-99", "ip": "198.51.100.4"},
    })
    graph = GraphEvidence(ring_detected=True, component_size=6, shared_device_vpas=4)
    shap = [ShapContribution(feature="device_fan_out", label="Device Fan-out", value=4, contribution=30.0, direction="RISK_UP")]

    dossier = generate_dossier(ev, score=82, shap=shap, graph=graph)

    # 1. Completeness: required sections populated
    assert len(dossier.evidence) >= 2
    assert len(dossier.shap_reason_codes) >= 1
    assert len(dossier.recommended_actions) >= 1
    assert "Section 28" in dossier.regulatory_note or "PMLA" in dossier.regulatory_note or "RBI" in dossier.regulatory_note or "defense" in dossier.regulatory_note.lower()

    # 2. Citation accuracy: exact event_id and vpa must appear in evidence text
    evidence_str = " ".join(dossier.evidence)
    assert "pay_cite_999" in evidence_str or "pay_cite_999" in dossier.title or "pay_cite_999" in dossier.executive_summary
    assert "target.vpa@ybl" in evidence_str
