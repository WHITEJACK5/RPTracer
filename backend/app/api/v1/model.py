"""Ops endpoints — model report/info and sandbox presets."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Request

from backend.app.core.config import MODEL_PATH, PROJECT_ROOT
from backend.app.core.rate_limit import rate_limit
from backend.app.models.schemas import ModelInfo

router = APIRouter(tags=["ops"], dependencies=[Depends(rate_limit)])


@router.get("/api/v1/model/report")
def model_report() -> dict:
    """Live honest-metrics card: synthetic GT holdout + FP cost per 1k legit."""
    from backend.app.models.report import get_report

    return get_report()


@router.get("/api/v1/model/info", response_model=ModelInfo)
def model_info() -> ModelInfo:
    """Versioned model metadata: artifact hash, training date, feature list."""
    from backend.app.core.config import MODEL_TRAINING_DATE
    from backend.app.models.risk_model import FEATURES, get_risk_model

    model = get_risk_model()
    return ModelInfo(
        model_version=model.version(),
        artifact_sha256=model.artifact_sha256(),
        artifact_path=str(MODEL_PATH),
        training_date=MODEL_TRAINING_DATE,
        feature_count=len(FEATURES),
        feature_names=list(FEATURES),
        model_kind=model.kind,
    )


@router.get("/api/v1/presets")
def presets(request: Request) -> dict:
    path = PROJECT_ROOT / "data" / "sample_payloads.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}
