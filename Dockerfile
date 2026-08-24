# syntax=docker/dockerfile:1
# Multi-stage build for TRACER backend (defense-only AI risk engine).
FROM python:3.11-slim AS builder
WORKDIR /build
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.11-slim AS runtime
WORKDIR /srv
# Copy pre-built wheels from builder stage.
COPY --from=builder /install /usr/local
COPY backend ./backend
COPY data ./data

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ENVIRONMENT=production \
    DOCS_ENABLED=false
EXPOSE 8000
# Canonical app factory entrypoint.
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
