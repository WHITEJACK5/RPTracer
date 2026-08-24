# ---- Builder stage: install deps + (optionally) train/validate model -------
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build
COPY backend/requirements.txt ./requirements.txt
RUN pip install --upgrade pip && pip install -r requirements.txt

# ---- Runtime stage: slim image with only what's needed ---------------------
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TRACER_ENVIRONMENT=production \
    TRACER_DOCS_ENABLED=false

# Bring in the installed packages from the builder.
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

WORKDIR /app

# Backend package + artifacts + data (ground-truth process for the model).
COPY backend/ ./backend/
COPY data/ ./data/

# Run as non-root; bind to all interfaces for container orchestration.
RUN useradd -m -u 10001 tracer && chown -R tracer:tracer /app
USER tracer

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz').status==200 else 1)"

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
