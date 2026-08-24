"""RFC 7807 problem+json error envelope tests."""
from __future__ import annotations


def test_validation_error_uses_problem_json(client) -> None:
    # amount is required and must be > 0; omit it to force a 422.
    r = client.post("/api/v1/evaluate", json={"event_id": "bad"})
    assert r.status_code == 422
    ctype = r.headers.get("content-type", "")
    assert "application/problem+json" in ctype
    body = r.json()
    assert body["status"] == 422
    assert "title" in body and "detail" in body and "type" in body


def test_negative_amount_rejected_with_problem(client) -> None:
    r = client.post("/api/v1/evaluate", json={
        "event_id": "neg", "amount": -5,
        "instrument": {"method": "upi", "vpa": "x@ybl"}})
    assert r.status_code == 422
    assert r.json()["type"].startswith("about:blank") or "problem" in r.headers.get("content-type", "")
