# AIRA — Panduan Merek · "Lipat Δ"

**AIRA** (*AI Reasoning Agent*) adalah agen AI di dalam **Entaris**. Logonya dirancang sebagai **saudara** logo Entaris "Anyaman ∇", sehingga keduanya terbaca sebagai satu entitas. Produk **PT Arah Karya Sinergi** (Arah).

## Logo — "Lipat Δ"

Tiga bilah rata yang saling menindih membentuk **huruf A di atas segitiga tegak (Δ)**. Ini adalah ∇ Entaris yang dibalik.

- **∇ Entaris** (gradien) = sistem yang *belajar & bernalar*. **Δ AIRA** (delta, perubahan) = agen yang *bertindak* dan menghasilkan perubahan di data.
- **Bilah biru** (kaki kiri) = agen. **Bilah navy** (kaki kanan) = manusia yang menyetujui. **Bilah tengah** (crossbar) = Tool Layer, tempat aksi dieksekusi.
- **Anyaman siklis**, seperti Entaris: navy menindih biru di puncak (manusia punya kata akhir), biru menindih crossbar (agen menjalankan lewat tool), crossbar menindih navy (setiap aksi tercatat & kembali ke manusia). Tidak ada bilah yang lepas.

### Geometri (kanvas 512, sama dengan Entaris)
- Segitiga sama sisi menunjuk **ke atas**, sisi 440, rentang vertikal 65,5 → 446,5 (sama dengan ∇ Entaris).
- Tebal kaki 88, celah antar-bilah 7, semua potongan 60°.
- Crossbar: tebal 58, tepi atas di y = 312.
- Ikon: tile 512 rx 112, simbol diskalakan 0,76 (maskable 0,66). Sama dengan ikon Entaris.

## Warna (palet Entaris)
| Token | Hex | Di latar terang | Di latar gelap |
|---|---|---|---|
| Navy | `#1B2B48` | kaki kanan, teks "RA" | tile ikon, latar |
| Biru | `#3D8BE0` | kaki kiri, "AI" | kaki kiri |
| Biru tengah | `#2E5CA8` | crossbar | — |
| Biru muda | `#9CC9F5` | — | crossbar, "AI" |
| Putih | `#FFFFFF` | latar | kaki kanan, "RA" |

## Tipografi (sama dengan Entaris)
- Wordmark **AIRA**: Archivo ExtraBold 800, lebar 125%, jarak huruf +4%. **"AI"** biru, "RA" navy (putih di latar gelap). Ini sejajar dengan **"TA"** biru di ENTARIS.
- Tagline **AI REASONING AGENT**: Archivo Medium 500, lebar 110%, jarak huruf +18% (diratakan selebar wordmark).
- Di dalam aplikasi, wordmark boleh dirender sebagai teks dengan font heading aplikasi, mengikuti komponen `Wordmark` Entaris.

## File
```
svg/  aira-mark{,-negative,-mono}.svg
      aira-icon.svg  aira-icon-light.svg  aira-icon-maskable.svg
      aira-lockup{,-negative,-mono}.svg       (horizontal + tagline)
      aira-lockup-compact{,-negative}.svg     (tanpa tagline)
      aira-lockup-stacked{,-negative}.svg
png/  versi PNG dari semua SVG di atas
web/  favicon.svg  favicon.ico (16/32/48)  favicon-{16,32,48}.png
      apple-touch-icon.png  pwa-192x192.png  pwa-512x512.png  pwa-maskable-512x512.png
entaris-client-public/  pengganti langsung untuk ENTARIS client/public:
      aira-icon.png (tema terang)  aira-icon-light.png (tema gelap)
      aira-logo-light.png  aira-logo-dark.png
family/  lockup Entaris & AIRA berdampingan (referensi)
src/  generator (shapely + fontTools); jalankan build3.py untuk membangun ulang
```

## Jangan
- Memutar Δ menjadi ∇. Bentuk ∇ milik Entaris.
- Mengubah urutan tindihan bilah, atau menambah gradien, bayangan, maupun kilau.
- Memakai simbol berwarna di latar gelap. Gunakan versi `-negative`.
- Memakai warna di luar palet Entaris.
