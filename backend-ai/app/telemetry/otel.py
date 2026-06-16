"""
OpenTelemetry → Grafana Cloud OTLP (traces + metrics).
Enable with OTEL_EXPORTER_OTLP_ENDPOINT (see backend-ai/.env.example).
"""
from __future__ import annotations

import base64
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

_configured = False


def _trim_env(value: Optional[str]) -> str:
    if not value:
        return ""
    v = value.strip()
    if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
        return v[1:-1]
    return v


def _otlp_headers() -> Optional[str]:
    existing = _trim_env(os.getenv("OTEL_EXPORTER_OTLP_HEADERS"))
    if existing:
        return existing

    prebuilt = _trim_env(os.getenv("GRAFANA_OTLP_TOKEN"))
    if prebuilt:
        return f"Authorization=Basic {prebuilt}"

    instance_id = _trim_env(os.getenv("GRAFANA_INSTANCE_ID"))
    api_key = _trim_env(
        os.getenv("GRAFANA_CLOUD_API_KEY") or os.getenv("GRAFANA_API_KEY")
    )
    if instance_id and api_key:
        token = base64.b64encode(f"{instance_id}:{api_key}".encode()).decode()
        return f"Authorization=Basic {token}"

    return None


def configure() -> bool:
    """Initialize OTLP trace + metric providers. Returns True when active."""
    global _configured

    if _configured:
        return True

    if _trim_env(os.getenv("OTEL_SDK_DISABLED")).lower() == "true":
        return False

    endpoint = _trim_env(os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))
    if not endpoint:
        return False

    if ".vpce.grafana.net" in endpoint:
        print(
            "[otel] OTEL_EXPORTER_OTLP_ENDPOINT uses AWS PrivateLink; "
            "use the public OTLP gateway URL on Vultr.",
            flush=True,
        )

    headers_raw = _otlp_headers()
    if not headers_raw:
        print(
            "[otel] OTEL_EXPORTER_OTLP_ENDPOINT is set but auth is missing. "
            "Set GRAFANA_OTLP_TOKEN or GRAFANA_INSTANCE_ID + GRAFANA_CLOUD_API_KEY.",
            flush=True,
        )
        return False

    os.environ.setdefault("OTEL_EXPORTER_OTLP_ENDPOINT", endpoint)
    os.environ.setdefault("OTEL_EXPORTER_OTLP_HEADERS", headers_raw)

    service_name = _trim_env(os.getenv("OTEL_SERVICE_NAME")) or "engr-backend-ai"
    environment = _trim_env(os.getenv("ENVIRONMENT")) or "development"

    from opentelemetry import metrics
    from opentelemetry.exporter.otlp.proto.http.metric_exporter import (
        OTLPMetricExporter,
    )
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
        OTLPSpanExporter,
    )
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    resource = Resource.create(
        {
            "service.name": service_name,
            "deployment.environment": environment,
        }
    )

    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    from opentelemetry import trace

    trace.set_tracer_provider(tracer_provider)

    metric_reader = PeriodicExportingMetricReader(
        OTLPMetricExporter(),
        export_interval_millis=int(
            os.getenv("OTEL_METRIC_EXPORT_INTERVAL_MS", "60000")
        ),
    )
    meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
    metrics.set_meter_provider(meter_provider)

    _configured = True
    print(
        f"[otel] Exporting traces + metrics for {service_name} ({environment})",
        flush=True,
    )
    return True


def instrument_fastapi(app) -> None:
    if not _configured:
        return

    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

    FastAPIInstrumentor.instrument_app(app)
    HTTPXClientInstrumentor().instrument()
