"""Pydantic v2 schemas — the strict contract between edge, engine and agent."""
from __future__ import annotations

import time
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class EventType(str, Enum):
    PAYMENT_CAPTURED = "payment.captured"
    ORDER_PAID = "order.paid"
    DISPUTE_CREATED = "dispute.created"


class AgentAction(str, Enum):
    AUTO_APPROVE = "AUTO_APPROVE"
    STEP_UP_AUTHENTICATION = "STEP_UP_AUTHENTICATION"
    PAUSE_PAYOUT_DISPUTE_DOSSIER = "PAUSE_PAYOUT_AND_GENERATE_DISPUTE_DOSSIER"


class RiskBand(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class Customer(BaseModel):
    id: str = "cust_anon"
    new_customer: bool = False
    account_age_days: int = 365
    rto_rate_history: float = 0.0  # 0..1 historical return-to-origin rate


class Instrument(BaseModel):
    method: Literal["upi", "card", "netbanking", "wallet", "cod"] = "upi"
    vpa: str | None = None
    card_last4: str | None = None
    card_fingerprint: str | None = None
    bank: str | None = None
    is_cod: bool = False


class Context(BaseModel):
    device_id: str | None = None
    ip: str | None = None
    city: str | None = None
    state: str | None = None
    country: str = "IN"
    billing_shipping_mismatch: bool = False
    email: str | None = None
    phone: str | None = None
    txn_count_1h: int = 1
    txn_count_24h: int = 1
    amount_sum_24h: float = 0.0
    distinct_devices_24h: int = 1
    hour_of_day: int = Field(default_factory=lambda: time.localtime().tm_hour)


class TransactionEvent(BaseModel):
    """Normalized internal event (also accepted directly by /risk/evaluate)."""

    event_id: str
    event_type: EventType = EventType.PAYMENT_CAPTURED
    timestamp_ms: int = Field(default_factory=lambda: int(time.time() * 1000))
    merchant_id: str = "merchant_demo"
    amount: float = Field(gt=0)
    currency: str = "INR"
    customer: Customer = Field(default_factory=Customer)
    instrument: Instrument = Field(default_factory=Instrument)
    context: Context = Field(default_factory=Context)

    @field_validator("amount")
    @classmethod
    def _round_amount(cls, v: float) -> float:
        return round(float(v), 2)


class ShapContribution(BaseModel):
    feature: str
    label: str
    value: Any
    contribution: float          # signed push towards risk (points of 100)
    direction: Literal["RISK_UP", "RISK_DOWN"]


class GraphEvidence(BaseModel):
    component_size: int = 1
    mule_nodes: list[str] = Field(default_factory=list)
    shared_device_vpas: int = 1
    ring_detected: bool = False
    ring_confidence: float = 0.0
    summary: str = ""


class DisputeDossier(BaseModel):
    dossier_id: str
    generated_by: Literal["llm", "template"]
    title: str
    executive_summary: str
    evidence: list[str] = Field(default_factory=list)
    shap_reason_codes: list[str] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)
    regulatory_note: str = ""
    raw_model_output: dict[str, Any] | None = None


class AgentTraceStep(BaseModel):
    ts_ms: int
    actor: Literal["edge", "model", "graph", "agent", "ledger", "policy"]
    message: str
    level: Literal["info", "warn", "alert", "success"] = "info"


class RiskEvaluation(BaseModel):
    """Strict JSON schema returned by the bounded agent pipeline."""

    event_id: str
    risk_score: int = Field(ge=0, le=100)
    risk_band: RiskBand
    decision: AgentAction
    latency_ms: float
    top_factors: list[ShapContribution]
    graph_evidence: GraphEvidence
    trace: list[AgentTraceStep]
    dispute_dossier: DisputeDossier | None = None
    audit_ref: str
    model_version: str
    idempotent_replay: bool = False


class WebhookEnvelope(BaseModel):
    """Subset of Razorpay webhook envelope we rely on (test-mode compatible)."""

    event: str
    payload: dict[str, Any] = Field(default_factory=dict)


class ModelInfo(BaseModel):
    """Versioned model metadata surfaced by GET /api/v1/model/info."""

    model_version: str
    artifact_sha256: str
    artifact_path: str
    training_date: str
    feature_count: int
    feature_names: list[str]
    model_kind: str
