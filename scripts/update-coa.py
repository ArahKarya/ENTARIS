#!/usr/bin/env python3
"""Replace COA from Google Sheets CSV export."""
import csv
import io
import json
import os
import urllib.request

API = "http://localhost:3002/api"

# Type mapping from spreadsheet to Prisma enum
TYPE_MAP = {
    "BANK": ("ASSET", "ASSET"),
    "AREC": ("ASSET", "ASSET"),
    "OCAS": ("ASSET", "ASSET"),
    "INTR": ("ASSET", "ASSET"),
    "FASS": ("ASSET", "ASSET"),
    "DEPR": ("ASSET", "ASSET"),
    "APAY": ("LIABILITY", "LIABILITY"),
    "OCLY": ("LIABILITY", "LIABILITY"),
    "LTLY": ("LIABILITY", "LIABILITY"),
    "EQTY": ("EQUITY", "EQUITY"),
    "REVE": ("REVENUE", "REVENUE"),
    "COGS": ("EXPENSE", "EXPENSE"),
    "EXPS": ("EXPENSE", "EXPENSE"),
    "OINC": ("REVENUE", "REVENUE"),
    "OEXP": ("EXPENSE", "EXPENSE"),
}


def api(method, path, data=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        f"{API}{path}",
        data=body,
        method=method,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.request.HTTPError as e:
        err = e.read().decode()
        print(f"  ERROR {e.code}: {err}")
        return None


def login():
    user = os.environ.get("COA_ADMIN_USER", "admin@entaris.demo")
    pw = os.environ.get("COA_ADMIN_PASSWORD")
    if not pw:
        raise SystemExit("COA_ADMIN_PASSWORD environment variable wajib diisi (jangan hardcode password)")
    body = json.dumps({"username": user, "password": pw}).encode()
    req = urllib.request.Request(
        f"{API}/auth/login",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())["token"]


def flatten(accounts):
    result = []
    for acc in accounts:
        result.append(acc)
        if acc.get("children"):
            result.extend(flatten(acc["children"]))
    return result


def delete_all_accounts():
    tree = api("GET", "/coa") or []
    flat = flatten(tree)
    # Sort: delete leaves first (deepest accountNumber first)
    flat.sort(key=lambda a: a["accountNumber"].count("."), reverse=True)
    flat.sort(key=lambda a: len(a["accountNumber"]), reverse=True)

    print(f"Deleting {len(flat)} existing accounts...")
    for acc in flat:
        # Reset balance to 0 first if non-zero
        if float(acc.get("balance", 0)) != 0:
            api("PATCH", f"/coa/{acc['id']}/balance", {"balance": 0})
        result = api("DELETE", f"/coa/{acc['id']}")
        if result is not None:
            print(f"  Deleted: {acc['accountNumber']} {acc['name']}")
        else:
            print(f"  SKIP: {acc['accountNumber']} {acc['name']}")


def load_csv():
    url = "https://docs.google.com/spreadsheets/d/1HVczqsmrZAckHRUKHjX9vlv_1Md8H2zz/export?format=csv&gid=1860965617"
    with urllib.request.urlopen(url) as resp:
        text = resp.read().decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    last_type = ""
    for row in reader:
        code = (row.get("Kode Perkiraan") or "").strip()
        name = (row.get("Nama") or "").strip()
        type_code = (row.get("Tipe Akun") or "").strip()
        parent = (row.get("Akun Induk") or "").strip()
        if not code or not name:
            continue
        if type_code:
            last_type = type_code
        else:
            type_code = last_type
        rows.append({"code": code, "name": name, "type": type_code, "parent": parent})
    return rows


def create_accounts(rows):
    # Build parent code -> id mapping
    code_to_id = {}
    # Determine which codes are parents
    parent_codes = {r["parent"] for r in rows if r["parent"]}

    print(f"\nCreating {len(rows)} accounts...")
    for row in rows:
        account_type, root_type = TYPE_MAP.get(row["type"], ("ASSET", "ASSET"))
        is_group = row["code"] in parent_codes
        parent_id = code_to_id.get(row["parent"]) if row["parent"] else None

        data = {
            "accountNumber": row["code"],
            "name": row["name"],
            "accountType": account_type,
            "rootType": root_type,
            "isGroup": is_group,
            "parentId": parent_id,
        }
        result = api("POST", "/coa", data)
        if result and "id" in result:
            code_to_id[row["code"]] = result["id"]
            marker = "[G]" if is_group else "   "
            print(f"  {marker} {row['code']} {row['name']}")
        else:
            print(f"  FAIL: {row['code']} {row['name']}")


if __name__ == "__main__":
    print("=== Update COA from Google Sheets ===\n")
    TOKEN = login()
    print("Logged in.\n")

    delete_all_accounts()
    rows = load_csv()
    create_accounts(rows)

    print("\nDone!")
