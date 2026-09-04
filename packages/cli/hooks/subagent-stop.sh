#!/bin/sh
# Solix hook template — copied per-event with EVENT name baked in.
# Critical properties:
#   --max-time 1   never block Claude Code if Solix is down
#   || true        never fail; a non-zero exit could block the agent
#   redirect both  hooks must not pollute stdout/stderr
SOLIX_PORT="${SOLIX_PORT:-4242}"
EVENT="subagent_stop"
PAYLOAD=$(cat 2>/dev/null || echo '{}')
[ -z "$PAYLOAD" ] && PAYLOAD='{}'
TS=$(($(date +%s 2>/dev/null || echo 0) * 1000))
TOKEN=$(cat "${SOLIX_HOME:-$HOME/.solix}/token" 2>/dev/null || echo "")
curl -s -X POST "http://127.0.0.1:${SOLIX_PORT}/events" \
  -H "Content-Type: application/json" \
  -H "X-Solix-Token: $TOKEN" \
  -d "{\"event\":\"$EVENT\",\"payload\":$PAYLOAD,\"pid\":$PPID,\"cwd\":\"$(pwd)\",\"ts\":$TS}" \
  --max-time 1 > /dev/null 2>&1 || true
exit 0
