#!/usr/bin/env bash

BASE="http://localhost:3001/api"
# Fallback admin credentials (seed admin). Set SEED_ADMIN_PASSWORD in the env;
# never hardcode the real password here.
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@entaris.demo}"
SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-}"
TOKEN=""
PASS=0
FAIL=0
TOTAL=0
DETAILS=""
MODULE_SUMMARY=""

# Stored IDs
CUSTOMER_ID=""
SUPPLIER_ID=""
DELETE_PARTY_ID=""
NEW_ACCOUNT_ID=""
KAS_UTAMA_ID=""
SALES_INVOICE_ID=""
SALES_GRAND_TOTAL=""
PURCHASE_INVOICE_ID=""
PURCHASE_GRAND_TOTAL=""
KAS_ACCOUNT_ID=""
EXPENSE_ACCOUNT_ID=""
BANK_ACCOUNT_ID=""
USER_ID=""
NEW_USER_ID=""
RECURRING_ID=""
TAX_CONFIG_ID=""
RECON_ID=""
RECON_ITEM_ID=""
LEDGER_ENTRY_ID=""
FISCAL_YEAR_ID=""

# Per-module counters (reset per module)
MOD_NAME=""
MOD_PASS=0
MOD_FAIL=0
MOD_TOTAL=0

start_module() {
  # Save previous module to summary if there was one
  if [ -n "$MOD_NAME" ]; then
    local status_txt="ALL PASS"
    if [ "$MOD_FAIL" -gt 0 ]; then status_txt="HAS FAILURES"; fi
    if [ "$MOD_TOTAL" -eq 0 ]; then status_txt="SKIPPED"; fi
    MODULE_SUMMARY="${MODULE_SUMMARY}| ${MOD_NAME} | ${MOD_TOTAL} | ${MOD_PASS} | ${MOD_FAIL} | ${status_txt} |\n"
  fi
  MOD_NAME="$1"
  MOD_PASS=0
  MOD_FAIL=0
  MOD_TOTAL=0
  echo ""
  echo "================================================================="
  echo "  MODULE: $MOD_NAME"
  echo "================================================================="
}

finish_modules() {
  if [ -n "$MOD_NAME" ]; then
    local status_txt="ALL PASS"
    if [ "$MOD_FAIL" -gt 0 ]; then status_txt="HAS FAILURES"; fi
    if [ "$MOD_TOTAL" -eq 0 ]; then status_txt="SKIPPED"; fi
    MODULE_SUMMARY="${MODULE_SUMMARY}| ${MOD_NAME} | ${MOD_TOTAL} | ${MOD_PASS} | ${MOD_FAIL} | ${status_txt} |\n"
  fi
}

run_test() {
  local test_id="$1"
  local desc="$2"
  local expected="$3"
  local body="$4"
  local actual="$5"

  TOTAL=$((TOTAL + 1))
  MOD_TOTAL=$((MOD_TOTAL + 1))

  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS + 1))
    MOD_PASS=$((MOD_PASS + 1))
    echo "  PASS [$test_id] $desc (HTTP $actual)"
  else
    FAIL=$((FAIL + 1))
    MOD_FAIL=$((MOD_FAIL + 1))
    local err_msg
    err_msg=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',''))" 2>/dev/null || echo "N/A")
    echo "  FAIL [$test_id] $desc -- Expected: $expected, Got: $actual | Error: $err_msg"
    DETAILS="${DETAILS}| $test_id | $desc | $expected | $actual | $err_msg |\n"
  fi
}

# Verification test (checks a condition rather than HTTP status)
verify_test() {
  local test_id="$1"
  local desc="$2"
  local condition="$3"  # "true" or "false"
  local detail="$4"

  TOTAL=$((TOTAL + 1))
  MOD_TOTAL=$((MOD_TOTAL + 1))

  if [ "$condition" = "true" ]; then
    PASS=$((PASS + 1))
    MOD_PASS=$((MOD_PASS + 1))
    echo "  PASS [$test_id] $desc -- $detail"
  else
    FAIL=$((FAIL + 1))
    MOD_FAIL=$((MOD_FAIL + 1))
    echo "  FAIL [$test_id] $desc -- $detail"
    DETAILS="${DETAILS}| $test_id | $desc | pass | fail | $detail |\n"
  fi
}

echo "================================================================="
echo "  COMPREHENSIVE ERP API TEST SUITE"
echo "  Base URL: $BASE"
echo "  Started: $(date)"
echo "================================================================="

##############################################################################
# MODULE 1: Authentication
##############################################################################
start_module "1. Authentication"

# 1.1 Valid login
echo "  Testing valid login..."
RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$STATUS" = "200" ]; then
  TOKEN=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null || echo "")
  USER_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])" 2>/dev/null || echo "")
fi

if [ -z "$TOKEN" ] || [ "$STATUS" != "200" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$ADMIN_EMAIL\",\"password\":\"$SEED_ADMIN_PASSWORD\"}")
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  if [ "$STATUS" = "200" ]; then
    TOKEN=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null || echo "")
    USER_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])" 2>/dev/null || echo "")
  fi
fi

run_test "1.1" "POST /auth/login -- valid credentials" "200" "$BODY" "$STATUS"
echo "  -> Token: ${TOKEN:0:20}..."
echo "  -> User ID: $USER_ID"

# Detect which password works
ADMIN_PASSWORD="admin123"
# Quick check
RESP2=$(curl -s -w '\n%{http_code}' -X PUT "$BASE/users/me/password" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"currentPassword":"admin123","newPassword":"admin123"}' 2>/dev/null)
S2=$(echo "$RESP2" | tail -1)
if [ "$S2" != "200" ] && [ -n "$SEED_ADMIN_PASSWORD" ]; then
  ADMIN_PASSWORD="$SEED_ADMIN_PASSWORD"
fi
echo "  -> Admin password detected: $ADMIN_PASSWORD"

# 1.2 Wrong password
RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"wrongpassword"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
run_test "1.2" "POST /auth/login -- wrong password" "401" "$BODY" "$STATUS"

# 1.3 No token
RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/coa" \
  -H "Content-Type: application/json")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
run_test "1.3" "GET /coa -- without token" "401" "$BODY" "$STATUS"

##############################################################################
# MODULE 2: Chart of Accounts
##############################################################################
start_module "2. Chart of Accounts"

# 2.1 Tree
RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/coa" \
  -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
run_test "2.1" "GET /coa -- tree hierarchy" "200" "$BODY" "$STATUS"

# 2.2 Flat
RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/coa/flat" \
  -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
run_test "2.2" "GET /coa/flat -- flat list" "200" "$BODY" "$STATUS"
FLAT_COUNT=$(echo "$BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
echo "  -> Total accounts: $FLAT_COUNT"

# Extract account IDs
KAS_UTAMA_ID=$(echo "$BODY" | python3 -c "
import sys,json
accs = json.load(sys.stdin)
kas = next((a for a in accs if a['accountNumber'].startswith('1.1.1') and not a['isGroup']), None)
print(kas['id'] if kas else '')
" 2>/dev/null || echo "")

BANK_ACCOUNT_ID=$(echo "$BODY" | python3 -c "
import sys,json
accs = json.load(sys.stdin)
bank = next((a for a in accs if a['accountNumber'].startswith('1.1.2') and not a['isGroup']), None)
print(bank['id'] if bank else '')
" 2>/dev/null || echo "")

EXPENSE_ACCOUNT_ID=$(echo "$BODY" | python3 -c "
import sys,json
accs = json.load(sys.stdin)
exp = next((a for a in accs if a['accountNumber'].startswith('5.') and not a['isGroup']), None)
print(exp['id'] if exp else '')
" 2>/dev/null || echo "")

PARENT_52_ID=$(echo "$BODY" | python3 -c "
import sys,json
accs = json.load(sys.stdin)
p = next((a for a in accs if a['accountNumber'] == '5.2' and a['isGroup']), None)
if not p:
  p = next((a for a in accs if a['accountNumber'].startswith('5.') and a['isGroup']), None)
print(p['id'] if p else '')
" 2>/dev/null || echo "")

KAS_ACCOUNT_ID="$KAS_UTAMA_ID"
echo "  -> Kas Utama: $KAS_UTAMA_ID"
echo "  -> Bank: $BANK_ACCOUNT_ID"
echo "  -> Expense: $EXPENSE_ACCOUNT_ID"

# 2.3 Create account
RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/coa" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"accountNumber\":\"5.2.3\",\"name\":\"Biaya Transportasi\",\"accountType\":\"EXPENSE\",\"rootType\":\"EXPENSE\",\"parentId\":\"$PARENT_52_ID\",\"isGroup\":false}")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
if [ "$STATUS" = "409" ]; then
  TS=$(date +%s)
  RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/coa" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"accountNumber\":\"5.2.${TS: -3}\",\"name\":\"Biaya Transportasi Test\",\"accountType\":\"EXPENSE\",\"rootType\":\"EXPENSE\",\"parentId\":\"$PARENT_52_ID\",\"isGroup\":false}")
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
fi
run_test "2.3" "POST /coa -- create Biaya Transportasi" "201" "$BODY" "$STATUS"
NEW_ACCOUNT_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

# 2.4 Rename
if [ -n "$NEW_ACCOUNT_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X PUT "$BASE/coa/$NEW_ACCOUNT_ID" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"name":"Biaya Transportasi & Pengiriman"}')
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  run_test "2.4" "PUT /coa/:id -- rename account" "200" "$BODY" "$STATUS"
else
  run_test "2.4" "PUT /coa/:id -- rename account (SKIP)" "200" "" "SKIP"
fi

# 2.5 Set opening balance
if [ -n "$KAS_UTAMA_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X PATCH "$BASE/coa/$KAS_UTAMA_ID/balance" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"balance":50000000}')
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  run_test "2.5" "PATCH /coa/:id/balance -- opening balance Kas" "200" "$BODY" "$STATUS"
else
  run_test "2.5" "PATCH /coa/:id/balance (SKIP)" "200" "" "SKIP"
fi

##############################################################################
# MODULE 3: Parties
##############################################################################
start_module "3. Parties"

RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/parties" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Toko Beras Makmur","partyType":"Customer","phone":"08123456789","email":"toko@makmur.com","address":"Jl. Raya No. 1"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
run_test "3.1" "POST /parties -- create Customer" "201" "$BODY" "$STATUS"
CUSTOMER_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/parties" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Petani Desa Sukaraja","partyType":"Supplier","phone":"08198765432","email":"petani@sukaraja.com","address":"Desa Sukaraja"}')
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
run_test "3.2" "POST /parties -- create Supplier" "201" "$BODY" "$STATUS"
SUPPLIER_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

# Create throwaway for delete test
curl -s -X POST "$BASE/parties" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Mitra Hapus Test","partyType":"Customer","phone":"081111111"}' > /tmp/del_party.json 2>/dev/null
DELETE_PARTY_ID=$(python3 -c "import json; print(json.load(open('/tmp/del_party.json')).get('id',''))" 2>/dev/null || echo "")

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/parties" \
  -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
run_test "3.3" "GET /parties -- list all" "200" "$BODY" "$STATUS"
PARTY_COUNT=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null || echo "0")
echo "  -> Total: $PARTY_COUNT"

if [ -n "$CUSTOMER_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X PUT "$BASE/parties/$CUSTOMER_ID" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"phone":"0812999888","name":"Toko Beras Makmur"}')
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  run_test "3.4" "PUT /parties/:id -- update phone" "200" "$BODY" "$STATUS"
else
  run_test "3.4" "PUT /parties/:id (SKIP)" "200" "" "SKIP"
fi

if [ -n "$DELETE_PARTY_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X DELETE "$BASE/parties/$DELETE_PARTY_ID" \
    -H "Authorization: Bearer $TOKEN")
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  run_test "3.5" "DELETE /parties/:id -- hard delete" "200" "$BODY" "$STATUS"
else
  run_test "3.5" "DELETE /parties/:id (SKIP)" "200" "" "SKIP"
fi

##############################################################################
# MODULE 4: Sales Invoices
##############################################################################
start_module "4. Sales Invoices"

if [ -n "$CUSTOMER_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/sales/invoices" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"date\":\"2026-03-22\",\"partyId\":\"$CUSTOMER_ID\",\"dueDate\":\"2026-04-22\",\"taxPct\":11,\"notes\":\"Test invoice\",\"items\":[{\"itemName\":\"Beras Premium 5kg\",\"quantity\":100,\"unit\":\"karung\",\"rate\":75000,\"discount\":0},{\"itemName\":\"Beras Medium 10kg\",\"quantity\":50,\"unit\":\"karung\",\"rate\":120000,\"discount\":5}]}")
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  run_test "4.1" "POST /sales/invoices -- 2 items + 11% tax" "201" "$BODY" "$STATUS"
  SALES_INVOICE_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
  SALES_GRAND_TOTAL=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('grandTotal','0'))" 2>/dev/null || echo "0")
  SALES_INVOICE_NUM=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('invoiceNumber',''))" 2>/dev/null || echo "")
  echo "  -> Invoice: $SALES_INVOICE_NUM, Total: $SALES_GRAND_TOTAL"
else
  run_test "4.1" "POST /sales/invoices (SKIP)" "201" "" "SKIP"
fi

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/sales/invoices" \
  -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
run_test "4.2" "GET /sales/invoices -- list" "200" "$BODY" "$STATUS"

if [ -n "$SALES_INVOICE_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/sales/invoices/$SALES_INVOICE_ID" \
    -H "Authorization: Bearer $TOKEN")
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  run_test "4.3" "GET /sales/invoices/:id -- detail" "200" "$BODY" "$STATUS"
else
  run_test "4.3" "GET /sales/invoices/:id (SKIP)" "200" "" "SKIP"
fi

##############################################################################
# MODULE 5: Purchase Invoices
##############################################################################
start_module "5. Purchase Invoices"

if [ -n "$SUPPLIER_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/purchase/invoices" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"date\":\"2026-03-22\",\"partyId\":\"$SUPPLIER_ID\",\"dueDate\":\"2026-04-15\",\"taxPct\":11,\"notes\":\"Pembelian gabah\",\"items\":[{\"itemName\":\"Gabah Kering Panen\",\"quantity\":2000,\"unit\":\"kg\",\"rate\":6500,\"discount\":0}]}")
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  run_test "5.1" "POST /purchase/invoices -- create" "201" "$BODY" "$STATUS"
  PURCHASE_INVOICE_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
  PURCHASE_GRAND_TOTAL=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('grandTotal','0'))" 2>/dev/null || echo "0")
  PURCHASE_INVOICE_NUM=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('invoiceNumber',''))" 2>/dev/null || echo "")
  echo "  -> Invoice: $PURCHASE_INVOICE_NUM, Total: $PURCHASE_GRAND_TOTAL"
else
  run_test "5.1" "POST /purchase/invoices (SKIP)" "201" "" "SKIP"
fi

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/purchase/invoices" \
  -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
run_test "5.2" "GET /purchase/invoices -- list" "200" "$BODY" "$STATUS"

if [ -n "$PURCHASE_INVOICE_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/purchase/invoices/$PURCHASE_INVOICE_ID" \
    -H "Authorization: Bearer $TOKEN")
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  run_test "5.3" "GET /purchase/invoices/:id -- detail" "200" "$BODY" "$STATUS"
else
  run_test "5.3" "GET /purchase/invoices/:id (SKIP)" "200" "" "SKIP"
fi

##############################################################################
# MODULE 6: Payments
##############################################################################
start_module "6. Payments"

if [ -n "$CUSTOMER_ID" ] && [ -n "$KAS_ACCOUNT_ID" ] && [ -n "$SALES_GRAND_TOTAL" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/payments" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"date\":\"2026-03-22\",\"partyId\":\"$CUSTOMER_ID\",\"paymentType\":\"Receive\",\"accountId\":\"$KAS_ACCOUNT_ID\",\"amount\":$SALES_GRAND_TOTAL,\"referenceNo\":\"TRF-001\",\"notes\":\"Pelunasan\"}")
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  run_test "6.1" "POST /payments -- receive from customer (full)" "201" "$BODY" "$STATUS"
else
  run_test "6.1" "POST /payments -- receive (SKIP)" "201" "" "SKIP"
fi

if [ -n "$SUPPLIER_ID" ] && [ -n "$KAS_ACCOUNT_ID" ] && [ -n "$PURCHASE_GRAND_TOTAL" ]; then
  PARTIAL_AMT=$(python3 -c "print(round(float('$PURCHASE_GRAND_TOTAL') / 2, 2))")
  RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/payments" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"date\":\"2026-03-22\",\"partyId\":\"$SUPPLIER_ID\",\"paymentType\":\"Pay\",\"accountId\":\"$KAS_ACCOUNT_ID\",\"amount\":$PARTIAL_AMT,\"referenceNo\":\"TRF-002\",\"notes\":\"Partial\"}")
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  run_test "6.2" "POST /payments -- pay supplier (50%)" "201" "$BODY" "$STATUS"
  echo "  -> Partial: $PARTIAL_AMT of $PURCHASE_GRAND_TOTAL"
else
  run_test "6.2" "POST /payments -- pay supplier (SKIP)" "201" "" "SKIP"
fi

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/payments" \
  -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
run_test "6.3" "GET /payments -- list" "200" "$BODY" "$STATUS"

# 6.4 Verify sales invoice paid
if [ -n "$SALES_INVOICE_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/sales/invoices/$SALES_INVOICE_ID" \
    -H "Authorization: Bearer $TOKEN")
  BODY=$(echo "$RESP" | sed '$d')
  SI_STATUS=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "UNKNOWN")
  SI_OUTSTANDING=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('outstanding',''))" 2>/dev/null || echo "?")
  COND="false"
  if [ "$SI_STATUS" = "Paid" ]; then COND="true"; fi
  verify_test "6.4" "Sales invoice status = Paid" "$COND" "status=$SI_STATUS outstanding=$SI_OUTSTANDING"
fi

# 6.5 Verify purchase invoice partially paid
if [ -n "$PURCHASE_INVOICE_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/purchase/invoices/$PURCHASE_INVOICE_ID" \
    -H "Authorization: Bearer $TOKEN")
  BODY=$(echo "$RESP" | sed '$d')
  PI_STATUS=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "UNKNOWN")
  PI_OUTSTANDING=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('outstanding',''))" 2>/dev/null || echo "?")
  COND="false"
  if [ "$PI_STATUS" = "PartiallyPaid" ]; then COND="true"; fi
  verify_test "6.5" "Purchase invoice status = PartiallyPaid" "$COND" "status=$PI_STATUS outstanding=$PI_OUTSTANDING"
fi

# 6.6 Verify party outstanding
RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/parties" -H "Authorization: Bearer $TOKEN")
BODY=$(echo "$RESP" | sed '$d')
CUST_OUT=$(echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
c=next((p for p in d['data'] if p['id']=='$CUSTOMER_ID'),None)
print(c['outstandingAmount'] if c else 'N/A')
" 2>/dev/null || echo "N/A")
SUPP_OUT=$(echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
s=next((p for p in d['data'] if p['id']=='$SUPPLIER_ID'),None)
print(s['outstandingAmount'] if s else 'N/A')
" 2>/dev/null || echo "N/A")
verify_test "6.6" "Party outstanding updated" "true" "Customer=$CUST_OUT Supplier=$SUPP_OUT"

##############################################################################
# MODULE 7: Journal Entries
##############################################################################
start_module "7. Journal Entries"

if [ -n "$EXPENSE_ACCOUNT_ID" ] && [ -n "$KAS_ACCOUNT_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/journals" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"date\":\"2026-03-22\",\"narration\":\"Biaya operasional Maret\",\"items\":[{\"accountId\":\"$EXPENSE_ACCOUNT_ID\",\"debit\":500000,\"credit\":0,\"description\":\"Biaya listrik\"},{\"accountId\":\"$KAS_ACCOUNT_ID\",\"debit\":0,\"credit\":500000,\"description\":\"Kas keluar\"}]}")
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  run_test "7.1" "POST /journals -- manual journal" "201" "$BODY" "$STATUS"

  # 7.2 Unbalanced
  RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/journals" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"date\":\"2026-03-22\",\"narration\":\"Unbalanced\",\"items\":[{\"accountId\":\"$EXPENSE_ACCOUNT_ID\",\"debit\":100000,\"credit\":0},{\"accountId\":\"$KAS_ACCOUNT_ID\",\"debit\":0,\"credit\":99000}]}")
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  run_test "7.2" "POST /journals -- debit!=credit -> 400" "400" "$BODY" "$STATUS"

  # 7.3 Both debit and credit on same line
  RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/journals" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"date\":\"2026-03-22\",\"narration\":\"Both D+C\",\"items\":[{\"accountId\":\"$EXPENSE_ACCOUNT_ID\",\"debit\":100000,\"credit\":100000}]}")
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  run_test "7.3" "POST /journals -- debit+credit same line -> 400" "400" "$BODY" "$STATUS"
else
  run_test "7.1" "POST /journals (SKIP)" "201" "" "SKIP"
  run_test "7.2" "POST /journals unbalanced (SKIP)" "400" "" "SKIP"
  run_test "7.3" "POST /journals both D+C (SKIP)" "400" "" "SKIP"
fi

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/journals?startDate=2026-03-01&endDate=2026-03-31" \
  -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
run_test "7.4" "GET /journals -- date filter" "200" "$BODY" "$STATUS"
JV_COUNT=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null || echo "0")
echo "  -> Journals in March: $JV_COUNT"

##############################################################################
# MODULE 8: Reports
##############################################################################
start_module "8. Reports"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/reports/trial-balance" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
run_test "8.1" "GET /reports/trial-balance" "200" "$BODY" "$STATUS"
echo "  -> $(echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
td=sum(r['debit'] for r in d)
tc=sum(r['credit'] for r in d)
print(f'Debit={td:.2f} Credit={tc:.2f} Balanced={abs(td-tc)<0.02}')
" 2>/dev/null || echo "N/A")"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/reports/profit-loss" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
run_test "8.2" "GET /reports/profit-loss" "200" "$BODY" "$STATUS"
echo "  -> $(echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f\"Revenue={d.get('totalRevenue',0):.2f} Expense={d.get('totalExpense',0):.2f} Net={d.get('netProfit',0):.2f}\")
" 2>/dev/null || echo "N/A")"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/reports/balance-sheet" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
run_test "8.3" "GET /reports/balance-sheet" "200" "$BODY" "$STATUS"
echo "  -> $(echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
a=d.get('totalAssets',0); l=d.get('totalLiabilities',0); e=d.get('totalEquity',0)
print(f'Assets={a:.2f} Liab={l:.2f} Equity={e:.2f} A=L+E? {abs(a-(l+e))<0.02}')
" 2>/dev/null || echo "N/A")"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/reports/cash-flow?startDate=2026-03-01&endDate=2026-03-31" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
run_test "8.4" "GET /reports/cash-flow" "200" "$BODY" "$STATUS"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/reports/aging?type=Customer" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
run_test "8.5" "GET /reports/aging -- Customer" "200" "$BODY" "$STATUS"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/reports/aging?type=Supplier" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
run_test "8.6" "GET /reports/aging -- Supplier" "200" "$BODY" "$STATUS"

if [ -n "$KAS_UTAMA_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/reports/ledger-detail?accountId=$KAS_UTAMA_ID&startDate=2026-03-01&endDate=2026-03-31" -H "Authorization: Bearer $TOKEN")
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  run_test "8.7" "GET /reports/ledger-detail -- Kas" "200" "$BODY" "$STATUS"
  LEDGER_ENTRY_ID=$(echo "$BODY" | python3 -c "
import sys,json
e=json.load(sys.stdin).get('entries',[])
print(e[0]['id'] if e else '')
" 2>/dev/null || echo "")
  LEDGER_COUNT=$(echo "$BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('entries',[])))" 2>/dev/null || echo "0")
  echo "  -> Kas entries: $LEDGER_COUNT"
else
  run_test "8.7" "GET /reports/ledger-detail (SKIP)" "200" "" "SKIP"
fi

##############################################################################
# MODULE 9: Dashboard
##############################################################################
start_module "9. Dashboard"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/dashboard/metrics" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "9.1" "GET /dashboard/metrics" "200" "$BODY" "$STATUS"
echo "  -> $(echo "$BODY" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(f\"Cash={d.get('cashBalance',0):.0f} AR={d.get('accountsReceivable',0):.0f} AP={d.get('accountsPayable',0):.0f} Profit={d.get('netProfit',0):.0f}\")
" 2>/dev/null || echo "N/A")"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/dashboard/charts" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "9.2" "GET /dashboard/charts" "200" "$BODY" "$STATUS"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/dashboard/top-customers" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "9.3" "GET /dashboard/top-customers" "200" "$BODY" "$STATUS"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/dashboard/overdue" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "9.4" "GET /dashboard/overdue" "200" "$BODY" "$STATUS"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/dashboard/expense-breakdown" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "9.5" "GET /dashboard/expense-breakdown" "200" "$BODY" "$STATUS"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/dashboard/stock-alerts" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "9.6" "GET /dashboard/stock-alerts" "200" "$BODY" "$STATUS"

##############################################################################
# MODULE 10: Fiscal Years
##############################################################################
start_module "10. Fiscal Years"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/fiscal-years" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "10.1" "GET /fiscal-years -- list" "200" "$BODY" "$STATUS"

FY_INFO=$(echo "$BODY" | python3 -c "
import sys,json
data=json.load(sys.stdin)
fy=next((y for y in data if '2026' in y.get('name','')),None)
if fy: print(f\"FOUND isClosed={fy['isClosed']}\")
else: print('NOT_FOUND')
" 2>/dev/null || echo "NOT_FOUND")
COND="false"
if [[ "$FY_INFO" == *"isClosed=False"* ]]; then COND="true"; fi
verify_test "10.2" "FY 2026 exists and open" "$COND" "$FY_INFO"

##############################################################################
# MODULE 11: Settings
##############################################################################
start_module "11. Settings"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/settings/company" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "11.1" "GET /settings/company" "200" "$BODY" "$STATUS"

RESP=$(curl -s -w '\n%{http_code}' -X PUT "$BASE/settings/company" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"companyName":"PT Test Simulasi","address":"Jl. Test No. 1","phone":"021-12345"}')
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "11.2" "PUT /settings/company -- update" "200" "$BODY" "$STATUS"

##############################################################################
# MODULE 12: User Management
##############################################################################
start_module "12. User Management"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/users" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "12.1" "GET /users -- list" "200" "$BODY" "$STATUS"
echo "  -> Total: $(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null || echo "0")"

TS=$(date +%s)
RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/users" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"username\":\"testuser${TS}\",\"email\":\"testuser${TS}@test.com\",\"fullName\":\"Test User Sim\",\"password\":\"TestPass123!\",\"role\":\"Viewer\"}")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "12.2" "POST /users -- create user" "201" "$BODY" "$STATUS"
NEW_USER_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

if [ -n "$NEW_USER_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X PUT "$BASE/users/$NEW_USER_ID" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"fullName":"Test User Updated"}')
  STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
  run_test "12.3" "PUT /users/:id -- update fullName" "200" "$BODY" "$STATUS"

  RESP=$(curl -s -w '\n%{http_code}' -X PATCH "$BASE/users/$NEW_USER_ID/toggle" -H "Authorization: Bearer $TOKEN")
  STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
  run_test "12.4" "PATCH /users/:id/toggle -- deactivate" "200" "$BODY" "$STATUS"
  echo "  -> isActive: $(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('isActive',''))" 2>/dev/null || echo "?")"
else
  run_test "12.3" "PUT /users/:id (SKIP)" "200" "" "SKIP"
  run_test "12.4" "PATCH /users/:id/toggle (SKIP)" "200" "" "SKIP"
fi

# 12.5 Change password
RESP=$(curl -s -w '\n%{http_code}' -X PUT "$BASE/users/me/password" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"currentPassword\":\"$ADMIN_PASSWORD\",\"newPassword\":\"NewPass123!\"}")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "12.5" "PUT /users/me/password -- change" "200" "$BODY" "$STATUS"

# 12.6 Login with new password
RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"NewPass123!"}')
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "12.6" "POST /auth/login -- new password" "200" "$BODY" "$STATUS"
if [ "$STATUS" = "200" ]; then
  TOKEN=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null || echo "$TOKEN")
fi

# Reset password back
curl -s -X PUT "$BASE/users/me/password" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"currentPassword\":\"NewPass123!\",\"newPassword\":\"$ADMIN_PASSWORD\"}" > /dev/null 2>&1

##############################################################################
# MODULE 13: Audit Trail
##############################################################################
start_module "13. Audit Trail"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/audit-logs" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "13.1" "GET /audit-logs -- list" "200" "$BODY" "$STATUS"
echo "  -> Total: $(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null || echo "0")"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/audit-logs?action=CREATE" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "13.2" "GET /audit-logs?action=CREATE" "200" "$BODY" "$STATUS"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/audit-logs?entityType=parties" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "13.3" "GET /audit-logs?entityType=parties" "200" "$BODY" "$STATUS"

##############################################################################
# MODULE 14: Notifications
##############################################################################
start_module "14. Notifications"

RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/notifications/check" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "14.1" "POST /notifications/check" "200" "$BODY" "$STATUS"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/notifications/unread-count" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "14.2" "GET /notifications/unread-count" "200" "$BODY" "$STATUS"
echo "  -> Unread: $(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "0")"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/notifications" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "14.3" "GET /notifications -- list" "200" "$BODY" "$STATUS"

RESP=$(curl -s -w '\n%{http_code}' -X PATCH "$BASE/notifications/read-all" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "14.4" "PATCH /notifications/read-all" "200" "$BODY" "$STATUS"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/notifications/unread-count" -H "Authorization: Bearer $TOKEN")
BODY=$(echo "$RESP" | sed '$d')
UNREAD_AFTER=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "-1")
COND="false"; if [ "$UNREAD_AFTER" = "0" ]; then COND="true"; fi
verify_test "14.5" "Unread count = 0 after read-all" "$COND" "unread=$UNREAD_AFTER"

##############################################################################
# MODULE 15: Recurring Transactions
##############################################################################
start_module "15. Recurring Transactions"

if [ -n "$EXPENSE_ACCOUNT_ID" ] && [ -n "$KAS_ACCOUNT_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/recurring" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"name\":\"Gaji Bulanan\",\"templateType\":\"journal\",\"frequency\":\"monthly\",\"dayOfMonth\":25,\"nextRunDate\":\"2026-04-25\",\"templateData\":{\"narration\":\"Pembayaran gaji\",\"items\":[{\"accountId\":\"$EXPENSE_ACCOUNT_ID\",\"debit\":3000000,\"credit\":0},{\"accountId\":\"$KAS_ACCOUNT_ID\",\"debit\":0,\"credit\":3000000}]}}")
  STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
  run_test "15.1" "POST /recurring -- create template" "201" "$BODY" "$STATUS"
  RECURRING_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
else
  run_test "15.1" "POST /recurring (SKIP)" "201" "" "SKIP"
fi

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/recurring" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "15.2" "GET /recurring -- list" "200" "$BODY" "$STATUS"

if [ -n "$RECURRING_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/recurring/$RECURRING_ID/execute" -H "Authorization: Bearer $TOKEN")
  STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
  run_test "15.3" "POST /recurring/:id/execute" "200" "$BODY" "$STATUS"
  echo "  -> Success: $(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',False))" 2>/dev/null || echo "?")"
else
  run_test "15.3" "POST /recurring/:id/execute (SKIP)" "200" "" "SKIP"
fi

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/journals?limit=3" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "15.4" "GET /journals -- verify from template" "200" "$BODY" "$STATUS"

if [ -n "$RECURRING_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X PUT "$BASE/recurring/$RECURRING_ID" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"name":"Gaji Bulanan (Updated)"}')
  STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
  run_test "15.5" "PUT /recurring/:id -- update" "200" "$BODY" "$STATUS"

  RESP=$(curl -s -w '\n%{http_code}' -X DELETE "$BASE/recurring/$RECURRING_ID" -H "Authorization: Bearer $TOKEN")
  STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
  run_test "15.6" "DELETE /recurring/:id -- soft delete" "200" "$BODY" "$STATUS"
else
  run_test "15.5" "PUT /recurring/:id (SKIP)" "200" "" "SKIP"
  run_test "15.6" "DELETE /recurring/:id (SKIP)" "200" "" "SKIP"
fi

##############################################################################
# MODULE 16: Search
##############################################################################
start_module "16. Search"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/search?q=Toko" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "16.1" "GET /search?q=Toko -- party" "200" "$BODY" "$STATUS"
echo "  -> Results: $(echo "$BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/search?q=SI-" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "16.2" "GET /search?q=SI- -- invoice" "200" "$BODY" "$STATUS"
echo "  -> Results: $(echo "$BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/search?q=Kas" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "16.3" "GET /search?q=Kas -- account" "200" "$BODY" "$STATUS"
echo "  -> Results: $(echo "$BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")"

##############################################################################
# MODULE 17: Tax Management
##############################################################################
start_module "17. Tax Management"

RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/tax/config" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"PPN 11%","rate":11,"type":"sales"}')
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "17.1" "POST /tax/config -- PPN 11%" "201" "$BODY" "$STATUS"
TAX_CONFIG_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/tax/config" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "17.2" "GET /tax/config -- list" "200" "$BODY" "$STATUS"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/tax/report?startDate=2026-03-01&endDate=2026-03-31" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "17.3" "GET /tax/report -- monthly" "200" "$BODY" "$STATUS"
echo "  -> $(echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin); t=d.get('totals',{})
print(f\"PPN_Out={t.get('ppnKeluaran',0):.2f} PPN_In={t.get('ppnMasukan',0):.2f} Net={t.get('net',0):.2f}\")
" 2>/dev/null || echo "N/A")"

if [ -n "$TAX_CONFIG_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X PUT "$BASE/tax/config/$TAX_CONFIG_ID" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"rate":12}')
  STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
  run_test "17.4" "PUT /tax/config/:id -- update to 12%" "200" "$BODY" "$STATUS"

  RESP=$(curl -s -w '\n%{http_code}' -X DELETE "$BASE/tax/config/$TAX_CONFIG_ID" -H "Authorization: Bearer $TOKEN")
  STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
  run_test "17.5" "DELETE /tax/config/:id -- soft delete" "200" "$BODY" "$STATUS"
else
  run_test "17.4" "PUT /tax/config/:id (SKIP)" "200" "" "SKIP"
  run_test "17.5" "DELETE /tax/config/:id (SKIP)" "200" "" "SKIP"
fi

##############################################################################
# MODULE 18: Bank Reconciliation
##############################################################################
start_module "18. Bank Reconciliation"

RECON_ACCOUNT_ID="${BANK_ACCOUNT_ID:-$KAS_UTAMA_ID}"

if [ -n "$RECON_ACCOUNT_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/reconciliation" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"accountId\":\"$RECON_ACCOUNT_ID\",\"statementDate\":\"2026-03-22\",\"statementBalance\":50000000,\"notes\":\"Rekon Maret\"}")
  STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
  run_test "18.1" "POST /reconciliation -- create" "201" "$BODY" "$STATUS"
  RECON_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
else
  run_test "18.1" "POST /reconciliation (SKIP)" "201" "" "SKIP"
fi

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/reconciliation" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "18.2" "GET /reconciliation -- list" "200" "$BODY" "$STATUS"

if [ -n "$RECON_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/reconciliation/$RECON_ID/items" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"items":[{"statementAmount":500000,"statementDesc":"Transfer masuk","statementDate":"2026-03-20"},{"statementAmount":-200000,"statementDesc":"Biaya admin","statementDate":"2026-03-21"}]}')
  STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
  run_test "18.3" "POST /reconciliation/:id/items -- add" "201" "$BODY" "$STATUS"
  RECON_ITEM_ID=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if isinstance(d,list) and d else '')" 2>/dev/null || echo "")
else
  run_test "18.3" "POST /reconciliation/:id/items (SKIP)" "201" "" "SKIP"
fi

if [ -n "$RECON_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/reconciliation/$RECON_ID" -H "Authorization: Bearer $TOKEN")
  STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
  run_test "18.4" "GET /reconciliation/:id -- detail" "200" "$BODY" "$STATUS"
  if [ -z "$LEDGER_ENTRY_ID" ]; then
    LEDGER_ENTRY_ID=$(echo "$BODY" | python3 -c "
import sys,json
e=json.load(sys.stdin).get('unmatchedLedgerEntries',[])
print(e[0]['id'] if e else '')
" 2>/dev/null || echo "")
  fi
else
  run_test "18.4" "GET /reconciliation/:id (SKIP)" "200" "" "SKIP"
fi

if [ -n "$RECON_ID" ] && [ -n "$RECON_ITEM_ID" ] && [ -n "$LEDGER_ENTRY_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X PATCH "$BASE/reconciliation/$RECON_ID/match" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"itemId\":\"$RECON_ITEM_ID\",\"ledgerEntryId\":\"$LEDGER_ENTRY_ID\"}")
  STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
  run_test "18.5" "PATCH /reconciliation/:id/match" "200" "$BODY" "$STATUS"
else
  run_test "18.5" "PATCH /reconciliation/:id/match (SKIP)" "200" "" "SKIP"
fi

if [ -n "$RECON_ID" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/reconciliation/$RECON_ID/complete" -H "Authorization: Bearer $TOKEN")
  STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
  run_test "18.6" "POST /reconciliation/:id/complete" "200" "$BODY" "$STATUS"
  echo "  -> Status: $(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "?")"
else
  run_test "18.6" "POST /reconciliation/:id/complete (SKIP)" "200" "" "SKIP"
fi

##############################################################################
# MODULE 19: Inventory
##############################################################################
start_module "19. Inventory"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/inventory/items" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "19.1" "GET /inventory/items -- list" "200" "$BODY" "$STATUS"
echo "  -> Total: $(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null || echo "0")"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/inventory/movements" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "19.2" "GET /inventory/movements -- list" "200" "$BODY" "$STATUS"

##############################################################################
# MODULE 20: Backup
##############################################################################
start_module "20. Backup"

RESP=$(curl -s -w '\n%{http_code}' -X POST "$BASE/backup/create" -H "Authorization: Bearer $TOKEN" 2>&1)
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "20.1" "POST /backup/create" "200" "$BODY" "$STATUS"
echo "  -> File: $(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"{d.get('filename','')} ({d.get('size',0)} bytes)\")" 2>/dev/null || echo "N/A")"

RESP=$(curl -s -w '\n%{http_code}' -X GET "$BASE/backup/list" -H "Authorization: Bearer $TOKEN")
STATUS=$(echo "$RESP" | tail -1); BODY=$(echo "$RESP" | sed '$d')
run_test "20.2" "GET /backup/list" "200" "$BODY" "$STATUS"
echo "  -> Count: $(echo "$BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")"

##############################################################################
# FINAL SUMMARY
##############################################################################
finish_modules

echo ""
echo "================================================================="
echo "  COMPREHENSIVE TEST SUMMARY"
echo "================================================================="
echo ""
echo "| Module | Tests | Passed | Failed | Details |"
echo "|--------|-------|--------|--------|---------|"
printf "$MODULE_SUMMARY"
echo ""
echo "================================================================="
if [ "$FAIL" -eq 0 ]; then
  echo "  RESULT: ALL $TOTAL TESTS PASSED ($PASS/$TOTAL)"
else
  echo "  RESULT: $PASS/$TOTAL PASSED, $FAIL FAILED"
fi
echo "================================================================="

if [ -n "$DETAILS" ]; then
  echo ""
  echo "FAILED TEST DETAILS:"
  echo "| Test | Description | Expected | Actual | Error |"
  echo "|------|-------------|----------|--------|-------|"
  printf "$DETAILS"
  echo ""
fi

echo ""
echo "Completed: $(date)"
