"""Razorpay test-mode webhook receiver.

Supported events: payment.captured, order.paid, dispute.created.
HMAC-SHA256 signature verification against RAZORPAY_WEBHOOK_SECRET when the
secret is configured; skipped (header marked unverified) in local dev.
"""
from __future__ import annotations

import hashlib
import hmac
import time
import uuid

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from backend.config import RAZORPAY_WEBHOOK_SECRET, REQUIRE_WEBHOOK_SECRET
from backend.core.engine import run_pipeline
from backend.schemas import (
    Context,
    Customer,
    EventType,
    Instrument,
    TransactionEvent,
    WebhookEnvelope,
)

router = APIRouter(prefix="/api/v1/webhooks", tags=["razorpay"])

_METHOD_MAP = {"upi": "upi", "card": "card", "netbanking": "netbanking",
               "emi": "card", "wallet": "wallet", "cod": "cod"}


def verify_signature(raw: bytes, signature: str | None) -> bool:
    if not RAZORPAY_WEBHOOK_SECRET:
        return False                     # dev mode: verification disabled
    if not signature:
        return False
    expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def _to_event(envelope: WebhookEnvelope) -> tuple[TransactionEvent, bool]:
    p = envelope.payload.get("payment") or {}
    d = envelope.payload.get("dispute") or {}
    notes = p.get("notes") or {}
    method_raw = str(p.get("method") or "upi").lower()
    amount = float(p.get("amount") or 0) / 100.0        # Razorpay sends paise
    if amount <= 0:
        amount = float(d.get("amount") or 0) / 100.0 or 999.0

    event_type = EventType.DISPUTE_CREATED if envelope.event == "dispute.created" \
        else (EventType.ORDER_PAID if envelope.event == "order.paid"
              else EventType.PAYMENT_CAPTURED)
    force_high = event_type is EventType.DISPUTE_CREATED

    created = p.get("created_at")
    if isinstance(created, (int, float)) and created < 100_000_000_000:
        created *= 1000                     # Razorpay sends epoch SECONDS
    elif not isinstance(created, (int, float)):
        created = time.time() * 1000

    ev = TransactionEvent(
        event_id=str(p.get("id") or d.get("id") or f"wh_{uuid.uuid4().hex[:10]}"),
        event_type=event_type,
        timestamp_ms=int(created),
        merchant_id=str(p.get("merchant_id") or "merchant_demo"),
        amount=round(amount, 2),
        currency=str(p.get("currency") or "INR"),
        customer=Customer(
            id=str(p.get("customer_id") or notes.get("customer_id")
                   or f"cust_{str(p.get('email') or 'anon')[:12]}"),
            new_customer=bool(notes.get("new_customer")),
            account_age_days=int(float(notes.get("account_age_days") or 365)),
            rto_rate_history=float(notes.get("rto_rate_history") or 0.0),
        ),
        instrument=Instrument(
            method=_METHOD_MAP.get(method_raw, "upi"),          # type: ignore[arg-type]
            vpa=p.get("vpa"),
            card_last4=(p.get("card") or {}).get("last4"),
            card_fingerprint=p.get("card_id") or notes.get("card_fingerprint"),
            bank=p.get("bank"),
            is_cod=bool(notes.get("is_cod")) or method_raw == "cod",
        ),
        context=Context(
            device_id=notes.get("device_id"),
            ip=p.get("ip_address") or notes.get("ip"),
            city=notes.get("city"),
            state=notes.get("state"),
            billing_shipping_mismatch=bool(notes.get("billing_shipping_mismatch")),
            email=p.get("email") or notes.get("email"),
            phone=p.get("contact") or notes.get("phone"),
            txn_count_1h=int(float(notes.get("txn_count_1h") or 1)),
            txn_count_24h=int(float(notes.get("txn_count_24h") or 1)),
            amount_sum_24h=float(notes.get("amount_sum_24h") or 0),
            distinct_devices_24h=int(float(notes.get("distinct_devices_24h") or 1)),
        ),
    )
    return ev, force_high


@router.post("/razorpay")
async def razorpay_webhook(request: Request) -> JSONResponse:
    raw = await request.body()
    signature = request.headers.get("X-Razorpay-Signature")
    signed = verify_signature(raw, signature)

    if not RAZORPAY_WEBHOOK_SECRET:
        # DEV/DEMO MODE — verification is skipped, and we SAY SO instead of
        # reporting an unchecked signature as verified.
        if REQUIRE_WEBHOOK_SECRET:
            return JSONResponse(
                status_code=403,
                content={"detail": "webhook rejected: RAZORPAY_WEBHOOK_SECRET "
                                   "is not configured (enforcement enabled)"},
            )
        envelope = WebhookEnvelope.model_validate_json(raw)
        ev, force_high = _to_event(envelope)
        evaluation = await run_pipeline(ev, force_high=force_high)
        body = evaluation.model_dump(mode="json")
        body["webhook_signature_verified"] = False
        body["webhook_verification_skipped_reason"] = (
            "no secret configured (dev/demo mode); set RAZORPAY_WEBHOOK_SECRET "
            "to enforce HMAC-SHA256 verification"
        )
        return JSONResponse(content=body, headers={"X-Tracer-Webhook": envelope.event})

    if not signed:
        return JSONResponse(status_code=401, content={"detail": "invalid webhook signature"})

    envelope = WebhookEnvelope.model_validate_json(raw)
    ev, force_high = _to_event(envelope)
    evaluation = await run_pipeline(ev, force_high=force_high)
    body = evaluation.model_dump(mode="json")
    body["webhook_signature_verified"] = True
    return JSONResponse(content=body, headers={"X-Tracer-Webhook": envelope.event})
