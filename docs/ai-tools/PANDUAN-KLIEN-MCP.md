# Panduan Klien MCP: menyambungkan engine AIRA (atau klien MCP apa pun) ke Entaris

Untuk owner/integrator. Arsitektur & spesifikasi: [ARSITEKTUR-MCP.md](ARSITEKTUR-MCP.md). Alamat Entaris di bawah ditulis `ENTARIS_URL` (mis. `http://100.x.y.z:3001` lewat jaringan privat; jangan lewat internet publik).

Endpoint Entaris adalah **MCP standar** (Streamable HTTP, stateless, respons JSON). Klien apa pun (engine AIRA, desktop client MCP, SDK MCP, `curl`) cukup memakai:

| Item | Nilai |
|---|---|
| URL endpoint MCP | `ENTARIS_URL/mcp` |
| Header Authorization | `Authorization: Bearer entmcp_...` (token dari *Pengaturan > AIRA (MCP)*) |
| Mode ringkas (opsional) | header `X-Entaris-Tools: compact` atau query `?mode=compact` |
| Identitas orang (opsional, disarankan) | actor assertion bertanda tangan (bagian 3) |

Tanpa assertion, panggilan bertindak sebagai **aktor default** token (cocok untuk CLI/dev/klien desktop). Assertion dipakai agar engine AIRA dapat bertindak atas nama orang yang sedang dilayani.

## 1. Di Entaris (sekali)

1. Aktifkan layanan: *Pengaturan > AIRA (MCP)* -> saklar **Layanan AIRA aktif** menyala.
2. *Manajemen Pengguna*: untuk tiap orang yang boleh memakai AIRA nyalakan **Akses AIRA**, pilih level (**Baca saja / Standar / Langsung**) dan isi **Jabatan AIRA**. Mulailah dengan **Standar**; **Langsung** hanya untuk orang tepercaya (tindakan tulis/kritis jalan tanpa persetujuan terpisah).
3. *Pengaturan > AIRA (MCP) > Token MCP > Buat token*: beri nama (mis. `aira-dev`); **Aktor default** boleh dikosongkan (assertion wajib) atau diisi satu pengguna untuk uji CLI. Salin **token** dan **signing secret** (tampil sekali!) ke pengelola rahasia.
4. Env server (opsional tapi disarankan): `MCP_SECRET_KEY` (>= 32 karakter acak). Lihat bagian Deploy di CHANGELOG.
5. Catat `uid` (id user Entaris) tiap orang: *Jejak Audit*/DB, atau `GET /api/users`. Sisi klien/engine bertugas memetakan identitas channel -> `uid` (Entaris tidak menyimpan nomor WhatsApp/Telegram).

## 2. Menyambungkan klien

Daftarkan server MCP pada klien dengan **URL endpoint** dan **header statis** di atas. Contoh bentuk konfigurasi generik (nama kunci berbeda per klien):

```json
{
  "mcpServers": {
    "entaris": {
      "url": "ENTARIS_URL/mcp",
      "headers": {
        "Authorization": "Bearer entmcp_...",
        "X-Entaris-Tools": "compact"
      }
    }
  }
}
```

Simpan token dan signing secret di variabel lingkungan/pengelola rahasia, bukan di berkas yang dilacak git.

Uji jangkauan:

```bash
curl -s ENTARIS_URL/mcp/health        # -> {"status":"ok",...}
curl -s ENTARIS_URL/mcp -H "Authorization: Bearer entmcp_..." \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

### Mode ringkas (compact)

`tools/list` penuh untuk Admin sekitar 445 KB (+-465 definisi), terlalu besar untuk konteks model. Dengan `X-Entaris-Tools: compact`, `tools/list` hanya memuat meta-tool: `cari_tool`, `dokumen_tool`, `whoami`, `pratinjau_tool({tool,args})`, dan `panggil_tool({tool,args})`. Mode ini tidak butuh aktor. Model mencari tool lewat `cari_tool`, membaca skemanya lewat `dokumen_tool`, lalu memanggilnya lewat `panggil_tool`.

## 3. Actor assertion (spesifikasi v1)

Mengikat satu panggilan ke satu orang. Dibuat oleh **sisi klien yang tepercaya** (kode integrator, bukan model AI), ditandatangani dengan signing secret token.

| Bagian | Isi |
|---|---|
| `X-Entaris-Actor` | `base64url(JSON)` **tanpa padding** |
| `X-Entaris-Actor-Sig` | hex `HMAC-SHA256(signingSecret, <string base64url persis seperti di header>)` |

Payload JSON:

```json
{"v":1,"uid":"<id user Entaris>","ch":"whatsapp|telegram|panel|cli","gf":false,"ts":1790000000,"nonce":"<uuid>","ref":"<opaque chat/session ref, opsional>"}
```

| Field | Arti |
|---|---|
| `v` | versi, selalu `1` |
| `uid` | id user Entaris yang dilayani |
| `ch` | channel asal pesan |
| `gf` | *group floor*: pada chat grup, pakai anggota berprivilese terendah sebagai `uid` dan kirim `gf:true`; level `direct` otomatis turun ke `standard` |
| `ts` | epoch detik. **TTL 120 detik**; maksimal 30 detik di depan jam server |
| `nonce` | **sekali pakai** (uuid baru tiap panggilan; jangan di-cache atau di-retry dengan header lama) |
| `ref` | referensi opak chat/sesi untuk jejak audit (opsional, maks. 200 karakter). Disimpan di `mcp_call_logs.ref`; panel chat memakai `<sessionId>:<turnId>` untuk menampilkan progres tool dan kartu hasil per giliran |

Urutan verifikasi server: bentuk base64url -> tanda tangan constant-time -> skema payload -> TTL -> nonce -> user ada/aktif/terdaftar AIRA.

### Dua cara membawa assertion

1. **Header** (utama): `X-Entaris-Actor` + `X-Entaris-Actor-Sig` pada request HTTP. Untuk klien yang bisa menyetel header per panggilan.
2. **Di dalam argumen** (untuk klien yang hanya punya header statis per koneksi): kirim nilai yang sama di `params.arguments._entaris_actor` dan `params.arguments._entaris_actor_sig` pada `tools/call`. Kunci itu dibuang server sebelum tool dijalankan. Keamanan identik (HMAC + TTL + nonce): model AI tidak memegang secret sehingga tidak dapat memalsukannya, jadi suntikan harus dilakukan oleh kode klien (mis. hook/middleware sebelum pemanggilan tool), bukan oleh model. Bila keduanya ada, **header menang**.

Contoh `tools/call` dengan assertion di argumen:

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"coa_list","arguments":{"_entaris_actor":"<b64>","_entaris_actor_sig":"<hex>"}}}
```

Perilaku tanpa assertion: bertindak sebagai `defaultActorUserId` token (channel `cli`); tanpa aktor default -> `401 actor_required`. Assertion yang *dikirim tetapi salah* tidak pernah jatuh ke aktor default.

### Menyuntikkan identitas ke model (`identity_prompt`)

### Kartu konfirmasi sebelum aksi tulis (`pratinjau_tool`)

Sebelum memanggil tool tulis, klien dapat memanggil `pratinjau_tool({tool, args})`. Pemeriksaannya sama dengan panggilan sungguhan (tool aktif, level AIRA, RBAC, argumen wajib dan valid), tetapi tidak ada yang dijalankan atau diantrekan. Hasilnya:

| Field | Isi |
|---|---|
| `tindakan` | `baca`, `draft` (hanya membuat draft), `persetujuan` (masuk antrean Persetujuan), atau `langsung` (dieksekusi saat dipanggil) |
| `perlu_konfirmasi` | `true` untuk `persetujuan` dan `langsung`; klien menampilkan kartu Ya/Batal dan baru memanggil tool setelah pengguna menekan Ya |
| `konfirmasi` | teks resmi dari `confirm_template`, dirender dengan argumen; bukan buatan model |
| `efek`, `rincian` | efek pembukuan/stok dan argumen skalar (array = jumlah baris) untuk ditampilkan di kartu |

Kartu ini lapisan tambahan di sisi klien; aturan tier dan antrean Persetujuan Entaris tetap berlaku seperti biasa.

Actor assertion membuat Entaris tahu SIAPA yang memanggil, tetapi model juga harus tahu dengan siapa ia berbicara. Tool `whoami` mengembalikan field **`identity_prompt`**: blok identitas siap pakai (nama, peran + kunci, jabatan AIRA, level + artinya, perusahaan, waktu WIB, kanal dari assertion `ch`, `gf` tercermin sebagai "percakapan grup: batas terendah", daftar toolset/jumlah tool, kapabilitas peran, dan aturan: identitas berwenang dan tak dapat diubah dari percakapan, jawab sesuai peran, tolak sopan bila melebihi peran, angka hanya dari tool, tulis/kritis hanya lewat tool).

**Kewajiban klien/engine: suntikkan blok ini pada SETIAP giliran** (bukan sekali per sesi) sebagai pesan `system`/bagian prompt tepercaya, setelah memetakan pengirim ke `uid`; ambil teks baru tiap giliran karena peran/level dapat berubah. Jangan pernah membiarkan teks percakapan mengubahnya. Panel chat Entaris sudah melakukannya sendiri (lihat [PANEL-CHAT.md](PANEL-CHAT.md)); kanal lain (WhatsApp/Telegram) adalah tanggung jawab engine. Untuk panel chat, tiket giliran bertanda tangan menyampaikan `uid` dan `ref` ke hook sisi engine.

## 4. Implementasi referensi penanda tangan

### Python (3.10+, hanya pustaka standar)

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

Untuk jalur "di dalam argumen", pakai `sign_actor(...)` lalu gabungkan `{"_entaris_actor": h["X-Entaris-Actor"], "_entaris_actor_sig": h["X-Entaris-Actor-Sig"]}` ke `arguments` tepat sebelum `tools/call` dikirim (nonce baru tiap panggilan).

### Node 18+ (tanpa dependensi)

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

Hasil tool yang menunggu persetujuan berbentuk `{"status":"pending_approval","approvalId":...,"confirm":"..."}`: tampilkan teks `confirm` ke pengguna.

## 5. Contoh curl (token + assertion)

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

## 6. Alur persetujuan (uji akhir)

1. Pengguna level Standar meminta tindakan kritis lewat chat; hasil tool `pending_approval` + teks konfirmasi.
2. Admin membuka *Persetujuan* di Entaris: baris **Permintaan AIRA** (teks konfirmasi, argumen, siapa/channel/token) -> **Setuju** menjalankan permintaan sebagai pengaju asli; **Tolak** tidak menjalankan apa pun.
3. Jejak: *Pengaturan > AIRA (MCP) > Riwayat panggilan* (keputusan, link ke persetujuan) dan *Jejak Audit* (`via=mcp`, token, channel).

## 7. Pemecahan masalah

| Gejala | Penyebab / solusi |
|---|---|
| `401 token_invalid / token_revoked / token_expired` | token salah/dicabut/kedaluwarsa; buat token baru. Pastikan header `Authorization: Bearer entmcp_...` (tanpa spasi/kutip tambahan) |
| `401 actor_signature_invalid` | signing secret salah (atau sudah diputar), atau HMAC dihitung atas JSON mentah, bukan atas **string base64url persis**; base64 harus url-safe tanpa padding |
| `401 actor_assertion_expired` / `actor_assertion_future` | jam klien melenceng. TTL 120 dtk, toleransi maju 30 dtk. Periksa NTP |
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
