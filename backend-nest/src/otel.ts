/**
 * OpenTelemetry → Grafana Cloud OTLP (traces + metrics, RED in Application Observability).
 * Must load before Nest/Express (imported first in main.ts).
 *
 * Enable by setting OTEL_EXPORTER_OTLP_ENDPOINT on the server (see backend-nest/.env.example).
 */
import { config as loadEnv } from 'dotenv';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
} from '@opentelemetry/semantic-conventions';

// OTel runs before Nest ConfigModule; load backend-nest/.env here.
loadEnv({ path: ['.env', '.env.local'] });

function trimEnv(value: string | undefined): string {
  const v = value?.trim() ?? '';
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

function isOtelEnabled(): boolean {
  if (process.env.OTEL_SDK_DISABLED === 'true') return false;
  return Boolean(trimEnv(process.env.OTEL_EXPORTER_OTLP_ENDPOINT));
}

function warnIfPrivateLinkEndpoint(endpoint: string): void {
  if (!endpoint.includes('.vpce.grafana.net')) return;
  console.warn(
    '[otel] OTEL_EXPORTER_OTLP_ENDPOINT uses AWS PrivateLink (.vpce.grafana.net). ' +
      'That hostname only works from resources inside the linked AWS VPC. ' +
      'On Vultr or your laptop, use the public OTLP URL from Grafana Cloud → OpenTelemetry ' +
      '(e.g. https://otlp-gateway-prod-ap-south-0.grafana.net/otlp).',
  );
}

function applyGrafanaOtlpAuth(): void {
  if (process.env.OTEL_EXPORTER_OTLP_HEADERS?.trim()) return;

  const prebuilt = trimEnv(process.env.GRAFANA_OTLP_TOKEN);
  if (prebuilt) {
    process.env.OTEL_EXPORTER_OTLP_HEADERS = `Authorization=Basic ${prebuilt}`;
    return;
  }

  const instanceId = trimEnv(process.env.GRAFANA_INSTANCE_ID);
  const apiKey = trimEnv(
    process.env.GRAFANA_CLOUD_API_KEY || process.env.GRAFANA_API_KEY,
  );
  if (instanceId && apiKey) {
    const basic = Buffer.from(`${instanceId}:${apiKey}`).toString('base64');
    process.env.OTEL_EXPORTER_OTLP_HEADERS = `Authorization=Basic ${basic}`;
    return;
  }

  console.warn(
    '[otel] OTEL_EXPORTER_OTLP_ENDPOINT is set but OTLP auth is missing. ' +
      'Set GRAFANA_OTLP_TOKEN (Base64 from Grafana OpenTelemetry page) or ' +
      'GRAFANA_INSTANCE_ID + GRAFANA_CLOUD_API_KEY.',
  );
}

if (isOtelEnabled()) {
  const endpoint = trimEnv(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
  warnIfPrivateLinkEndpoint(endpoint);
  applyGrafanaOtlpAuth();

  const serviceName =
    trimEnv(process.env.OTEL_SERVICE_NAME) || 'engr-backend-nest';
  const environment = process.env.NODE_ENV || 'development';

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: environment,
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: Number(
        process.env.OTEL_METRIC_EXPORT_INTERVAL_MS || 60_000,
      ),
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Reduce noise; HTTP metrics/traces are what we need for latency.
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
  });

  sdk.start();
  console.info(`[otel] Exporting traces + metrics for ${serviceName} (${environment})`);

  const shutdown = () => {
    void sdk.shutdown();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
