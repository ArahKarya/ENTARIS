#!/usr/bin/env bash
# Entaris API smoke test.
#
# Read-only by default: health, login (cookie + CSRF), session, CSRF and language checks, then
# every parameterless GET route from the server's route inventory (no hand-kept list to go stale).
# --write adds a small write flow that cleans up after itself (a test party and the caller's own
# language preference). Never changes passwords. Do not use --write against production.
#
# Usage:
#   API_PASSWORD=... ./test-api.sh                 # read-only smoke against http://localhost:3001
#   API_PASSWORD=... ./test-api.sh --write         # plus the write flow (dev/staging only)
#   BASE_URL=https://erp.example.com API_USER=me@x API_PASSWORD=... ./test-api.sh
#
# Env: BASE_URL (default http://localhost:3001), API_USER (default admin@entaris.demo),
#      API_PASSWORD (required), ROUTES_FILE (default server/scripts/ai-tools/out/route-inventory.json,
#      generated with `npm --prefix server run ai-tools:inventory` when missing), DELAY (seconds between
#      GET requests, default 0.25, keeps under the 300 req/min API limiter).
# Exit code: 0 when nothing failed (warnings allowed), 1 otherwise.
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
API_USER="${API_USER:-admin@entaris.demo}"
API_PASSWORD="${API_PASSWORD:-}"
DELAY="${DELAY:-0.25}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
ROUTES_FILE="${ROUTES_FILE:-$ROOT/server/scripts/ai-tools/out/route-inventory.json}"
WRITE=false
[ "${1:-}" = "--write" ] && WRITE=true

for bin in curl jq; do
  command -v "$bin" >/dev/null || { echo "Butuh '$bin' terpasang."; exit 1; }
done
[ -n "$API_PASSWORD" ] || { echo "Atur API_PASSWORD (password untuk $API_USER)."; exit 1; }

WORK="$(mktemp -d)"
JAR="$WORK/cookies.txt"
trap 'rm -rf "$WORK"' EXIT

PASS=0; FAIL=0; WARN=0
FAILURES=(); WARNINGS=()
ok()   { PASS=$((PASS + 1)); }
bad()  { FAIL=$((FAIL + 1)); FAILURES+=("$1"); echo "  GAGAL  $1"; }
warn() { WARN=$((WARN + 1)); WARNINGS+=("$1"); }
section() { echo; echo "== $1"; }

# request METHOD PATH [JSON_BODY] [extra curl args...] -> sets STATUS, BODY_FILE
BODY_FILE="$WORK/body"
request() {
  local method="$1" path="$2" body="${3:-}"; shift 3 2>/dev/null || shift $#
  local csrf; csrf="$(awk '$6=="csrf-token"{print $7}' "$JAR" 2>/dev/null | tail -1)"
  local args=(-s -o "$BODY_FILE" -w '%{http_code}' -X "$method" -b "$JAR" -c "$JAR" "$BASE_URL$path")
  [ -n "$csrf" ] && args+=(-H "X-CSRF-Token: $csrf")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' --data "$body")
  STATUS="$(curl "${args[@]}" "$@")"
}
expect_status() { # LABEL EXPECTED
  if [ "$STATUS" = "$2" ]; then ok; else bad "$1: status $STATUS, harap $2 ($(head -c 200 "$BODY_FILE"))"; fi
}

section "Server"
request GET /health ""
expect_status "GET /health" 200

section "Autentikasi"
request POST /api/auth/login "$(jq -nc --arg u "$API_USER" '{username:$u,password:"salah-password-uji"}')"
expect_status "Login dengan password salah" 401
request POST /api/auth/login "$(jq -nc --arg u "$API_USER" '{username:$u,password:"salah-password-uji"}')" -H 'X-Entaris-Lang: en'
if jq -e '.error | test("[Ii]ncorrect|[Ii]nvalid")' "$BODY_FILE" >/dev/null 2>&1; then ok; else bad "Pesan galat English (X-Entaris-Lang: en): $(head -c 120 "$BODY_FILE")"; fi

request POST /api/auth/login "$(jq -nc --arg u "$API_USER" --arg p "$API_PASSWORD" '{username:$u,password:$p}')"
expect_status "Login" 200
[ "$STATUS" = 200 ] || { echo "Login gagal; pengujian dihentikan."; exit 1; }
USER_ID="$(jq -r '.user.id' "$BODY_FILE")"
LANGUAGE_BEFORE="$(jq -r '.user.languagePreference // empty' "$BODY_FILE")"
awk '$6=="csrf-token"' "$JAR" | grep -q . && ok || bad "Cookie csrf-token tidak diterima"

request GET /api/auth/me ""
expect_status "GET /api/auth/me" 200
[ "$(jq -r '.user.id' "$BODY_FILE")" = "$USER_ID" ] && ok || bad "/auth/me mengembalikan user lain"

# A mutation without the CSRF header must be refused.
STATUS="$(curl -s -o "$BODY_FILE" -w '%{http_code}' -X PUT -b "$JAR" -H 'Content-Type: application/json' \
  --data '{"language":null}' "$BASE_URL/api/users/me/language")"
expect_status "Mutasi tanpa header CSRF ditolak" 403

section "Semua route GET tanpa parameter"
if [ ! -f "$ROUTES_FILE" ]; then
  echo "  Inventori route belum ada, membangkitkan..."
  npm --prefix "$ROOT/server" run --silent ai-tools:inventory >/dev/null 2>&1 || { bad "Gagal membangkitkan inventori route"; }
fi
if [ -f "$ROUTES_FILE" ]; then
  # Portable read loop (macOS ships bash 3.2 without mapfile).
  # Each line: path<TAB>yes|no (yes = the route reads query parameters, so a 400 for missing ones is expected).
  ROUTES=()
  while IFS= read -r line; do ROUTES+=("$line"); done < <(jq -r '
    [.[] | select(.method=="GET" and (.path|contains(":")|not) and (.path|startswith("/api/")))]
    | group_by(.path)[] | [.[0].path, (if any(.[]; (.queryKeys|length) > 0 or (.querySchemas|length) > 0) then "yes" else "no" end)]
    | @tsv' "$ROUTES_FILE")
  echo "  ${#ROUTES[@]} route"
  NEEDS_PARAMS=0
  for entry in "${ROUTES[@]}"; do
    path="${entry%%$'\t'*}"
    takes_query="${entry##*$'\t'}"
    request GET "$path" ""
    case "$STATUS" in
      2??) ok ;;
      5??|000) bad "GET $path: status $STATUS ($(head -c 160 "$BODY_FILE"))" ;;
      400)
        # Routes with required query parameters answer 400 when called bare: expected.
        if [ "$takes_query" = yes ]; then ok; NEEDS_PARAMS=$((NEEDS_PARAMS + 1)); else warn "GET $path: 400 $(head -c 120 "$BODY_FILE")"; fi ;;
      *)
        # AIRA endpoints answer 403 agentic_disabled while the kill switch is off: expected.
        if grep -q 'agentic_disabled' "$BODY_FILE"; then ok; else warn "GET $path: $STATUS $(head -c 120 "$BODY_FILE")"; fi ;;
    esac
    sleep "$DELAY"
  done
  [ "$NEEDS_PARAMS" -gt 0 ] && echo "  $NEEDS_PARAMS route menjawab 400 karena butuh parameter query (wajar)."
fi

if $WRITE; then
  section "Alur tulis (membersihkan sendiri)"
  NAME="Uji API $(date +%Y%m%d%H%M%S)"
  request POST /api/parties "$(jq -nc --arg n "$NAME" '{name:$n,partyType:"Customer",email:"uji-api@example.test"}')"
  if [[ "$STATUS" == 20? ]]; then
    ok
    PARTY_ID="$(jq -r '.id // .party.id' "$BODY_FILE")"
    request GET "/api/parties/$PARTY_ID" ""
    expect_status "Baca mitra uji" 200
    request PUT "/api/parties/$PARTY_ID" '{"phone":"0800-0000-0000"}'
    expect_status "Ubah mitra uji" 200
    request DELETE "/api/parties/$PARTY_ID" ""
    [[ "$STATUS" == 20? ]] && ok || bad "Hapus mitra uji: status $STATUS ($(head -c 160 "$BODY_FILE"))"
  else
    bad "Buat mitra uji: status $STATUS ($(head -c 160 "$BODY_FILE"))"
  fi

  request PUT /api/users/me/language '{"language":"en"}'
  expect_status "Simpan bahasa en" 200
  [ "$(jq -r '.language' "$BODY_FILE")" = "en" ] && ok || bad "Bahasa tidak berubah ke en"
  RESTORE="$( [ -n "$LANGUAGE_BEFORE" ] && jq -nc --arg l "$LANGUAGE_BEFORE" '{language:$l}' || echo '{"language":null}')"
  request PUT /api/users/me/language "$RESTORE"
  expect_status "Kembalikan pilihan bahasa semula" 200
fi

section "Keluar"
request POST /api/auth/logout ""
expect_status "Logout" 200

echo
echo "Hasil: $PASS lolos, $FAIL gagal, $WARN peringatan."
if [ "$WARN" -gt 0 ]; then
  echo "Peringatan (status 4xx, periksa apakah memang wajar):"
  printf '  - %s\n' "${WARNINGS[@]}"
fi
if [ "$FAIL" -gt 0 ]; then
  echo "Gagal:"
  printf '  - %s\n' "${FAILURES[@]}"
  exit 1
fi
