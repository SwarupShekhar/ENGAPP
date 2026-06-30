import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

export const register = new Registry();
collectDefaultMetrics({ register });

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [register],
});

export const bullQueueWaiting = new Gauge({
  name: 'bull_queue_waiting',
  help: 'Number of jobs waiting in a Bull queue',
  labelNames: ['queue'] as const,
  registers: [register],
});

export const bullQueueActive = new Gauge({
  name: 'bull_queue_active',
  help: 'Number of jobs actively processing in a Bull queue',
  labelNames: ['queue'] as const,
  registers: [register],
});

export const redisConnected = new Gauge({
  name: 'redis_connected',
  help: 'Whether the app Redis client can ping successfully (1 = up, 0 = down)',
  registers: [register],
});

export const socketConnectionsActive = new Gauge({
  name: 'socket_connections_active',
  help: 'Total active Socket.io connections across all gateways',
  registers: [register],
});

/** Collapse UUIDs and numeric ids to keep Prometheus label cardinality bounded. */
export function normalizeRoute(path: string): string {
  return path
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      '/:id',
    )
    .replace(/\/\d+/g, '/:id');
}
