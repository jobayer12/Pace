set -euo pipefail

cd "$(dirname "$0")"

LABEL="${1:?usage: ./run-steps.sh <label> [extra k6 args...]}"
shift

BASE_URL="${BASE_URL:-https://loadtest.jobayer.me}"
STEPS="${STEPS:-2000}"
DURATION="${DURATION:-10m}"
COOLDOWN="${COOLDOWN:-30}"

OUT="results/${LABEL}"
mkdir -p "$OUT"

for vus in $STEPS; do
  echo
  echo ">>> ${LABEL}: ${vus} users for ${DURATION} against ${BASE_URL}"
  k6 run \
    -e BASE_URL="$BASE_URL" \
    -e MODE=max \
    -e VUS="$vus" \
    -e DURATION="$DURATION" \
    -e SUMMARY_FILE="${OUT}/vus-${vus}.json" \
    "$@" \
    load-test.js 2>&1 | tee "${OUT}/vus-${vus}.txt"

  if [ "$vus" != "${STEPS##* }" ]; then
    echo ">>> cooling down ${COOLDOWN}s"
    sleep "$COOLDOWN"
  fi
done

{
  echo
  echo "================ ${LABEL}: STEP COMPARISON ================"
  printf '%-6s %10s %10s %10s %9s %8s %8s %10s %10s %10s\n' \
    users 'req/s' 'ok req/s' total failed 'fail %' slow p50 p95 p99
  for vus in $STEPS; do
    jq -r --arg vus "$vus" '
      def ms: if . == null then "-" else "\(. * 100 | round / 100)ms" end;
      [ $vus,
        (.throughput.req_per_sec | round),
        (.throughput.successful_req_per_sec | round),
        .requests.total,
        .requests.failed,
        (if .requests.total > 0 then (.requests.failed / .requests.total * 10000 | round / 100 | tostring) + "%" else "-" end),
        .requests.slow,
        (.latency_ms.med | ms),
        (.latency_ms["p(95)"] | ms),
        (.latency_ms["p(99)"] | ms)
      ] | @tsv' "${OUT}/vus-${vus}.json" |
      awk -F'\t' '{ printf "%-6s %10s %10s %10s %9s %8s %8s %10s %10s %10s\n", $1,$2,$3,$4,$5,$6,$7,$8,$9,$10 }'
  done
  echo "failed = 5xx/4xx (not 404) + timeouts + responses slower than SLOW_MS (3s)"
  echo "==========================================================="
} | tee "${OUT}/comparison.txt"
