#!/usr/bin/env bash
# Deploys what is on origin/main to https://eelkedevries.com/eek-a-calibrate/ by
# starting deploy-eek-a-calibrate.yml in the eelkedevries.com repository, which
# holds the SSH secrets. Needs a local `gh` login with access to that
# repository; nothing secret is stored here.
set -euo pipefail

SITE_REPO="eelkedevries/eelkedevries.com"
WORKFLOW="deploy-eek-a-calibrate.yml"
LIVE_URL="https://eelkedevries.com/eek-a-calibrate/"
MAX_RERUNS=3

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to deploy: the working tree has uncommitted changes." >&2
  exit 1
fi
git fetch --quiet origin main
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo "Refusing to deploy: HEAD is not origin/main. The workflow builds what is on GitHub; push first." >&2
  exit 1
fi
commit="$(git rev-parse --short HEAD)"

started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
gh workflow run "$WORKFLOW" -R "$SITE_REPO" --ref main
echo "Started $WORKFLOW for eek-a-calibrate $commit."

# The dispatch returns before the run exists, so poll for a run created after it.
run_id=""
for _ in $(seq 1 30); do
  run_id="$(gh run list -R "$SITE_REPO" --workflow "$WORKFLOW" --event workflow_dispatch --limit 5 \
    --json databaseId,createdAt --jq "[.[] | select(.createdAt >= \"$started\")] | last | .databaseId // empty")"
  [[ -n "$run_id" ]] && break
  sleep 2
done
if [[ -z "$run_id" ]]; then
  echo "Could not find the run that was just started." >&2
  exit 1
fi
echo "Run: https://github.com/$SITE_REPO/actions/runs/$run_id"

attempt=0
until gh run watch "$run_id" -R "$SITE_REPO" --exit-status --interval 10 >/dev/null; do
  failed_step="$(gh run view "$run_id" -R "$SITE_REPO" --json jobs \
    --jq '[.jobs[].steps[] | select(.conclusion == "failure") | .name] | first // ""')"
  # SiteGround intermittently drops GitHub's runners; a fresh runner usually gets through.
  if [[ "$failed_step" == "Test SSH connectivity" && "$attempt" -lt "$MAX_RERUNS" ]]; then
    attempt=$((attempt + 1))
    echo "Connection to the host timed out; re-running ($attempt of $MAX_RERUNS)."
    gh run rerun "$run_id" -R "$SITE_REPO" --failed
    sleep 5
    continue
  fi
  echo "Deploy failed at step: ${failed_step:-unknown}. See the run above." >&2
  exit 1
done

status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$LIVE_URL")"
if [[ "$status" != "200" ]]; then
  echo "Deploy finished, but $LIVE_URL returned HTTP $status." >&2
  exit 1
fi
echo "Deployed eek-a-calibrate $commit to $LIVE_URL (HTTP 200)."
