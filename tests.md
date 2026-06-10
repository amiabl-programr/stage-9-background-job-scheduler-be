# Testing Instructions

## Prerequisites
- Ensure the server is running: `npm run start:dev`
- Ensure Redis and Postgres are up (Docker Compose if using local)

---

## 1. Core CRUD

### Create a job
```bash
curl -X POST http://localhost:3000/api/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "send_email",
    "payload": { "to": "user@example.com", "subject": "Hello" },
    "priority": 1
  }'
```

### Create a recurring job
```bash
curl -X POST http://localhost:3000/api/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "send_email",
    "payload": { "to": "user@example.com", "subject": "Recurring" },
    "priority": 1,
    "recurringInterval": "every_1_minute"
  }'
```

### Create a job with dependency
```bash
curl -X POST http://localhost:3000/api/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "send_email",
    "payload": { "to": "user@example.com", "subject": "Dependent" },
    "dependsOn": ["<parent-job-id>"]
  }'
```

### List jobs (with filters)
```bash
curl "http://localhost:3000/api/v1/jobs?status=pending&page=1&limit=10"
```

### Get single job
```bash
curl http://localhost:3000/api/v1/jobs/<job-id>
```

### Cancel a job
```bash
curl -X PATCH http://localhost:3000/api/v1/jobs/<job-id>/cancel
```

### Delete a job
```bash
curl -X DELETE http://localhost:3000/api/v1/jobs/<job-id>
```

---

## 2. Dead Letter Queue

### List DLQ entries
```bash
curl http://localhost:3000/api/v1/dead-letter
```

### Retry a DLQ entry
```bash
curl -X POST http://localhost:3000/api/v1/dead-letter/<entry-id>/retry
```

---

## 3. SSE (Server-Sent Events)

### Connect to the event stream
```bash
curl -N http://localhost:3000/api/v1/jobs/events
```

Keep this running in one terminal. In another terminal, create/cancel jobs and watch events arrive in real time:
```
event: job.created
data: {"jobId":"...","type":"send_email","priority":1,"status":"pending"}

event: job.started
data: {"jobId":"...","type":"send_email","status":"processing"}

event: job.completed
data: {"jobId":"...","type":"send_email","status":"completed"}

event: job.cancelled
data: {"jobId":"...","status":"cancelled"}
```

---

## 4. Distributed Lock (multi-worker test)

### Terminal 1 — Start first worker
```bash
npm run start:worker
```

### Terminal 2 — Start second worker
```bash
npm run start:worker
```

### Create jobs
```bash
curl -X POST http://localhost:3000/api/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{"type":"send_email","payload":{"to":"a@b.com","subject":"Lock test"}}'
```

Observe that only **one** worker processes each job. The other logs:
```
WARN Job <id> is locked by another worker, skipping
```

---

## 5. DLQ Threshold Alert

Set threshold (default 10) and create failing jobs:
```bash
export DLQ_ALERT_THRESHOLD=3
```

Create 4 jobs that will fail (email jobs fail 20% of the time, or create many):
```bash
for i in 1 2 3 4; do
  curl -X POST http://localhost:3000/api/v1/jobs \
    -H "Content-Type: application/json" \
    -d '{"type":"send_email","payload":{"to":"fail@test.com","subject":"DLQ '$i'"}}'
done
```

The SSE stream shows a `dlq.threshold_exceeded` event:
```
event: dlq.threshold_exceeded
data: {"count":4,"threshold":3,"lastJobId":"..."}
```

---

## 6. Health Check
```bash
curl http://localhost:3000/api/health
# {"status":"ok","timestamp":"..."}
```

---

## 7. Swagger UI
```
http://localhost:3000/docs
```

---

## 8. Load Test with Autocannon

### Install autocannon
```bash
npm install -g autocannon
```

### Create jobs under load
```bash
autocannon -c 10 -d 30 \
  -m POST \
  -H "Content-Type: application/json" \
  -b '{"type":"send_email","payload":{"to":"load@test.com","subject":"Load test"}}' \
  http://localhost:3000/api/v1/jobs
```

### Mixed load (create + list + cancel in parallel)
```bash
autocannon -c 20 -d 60 \
  --requests '[
    {
      "method": "POST",
      "path": "/api/v1/jobs",
      "headers": { "Content-Type": "application/json" },
      "body": "{\"type\":\"send_email\",\"payload\":{\"to\":\"load@test.com\",\"subject\":\"Load test\"}}"
    },
    {
      "method": "GET",
      "path": "/api/v1/jobs"
    }
  ]' \
  http://localhost:3000
```

### SSE stress test (concurrent SSE clients)
```bash
autocannon -c 50 -d 30 http://localhost:3000/api/v1/jobs/events
```

### Expected metrics
| Metric | Target |
|---|---|
| Latency p99 | < 500ms |
| Requests/sec | > 500 |
| Error rate | 0% |

---

## 9. Dependency Graph — Cycle Detection

### This should succeed
```bash
JOB_A=$(curl -s -X POST http://localhost:3000/api/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{"type":"send_email","payload":{"to":"a@b.com","subject":"A"}}' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

JOB_B=$(curl -s -X POST http://localhost:3000/api/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{"type":"send_email","payload":{"to":"a@b.com","subject":"B"},"dependsOn":["'$JOB_A'"]}' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

curl -X POST http://localhost:3000/api/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{"type":"send_email","payload":{"to":"a@b.com","subject":"C"},"dependsOn":["'$JOB_B'"]}'
```

### This should fail (cycle)
```bash
curl -X POST http://localhost:3000/api/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{"type":"send_email","payload":{"to":"a@b.com","subject":"Cycle"},"dependsOn":["'$JOB_A'"]}'
# ❌ 400 — dependency cycle detected
```

---

## 10. Starvation Prevention

### Create jobs across priorities and verify aging
```bash
for p in 9 5 1; do
  curl -X POST http://localhost:3000/api/v1/jobs \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"send_email\",\"payload\":{\"to\":\"aging@test.com\",\"subject\":\"Priority $p\"},\"priority\":$p}"
done
```

High-priority jobs run first. After ~1 minute, low-priority jobs' effective priority ages up and they begin processing.
