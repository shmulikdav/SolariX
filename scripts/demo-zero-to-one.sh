#!/usr/bin/env bash
#
# Solix — zero to one demo / test plan.
#
# Takes a fresh clone to a running command center and sets the stage to
# demonstrate the headline capability: real, blocking human-in-the-loop
# approvals over a live Claude Code session.
#
# This script automates everything up to (and including) an automated check of
# the local-API token auth, then hands off to YOU for the interactive part
# (running a real `claude` session and approving/denying a tool in the browser).
#
# Requirements: Node >= 20, pnpm, and a real `claude` binary on PATH.
# Companion checklist: ZERO-TO-ONE.md
#
set -euo pipefail

PORT="${SOLIX_PORT:-4242}"
HOST="127.0.0.1"
BASE="http://${HOST}:${PORT}"
# Make sure every `solix` subcommand (demo, goal, schedule, …) talks to the
# same server we're starting — they read SOLIX_PORT as a fallback.
export SOLIX_PORT="$PORT"

# Resolve repo root from this script's location (scripts/ lives at the root).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$ROOT"

CLI="node ${ROOT}/packages/cli/dist/index.js"
SERVER_PID=""
SERVER_LOG=""
WORK=""

c_bold() { printf '\033[1m%s\033[0m\n' "$*"; }
c_ok()   { printf '\033[32m  ✓ %s\033[0m\n' "$*"; }
c_warn() { printf '\033[33m  ! %s\033[0m\n' "$*"; }
c_err()  { printf '\033[31m  ✗ %s\033[0m\n' "$*"; }
phase()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

cleanup() {
  local code=$?
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    printf '\n'
    c_bold "Stopping Solix server (pid ${SERVER_PID})…"
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  [ -n "$WORK" ] && [ -d "$WORK" ] && rm -rf "$WORK"
  exit "$code"
}
trap cleanup EXIT INT TERM

# ──────────────────────────────────────────────────────────────────────────
phase "Phase 0 — Preflight"

if ! command -v node >/dev/null 2>&1; then
  c_err "Node.js not found. Install Node >= 20 (https://nodejs.org)."; exit 1
fi
if ! node -e 'process.exit(parseInt(process.versions.node.split(".")[0],10) >= 20 ? 0 : 1)'; then
  c_err "Node >= 20 required (found $(node --version))."; exit 1
fi
c_ok "node $(node --version)"

if ! command -v pnpm >/dev/null 2>&1; then
  c_err "pnpm not found. Install with: npm install -g pnpm"; exit 1
fi
c_ok "pnpm $(pnpm --version)"

if ! command -v claude >/dev/null 2>&1; then
  c_err "This demo needs a real Claude Code binary on PATH (the enforcing gate"
  c_err "can only truly block a live session). Install Claude Code, then re-run."
  exit 1
fi
c_ok "claude $(claude --version 2>/dev/null | head -n1 || echo 'present')"

# Refuse to start if something is already listening on the port.
if curl -fsS -o /dev/null --max-time 2 "${BASE}/api/health" 2>/dev/null; then
  c_err "Something is already serving ${BASE}. Stop it, or re-run with"
  c_err "  SOLIX_PORT=5454 bash scripts/demo-zero-to-one.sh"
  exit 1
fi
c_ok "port ${PORT} is free"

# ──────────────────────────────────────────────────────────────────────────
phase "Phase 1 — Build"

if [ ! -d "${ROOT}/node_modules" ]; then
  c_bold "Installing dependencies (first run, ~2-3 min)…"
  pnpm install
else
  c_ok "dependencies already installed"
fi
c_bold "Building all packages…"
pnpm -r build
c_ok "built web UI, server, and CLI"

# ──────────────────────────────────────────────────────────────────────────
phase "Phase 2 — Install hooks + token"
# Wires ~/.claude/settings.json (backed up automatically), copies hook scripts
# to ~/.solix/hooks, and writes the ~/.solix/token shared secret.
$CLI install
c_ok "hooks wired; ~/.claude/settings.json backed up to settings.solix.backup.json"
c_ok "shared secret written to ~/.solix/token"

# ──────────────────────────────────────────────────────────────────────────
phase "Phase 3 — Doctor"
$CLI doctor || c_warn "doctor reported warnings (continuing)"

# ──────────────────────────────────────────────────────────────────────────
phase "Phase 4 — Start the server (background, gate-ready)"
SERVER_LOG="$(mktemp -t solix-server.XXXXXX.log)"
SOLIX_GATE_TIMEOUT_MS=300000 $CLI start --no-open --port "$PORT" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
c_ok "server starting (pid ${SERVER_PID}); logs: ${SERVER_LOG}"

c_bold "Waiting for ${BASE}/api/health…"
for _ in $(seq 1 40); do
  if curl -fsS -o /dev/null --max-time 2 "${BASE}/api/health" 2>/dev/null; then
    c_ok "server is up at ${BASE}"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    c_err "server exited during startup. Last log lines:"; tail -n 20 "$SERVER_LOG"; exit 1
  fi
  sleep 0.5
done
if ! curl -fsS -o /dev/null --max-time 2 "${BASE}/api/health" 2>/dev/null; then
  c_err "server did not become healthy. Log:"; tail -n 20 "$SERVER_LOG"; exit 1
fi

# ──────────────────────────────────────────────────────────────────────────
phase "Phase 5 — Light up the galaxy + auth sanity check"

$CLI demo --port "$PORT" || c_warn "demo seeding reported an issue (continuing)"
c_ok "seeded synthetic planets, an over-budget flare, and a permission request"
$CLI goal add "Zero to One" >/dev/null 2>&1 && c_ok 'created goal "Zero to One"' || true

# Automated proof of the local-API token layer (no browser needed).
TOKEN="$(cat "${SOLIX_HOME:-$HOME/.solix}/token" 2>/dev/null || echo '')"
EVENT_BODY='{"event":"notification","payload":{},"pid":0,"cwd":"/tmp","ts":0}'

code_no="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
  -X POST "${BASE}/events" -H 'Content-Type: application/json' -d "$EVENT_BODY" || echo 000)"
if [ "$code_no" = "401" ]; then
  c_ok "POST /events WITHOUT token → 401 (rejected, as expected)"
else
  c_warn "POST /events without token → ${code_no} (expected 401; is this a pre-token install? re-run \`solix install\`)"
fi

code_yes="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
  -X POST "${BASE}/events" -H 'Content-Type: application/json' \
  -H "X-Solix-Token: ${TOKEN}" -d "$EVENT_BODY" || echo 000)"
if [ "$code_yes" = "200" ]; then
  c_ok "POST /events WITH token → 200 (accepted)"
else
  c_err "POST /events with token → ${code_yes} (expected 200)"
fi

# ──────────────────────────────────────────────────────────────────────────
phase "Phase 6 — Your turn: the live approval gate (the payoff)"

WORK="$(mktemp -d -t solix-demo-repo.XXXXXX)"
( cd "$WORK" && git init -q && printf '# Demo repo for Solix gate test\n' > README.md && git add -A && git commit -qm "init" )
c_ok "created a throwaway git repo for the demo session: ${WORK}"

cat <<EOF

$(c_bold "Solix is running. Now drive a REAL claude session through the gate:")

  1) Open this in your browser:
         ${BASE}
     You'll see the sun, the 5 advisor planets, and the demo activity
     (a red permission flare, an orange over-budget planet, comet streaks).

  2) In a SECOND terminal, start a gated Claude Code session:
         cd ${WORK}
         export SOLIX_GATE_ENABLED=1     # turn the ENFORCING gate ON
         export SOLIX_PORT=${PORT}
         claude
     (SOLIX_GATE_ENABLED must be set in the claude terminal — the hooks read
      it from claude's own environment, not the server's.)

  3) Give claude a prompt that uses a gated tool, e.g.:
         create a file called hello.txt containing "hi"
       — or —
         run \`ls -la\` and show me the output

  4) WATCH THE BROWSER:
       • a new planet appears for your session
       • the tool call BLOCKS — claude visibly waits
       • a Decision Queue card shows the actual command / file write
       • press  Y  to APPROVE  → the tool runs and claude continues
         press  N  to DENY     → the tool is blocked and claude is told so

  5) Prove it never wedges you (fail-open). Stop this script (Ctrl+C) or in the
     claude terminal run:  unset SOLIX_GATE_ENABLED
     …then repeat step 3: the same prompt now proceeds without blocking —
     Solix falls back to pure observability.

See ZERO-TO-ONE.md for the full checklist and SECURITY.md for the trust model
and every gate env var (SOLIX_GATE_POLICY, SOLIX_GATE_TIMEOUT, …).

$(c_bold "Press Ctrl+C here when you're done — the server stops and cleans up.")
EOF

# Keep the server alive for the interactive session; Ctrl+C → trap → cleanup.
wait "$SERVER_PID"
