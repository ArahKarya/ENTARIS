# Panduan Pemasangan Hermes (profil `aira-dev`) ke Entaris MCP

Untuk owner. Arsitektur & spesifikasi: [ARSITEKTUR-MCP.md](ARSITEKTUR-MCP.md). Alamat Entaris di bawah ditulis `ENTARIS_URL` (mis. `http://100.x.y.z:3001` lewat Tailscale; jangan lewat internet publik).

## 0. Temuan kemampuan klien MCP Hermes (dibaca read-only dari `~/.hermes/hermes-agent` di RPi5)

| Pertanyaan | Jawaban | Bukti (file di repo Hermes) |
|---|---|---|
| `--auth header` + header statis? | **Ya.** `hermes mcp add NAMA --url URL --auth header` meminta *API key / Bearer token*, menyimpannya di `.env` profil (`save_env_value`) dan menulis `headers: {Authorization: "Bearer ${...}"}` ke `config.yaml` | `hermes_cli/mcp_config.py` `_save_bearer_auth_token`, `_bearer_auth_headers` (baris ~326-341, 567-575) |
| Interpolasi env di header? | **Ya.** `${VAR}` dan `${env:VAR}` diinterpolasi saat `mcp_servers` dimuat, per profil | `tools/mcp_tool_config.py` baris 1-3, 306-319 (`_interpolate_env_vars`), 385-402 |
| Header lain (mis. `X-Entaris-Tools`)? | **Ya, manual**: tambahkan di `mcp_servers.<nama>.headers` pada `config.yaml` | `tools/mcp_tool_server_run.py` baris 292 (`headers=dict(config.get("headers") or {})`) |
| Header **dinamis per panggilan**? | **Tidak.** Header dibentuk sekali per koneksi server; pemanggilan tool memakai `session.call_tool(tool_name, arguments=args)` tanpa header per panggilan | `tools/mcp_tool_handlers.py` baris ~394; `tools/mcp_tool_transport.py` |
| Disuntik lewat hook/plugin? | **Header: tidak. Argumen: ya.** Hook plugin `pre_tool_call` dapat mengembalikan `{"action":"modify","args":{...}}` yang di-*merge* ke argumen tool (berlaku untuk semua tool, termasuk MCP) sebelum dikirim | `hermes_cli/plugins.py` `VALID_HOOKS` (baris 108-109), `_get_pre_tool_call_directive_details` (baris ~1945-1990, direktif `modify`) |
| Hook penerimaan pesan? | Ada `pre_gateway_dispatch` (sekali per pesan masuk), `on_session_start`, dst. | `hermes_cli/plugins.py` `VALID_HOOKS` (daftar hook). Bentuk payload `pre_gateway_dispatch` belum saya verifikasi: periksa sebelum memakainya |

**Kesimpulan:** assertion per-pesan **tidak dapat** dikirim sebagai header oleh MCP client bawaan Hermes. Entaris menyediakan jalur setara yang aman: assertion yang sama dibawa di `params.arguments._entaris_actor` / `_entaris_actor_sig` (dibuang server sebelum tool jalan; HMAC + TTL + nonce, model AI tak bisa memalsukannya). Dua pola pemasangan:

- **Pola A (disarankan) — MCP native + plugin kecil**: Hermes memakai MCP client bawaan dengan token statis + header `X-Entaris-Tools: compact`; satu plugin menambah hook `pre_tool_call` yang menyuntik assertion bertanda tangan ke argumen tool `mcp_entaris_*`. Tool yang dilihat model: `cari_tool`, `dokumen_tool`, `whoami`, `panggil_tool` (kecil, hemat konteks).
- **Pola B — plugin tool (seperti `erp_pmd`)**: plugin mendaftarkan `entaris_catalog` / `entaris_call` yang memanggil `/mcp` memakai penanda tangan referensi (bagian 5). Tidak memerlukan MCP client Hermes sama sekali; konteks per panggilan (platform/telefon) sudah tersedia di plugin seperti pada `erp_pmd`.

Endpoint tetap **standar MCP**: klien lain (Claude Desktop, SDK MCP, `mcp-remote`) cukup memakai token + `defaultActorUserId` (aktor default) tanpa assertion.

## 1. Di Entaris (sekali)

1. Aktifkan layanan: *Pengaturan > AIRA (MCP)* -> saklar **Layanan AIRA aktif** menyala.
2. *Manajemen Pengguna*: untuk tiap orang yang boleh memakai AIRA nyalakan **Akses AIRA**, pilih level (**Baca saja / Standar / Langsung**) dan isi **Jabatan AIRA**. Mulailah dengan **Standar**; **Langsung** hanya untuk orang tepercaya (tindakan tulis/kritis jalan tanpa persetujuan terpisah).
3. *Pengaturan > AIRA (MCP) > Token MCP > Buat token*: nama `aira-dev`; **Aktor default** boleh dikosongkan (assertion wajib) atau diisi satu pengguna untuk uji CLI. Salin **token** dan **signing secret** (tampil sekali!) ke pengelola rahasia.
4. Env server (opsional tapi disarankan): `MCP_SECRET_KEY` (>= 32 karakter acak). Lihat bagian Deploy di CHANGELOG.
5. Catat `uid` (id user Entaris) tiap orang: *Jejak Audit*/DB, atau `GET /api/users`. Hermes memetakan identitas channel -> `uid` (Entaris tidak menyimpan nomor WhatsApp/Telegram).

## 2. Di Hermes (RPi5): profil `aira-dev`

```bash
# profil aira-dev sudah ada (~/.hermes/profiles/aira-dev). Pastikan api_server aktif di config.yaml profil:
#   platforms: / gateway: -> api_server: enabled: true   (sesuai dokumentasi Hermes v0.21.x)

hermes -p aira-dev mcp add entaris --url ENTARIS_URL/mcp --auth header
#   prompt "API key / Bearer token": tempel TOKEN MCP (entmcp_...)
#   -> .env profil: variabel token; config.yaml: headers.Authorization = "Bearer ${...}"
```

Tambahkan header mode ringkas dan (opsional) pembatas tool di `~/.hermes/profiles/aira-dev/config.yaml`:

```yaml
mcp_servers:
  entaris:
    url: ENTARIS_URL/mcp
    headers:
      Authorization: "Bearer ${ENTARIS_MCP_TOKEN}"   # sudah ditulis oleh `hermes mcp add` (nama variabel bisa berbeda)
      X-Entaris-Tools: compact                       # tools/list hanya meta-tool; hemat konteks (full list Admin ~445 KB)
```

Simpan signing secret untuk plugin di `.env` profil, mis. `ENTARIS_MCP_SECRET=entsig_...`.

Uji jangkauan dari RPi5: `curl -s ENTARIS_URL/mcp/health` -> `{"status":"ok",...}`.

## 3. Cara token & identitas dipasang (ringkas)

- `Authorization` (statis) = identitas **profil** Hermes.
- Identitas **orang** = actor assertion per pesan (bagian 4/5). Tanpa assertion Entaris memakai aktor default token (hanya untuk CLI/dev) atau menolak (401 `actor_required`).
- Chat grup: Hermes memilih anggota berprivilese terendah sebagai `uid` dan mengirim `gf:true` (level `direct` otomatis turun ke `standard`).

## 4. Pola A: plugin `pre_tool_call` (contoh; belum diuji di Hermes)

`~/.hermes/profiles/aira-dev/plugins/entaris_actor/__init__.py` + `plugin.yaml` (`requires_env: [ENTARIS_MCP_SECRET]`). Plugin: (1) mengingat pengirim pesan terakhir per sesi, (2) menyuntik assertion segar ke argumen tool Entaris.

```python
import os
from entaris_mcp import sign_actor   # salin referensi bagian 5 ke folder plugin

SECRET = os.environ["ENTARIS_MCP_SECRET"]
_SENDER_BY_SESSION = {}   # session_id -> {"uid": <id user Entaris>, "channel": "whatsapp", "gf": False, "ref": "..."}

def resolve_actor(platform: str, sender_id: str, is_group: bool, group_members: list[str]) -> dict | None:
    """Petakan identitas channel -> uid Entaris. Grup: pakai anggota berprivilese TERENDAH dan gf=True."""
    ...  # pemetaan milik Anda (tabel nomor/telegram-id -> uid)

def on_dispatch(**kw):            # hook pre_gateway_dispatch / on_session_start (periksa payload di plugins.py)
    ...  # isi _SENDER_BY_SESSION[kw["session_id"]] = resolve_actor(...)

def inject_actor(tool_name: str, args: dict, session_id: str = "", **_):
    if not tool_name.startswith("mcp_entaris_"):          # cek nama persis tool MCP di daftar tool Hermes
        return None
    actor = _SENDER_BY_SESSION.get(session_id)
    if actor is None:
        return {"action": "block", "message": "Pengirim belum terdaftar di Entaris; minta admin mengaktifkan Akses AIRA."}
    h = sign_actor(SECRET, actor["uid"], actor["channel"], actor["gf"], actor.get("ref"))
    return {"action": "modify", "args": {"_entaris_actor": h["X-Entaris-Actor"], "_entaris_actor_sig": h["X-Entaris-Actor-Sig"]}}

def register(ctx):
    ctx.register_hook("pre_tool_call", inject_actor)
    ctx.register_hook("pre_gateway_dispatch", on_dispatch)
```

Direktif `modify` melakukan *shallow merge* ke argumen asli, jadi tool menerima argumennya sendiri + dua kunci assertion yang dibuang Entaris. Nonce baru tiap panggilan (jangan di-cache).

## 5. Implementasi referensi penanda tangan

Spesifikasi: `X-Entaris-Actor = base64url(JSON{v,uid,ch,gf,ts,nonce,ref?})` (tanpa padding) dan `X-Entaris-Actor-Sig = hex(HMAC-SHA256(signingSecret, string base64url persis))`. TTL 120 detik, nonce sekali pakai.

### Python (3.10+, hanya pustaka standar) — diuji terhadap Entaris dev

```python
import base64, hashlib, hmac, json, time, urllib.request, uuid


def sign_actor(signing_secret: str, uid: str, channel: str, group_floor: bool = False, ref: str | None = None) -> dict:
    """Header X-Entaris-Actor + X-Entaris-Actor-Sig untuk SATU panggilan (nonce baru tiap kali)."""
    payload = {"v": 1, "uid": uid, "ch": channel, "gf": bool(group_floor), "ts": int(time.time()), "nonce": str(uuid.uuid4())}
    if ref:
        payload["ref"] = ref
    raw = json.dumps(payload, separators=(",", ":")).encode()
    b64 = base64.urlsafe_b64encode(raw).rstrip(b"=").decode()                      # base64url tanpa padding
    sig = hmac.new(signing_secret.encode(), b64.encode(), hashlib.sha256).hexdigest()  # HMAC atas string b64 PERSIS
    return {"X-Entaris-Actor": b64, "X-Entaris-Actor-Sig": sig}


def mcp_request(base_url, token, signing_secret, uid, channel, method, params=None, group_floor=False, ref=None, compact=False):
    headers = {
        "Authorization": f"Bearer {token}", "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        **sign_actor(signing_secret, uid, channel, group_floor, ref),
    }
    if compact:
        headers["X-Entaris-Tools"] = "compact"
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, **({"params": params} if params else {})}).encode()
    req = urllib.request.Request(f"{base_url.rstrip('/')}/mcp", data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:      # 401/403/429/503 membawa galat JSON-RPC
        return json.loads(e.read() or b"{}")


def call_tool(base_url, token, secret, uid, channel, name, arguments=None, **kw):
    return mcp_request(base_url, token, secret, uid, channel, "tools/call", {"name": name, "arguments": arguments or {}}, **kw)
```

Pola B (plugin tool) tinggal membungkus `call_tool` di handler `entaris_call(name, arguments)` dan `mcp_request(..., "tools/list", compact=True)` / `cari_tool` di `entaris_catalog`. Hasil tool yang menunggu persetujuan berbentuk `{"status":"pending_approval","approvalId":...,"confirm":"..."}`: tampilkan teks `confirm` ke pengguna.

### Node 18+ (tanpa dependensi) — diuji

```js
import crypto from 'node:crypto';

export function signActor(signingSecret, { uid, channel, groupFloor = false, ref }) {
  const payload = { v: 1, uid, ch: channel, gf: groupFloor, ts: Math.floor(Date.now() / 1000), nonce: crypto.randomUUID(), ...(ref ? { ref } : {}) };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', signingSecret).update(b64).digest('hex');
  return { 'X-Entaris-Actor': b64, 'X-Entaris-Actor-Sig': sig };
}

export async function mcpRequest({ baseUrl, token, signingSecret, actor, method, params, compact = false }) {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(compact ? { 'X-Entaris-Tools': 'compact' } : {}),
      ...signActor(signingSecret, actor),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }),
  });
  return res.json();
}
```

## 6. Contoh curl (token + assertion)

```bash
URL=ENTARIS_URL/mcp; TOKEN=entmcp_...; SECRET=entsig_...; ACTOR_UID=<id user Entaris>

sign() {  # cetak dua header assertion
  B64=$(printf '{"v":1,"uid":"%s","ch":"cli","gf":false,"ts":%s,"nonce":"%s"}' "$ACTOR_UID" "$(date +%s)" "$(uuidgen)" | base64 | tr '+/' '-_' | tr -d '=\n')
  SIG=$(printf '%s' "$B64" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')
  echo "-H X-Entaris-Actor:$B64 -H X-Entaris-Actor-Sig:$SIG"
}
H='-H Content-Type:application/json -H Accept:application/json,text/event-stream'

# initialize (tanpa assertion cukup; hanya token)
curl -s $URL -H "Authorization: Bearer $TOKEN" $H \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'

# tools/list DENGAN assertion (daftar sesuai hak user) — pakai mode ringkas agar kecil
curl -s $URL -H "Authorization: Bearer $TOKEN" $(sign) $H -H 'X-Entaris-Tools: compact' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# tools/call tool baca
curl -s $URL -H "Authorization: Bearer $TOKEN" $(sign) $H \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"coa_list","arguments":{}}}'

# tools/call tulis (jadi pending_approval untuk level Standar)
curl -s $URL -H "Authorization: Bearer $TOKEN" $(sign) $H \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"party_create","arguments":{"name":"PT Contoh","partyType":"Customer","idempotencyKey":"contoh-1"}}}'

# TANPA assertion: bertindak sebagai aktor default token (error 401 actor_required bila tak ada)
curl -s $URL -H "Authorization: Bearer $TOKEN" $H -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"whoami","arguments":{}}}'
```

`sign()` memakai `uuidgen`/`openssl` (macOS/Linux). Setiap `$(sign)` membuat nonce baru; mengulang header yang sama akan ditolak (`actor_nonce_replayed`).

## 7. Alur persetujuan (uji akhir)

1. Pengguna level Standar meminta tindakan kritis lewat chat; hasil tool `pending_approval` + teks konfirmasi.
2. Admin membuka *Persetujuan* di Entaris: baris **Permintaan AIRA** (teks konfirmasi, argumen, siapa/channel/token) -> **Setuju** menjalankan permintaan sebagai pengaju asli; **Tolak** tidak menjalankan apa pun.
3. Jejak: *Pengaturan > AIRA (MCP) > Riwayat panggilan* (keputusan, link ke persetujuan) dan *Jejak Audit* (`via=mcp`, token, channel).

## 8. Pemecahan masalah

| Gejala | Penyebab / solusi |
|---|---|
| `401 token_invalid / token_revoked / token_expired` | token salah/dicabut/kedaluwarsa; buat token baru. Pastikan header `Authorization: Bearer entmcp_...` (tanpa spasi/kutip tambahan) |
| `401 actor_signature_invalid` | signing secret salah (atau sudah diputar), atau HMAC dihitung atas JSON mentah, bukan atas **string base64url persis**; base64 harus url-safe tanpa padding |
| `401 actor_assertion_expired` / `actor_assertion_future` | jam RPi5 melenceng. TTL 120 dtk, toleransi maju 30 dtk. Periksa NTP |
| `401 actor_nonce_replayed` | header assertion dipakai ulang; buat nonce baru tiap panggilan (jangan cache/retry dengan header lama) |
| `401 actor_required` | tanpa assertion dan token tak punya aktor default |
| `403 actor_unknown / actor_inactive / actor_not_registered` | `uid` salah, user nonaktif, atau **Akses AIRA** belum dinyalakan di Manajemen Pengguna |
| `503 agentic_disabled` | kill switch mati; nyalakan di Pengaturan > AIRA (MCP) |
| `429 rate_limited` | lebih dari batas per menit (lihat `Retry-After`); naikkan batas token bila perlu |
| `413 payload_too_large` | body > 256 KB; kecilkan argumen |
| Tool tidak muncul di `tools/list` | level AIRA `Baca saja`, role tak punya izin modul/capability, tool dinonaktifkan di override, atau mode ringkas aktif (pakai `cari_tool`) |
| Hasil `isError` "Argumen tidak valid" | enum/wajib salah; baca `dokumen_tool` |
| Hasil `pending_approval` padahal ingin langsung | level `Standar` (tulis non-draft/kritis selalu antri) atau chat grup (`gf=true`); level `Langsung` hanya bila perlu |
| Persetujuan gagal "Eksekusi gagal: ..." | handler menolak (stok/validasi/izin); pengajuan kembali Pending dengan `lastError`; perbaiki lalu setujui lagi atau tolak |
| `tools/list` penuh terlalu besar untuk model | pakai `X-Entaris-Tools: compact` + `cari_tool`/`panggil_tool` |
