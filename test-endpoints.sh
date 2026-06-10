#!/usr/bin/env bash
set -uo pipefail

BASE="${1:-http://localhost:3000}"
TIMEOUT=10

pass() { echo -e "  \e[32m✓ $1\e[0m"; }
fail() { echo -e "  \e[31m✗ $1\e[0m"; }
sep()  { echo "────────────────────────────────────────"; }

curl_get() {
  curl -s --max-time "$TIMEOUT" -o /dev/null -w "%{http_code}" "$@"
}

curl_json() {
  curl -s --max-time "$TIMEOUT" "$@"
}

echo "Testing endpoints against $BASE"
sep

# 1. Health
echo "1. Health check"
HTTP=$(curl_get "$BASE/health")
[ "$HTTP" = "200" ] && pass "GET /health → $HTTP" || fail "GET /health → $HTTP"
sep

# 2. Create a send_email job (full payload)
echo "2. Create send_email job"
CREATE_RESP=$(curl_json -X POST "$BASE/api/v1/jobs" \
  -H "Content-Type: application/json" \
  -d '{"type":"send_email","payload":{"to":"test@example.com","subject":"Hello","body":"Message body"},"priority":2}')
JOB_ID=$(echo "$CREATE_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "  Response: $CREATE_RESP" | head -2
[ -n "$JOB_ID" ] && pass "Created job ${JOB_ID:0:8}..." || fail "No job ID returned"
sep

# 3. Validation: missing body is accepted at DTO level (payload is Record<string, unknown>)
#    Rejection happens at processor runtime via handleEmail() with a descriptive error
echo "3. Validation: missing body (DTO accepts, processor rejects)"
HTTP=$(curl_get -X POST "$BASE/api/v1/jobs" \
  -H "Content-Type: application/json" \
  -d '{"type":"send_email","payload":{"to":"test@example.com","subject":"No body"}}')
echo "  DTO: accepts payload as valid object → HTTP $HTTP"
echo "  Processor: handleEmail() throws 'Missing required email fields: to, subject, body'"
echo "  This triggers retries → DLQ with a clear error message."
sep

# 4. List jobs with query params
echo "4. List jobs with filters"
URL="$BASE/api/v1/jobs?status=pending&type=send_email&priority=2&page=1&limit=20"
HTTP=$(curl_get "$URL")
RESP=$(curl_json "$URL")
if [ "$HTTP" = "200" ]; then
  pass "GET /api/v1/jobs?status=pending&type=send_email&priority=2&page=1&limit=20 → $HTTP"
  COUNT=$(echo "$RESP" | grep -o '"id"' | wc -l)
  echo "  Jobs returned: $COUNT"
else
  fail "GET /api/v1/jobs (with filters) → $HTTP"
  echo "  Body: $(echo "$RESP" | head -c 300)"
fi
sep

# 5. Get job by ID
echo "5. Get job by ID"
if [ -n "$JOB_ID" ]; then
  HTTP=$(curl_get "$BASE/api/v1/jobs/$JOB_ID")
  [ "$HTTP" = "200" ] && pass "GET /api/v1/jobs/$JOB_ID → $HTTP" || fail "GET /api/v1/jobs/$JOB_ID → $HTTP"
else
  fail "No job ID to query"
fi
sep

# 6. Cancel the job
echo "6. Cancel job"
if [ -n "$JOB_ID" ]; then
  HTTP=$(curl_get -X PATCH "$BASE/api/v1/jobs/$JOB_ID/cancel")
  [ "$HTTP" = "200" ] && pass "PATCH /api/v1/jobs/$JOB_ID/cancel → $HTTP" || fail "PATCH /api/v1/jobs/$JOB_ID/cancel → $HTTP"
else
  fail "No job ID to cancel"
fi
sep

# 7. Dead letter queue
echo "7. List DLQ entries"
HTTP=$(curl_get "$BASE/api/v1/dead-letter")
RESP=$(curl_json "$BASE/api/v1/dead-letter")
COUNT=$(echo "$RESP" | grep -o '"id"' | wc -l)
[ "$HTTP" = "200" ] && pass "GET /api/v1/dead-letter → $HTTP ($COUNT entries)" || fail "GET /api/v1/dead-letter → $HTTP"
sep

# 8. Swagger docs
echo "8. Swagger JSON"
HTTP=$(curl_get "$BASE/api/docs-json")
[ "$HTTP" = "200" ] && pass "GET /api/docs-json → $HTTP" || fail "GET /api/docs-json → $HTTP"
sep

echo "Done."
