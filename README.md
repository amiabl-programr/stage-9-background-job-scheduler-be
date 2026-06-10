# Background Job Scheduler

A NestJS-based background job scheduler with priority queuing, DAG dependencies, retry logic, dead-letter queue, and real-time SSE updates.

## Architecture

```
API (:3000) ──► PostgreSQL ──► Scheduler (heap) ──► BullMQ (Redis) ──► Worker
```

- **API** — REST endpoints for managing jobs
- **Scheduler** — tick-based loop, uses a min-heap to pick the highest-priority eligible job
- **Worker** — separate process consuming the BullMQ `jobs` queue
- **BullMQ** — Redis-backed job queue
- **PostgreSQL** — job persistence via TypeORM

## Features

| Feature | Status |
|---------|--------|
| Job CRUD (create, list, get, update, delete) | ✅ |
| Priority queuing (high / medium / low) | ✅ |
| Future scheduled jobs (`scheduledAt`) | ✅ |
| Recurring jobs (`every_1_minute`, `every_5_minutes`, `every_1_hour`) | ✅ |
| Min-heap priority queue | ✅ |
| DAG dependency resolution (`dependsOn`) | ✅ |
| Cycle detection on job creation | ✅ |
| Worker with email simulation handler | ✅ |
| Exponential backoff retry (1s → 5s → 25s) with jitter | ✅ |
| Dead-letter queue (DLQ) with manual retry | ✅ |
| Starvation prevention (aging-based `effectivePriority`) | ✅ |
| Health check (`GET /api/health`) | ✅ |
| Swagger docs (`GET /docs`) | ✅ |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL
- Redis

### Installation

```bash
pnpm install
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment |
| `PORT` | `3000` | API listen port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | — | Redis connection string |
| `SCHEDULER_TICK_MS` | `1000` | Scheduler tick interval (ms) |
| `STARVATION_THRESHOLD_MS` | `60000` | Time before a job ages 1 priority level |

### Running

```bash
# API server
pnpm start:dev

# Worker (separate terminal)
pnpm ts-node src/worker.ts
```

### Database

```bash
# Run migrations
pnpm migration:run

# Seed sample data
pnpm seed
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check (DB + Redis) |
| `POST` | `/api/v1/jobs` | Create a job |
| `GET` | `/api/v1/jobs` | List jobs (filtered, paginated) |
| `GET` | `/api/v1/jobs/:id` | Get job by ID |
| `PATCH` | `/api/v1/jobs/:id` | Update a job |
| `PATCH` | `/api/v1/jobs/:id/cancel` | Cancel a job |
| `DELETE` | `/api/v1/jobs/:id` | Delete a job |
| `GET` | `/api/v1/dead-letter` | List DLQ entries |
| `POST` | `/api/v1/dead-letter/:id/retry` | Retry from DLQ |
| `GET` | `/docs` | Swagger documentation |

## Starvation Prevention

Low-priority jobs age over time. Every 10 seconds, the scheduler recalculates `effectivePriority` for all `PENDING` jobs:

```
effectivePriority = max(0, priority - floor(ageMs / STARVATION_THRESHOLD_MS))
```

Default threshold: **60 seconds**. A priority-3 (LOW) job waiting 2 minutes gets `effectivePriority = 1` — same as HIGH priority.

## Retry Logic

Jobs are retried up to 3 times with exponential backoff + jitter:

| Attempt | Base Delay | With Jitter |
|---------|------------|-------------|
| 1 | 1s | ~1–1.2s |
| 2 | 5s | ~5–6s |
| 3 | 25s | ~25–30s |

After 3 failures, the job is marked `FAILED` and moved to the dead-letter queue.

## License

MIT
