"""Model info endpoint tests (versioning / artifact hashing)."""
from __future__ import annotations

import hashlib


def test_model_info_contract(client) -> None:
    r = client.get("/api/v1/model/info")
    assert r.status_code == 200
    body = r.json()
    for key in ("model_version", "artifact_sha256", "training_date",
                "feature_count", "feature_names", "model_kind"):
        assert key in body
    assert body["feature_count"] == len(body["feature_names"])
    assert body["feature_count"] > 0
    # sha256 is 64 hex chars (or empty when artifact absent)
    assert body["artifact_sha256"] == "" or (
        len(body["artifact_sha256"]) == 64
        and int(body["artifact_sha256"], 16) is not None)


def test_model_info_sha_matches_artifact(client) -> None:
    # Only meaningful when the artifact file exists on disk.
    import pathlib

    from backend.app.core.config import MODEL_PATH

    r = client.get("/api/v1/model/info")
    body = r.json()
    if MODEL_PATH.exists():
        digest = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()
        assert body["artifact_sha256"] == digest
