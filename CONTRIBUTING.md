# Berkontribusi ke Entaris

Terima kasih sudah mau membantu. Entaris berlisensi AGPL-3.0 dan dimiliki PT Arah Karya Sinergi.

## Alur
1. Buka issue dulu untuk perubahan besar supaya arahnya sejalan.
2. Fork, buat branch dari `main`, ikuti konvensi di `CLAUDE.md` (commit memakai conventional commits berbahasa Inggris, teks UI berbahasa Indonesia).
3. Jalankan `npm run lint`, `npx tsc -b`, dan tes di `client/` serta `server/` sebelum membuka pull request. Tool AIRA baru wajib masuk registry `aira-tool-router.json`.
4. Pull request harus lulus CI.

## Developer Certificate of Origin (DCO)
Setiap commit wajib memuat baris `Signed-off-by: Nama <email>` (pakai `git commit -s`). Tanda ini menyatakan Anda berhak menyumbangkan kode itu di bawah lisensi proyek, sesuai https://developercertificate.org/.

## Keamanan
Jangan membuka celah keamanan di issue publik. Lihat `SECURITY.md`.
