# Entaris — Aset Media Sosial

Semua file tersedia dalam **PNG** (siap unggah) dan **SVG** (master, untuk diedit atau di-resize). Desainnya flat, sesuai panduan merek: latar navy `#1B2B48`, logo versi negatif, dan simbol ∇ besar bernada navy sebagai dekorasi latar.

## Foto profil — `avatars/`
| File | Pakai untuk |
|---|---|
| `entaris-avatar-navy-1080.png` | **Utama.** Instagram, Facebook, LinkedIn (halaman perusahaan), X, YouTube, TikTok, WhatsApp Business |
| `entaris-avatar-white-1080.png` | Alternatif bila platform/tema sudah gelap atau butuh latar terang |
| `instagram-highlight-cover-1080x1920.png` | Sampul Highlight Instagram |

Ukuran 1080×1080 cukup untuk semua platform, karena platform akan mengecilkannya sendiri. Simbol diletakkan di pusat optis dan aman untuk crop lingkaran.

## Banner / sampul — `covers/`
| File | Platform | Catatan penempatan |
|---|---|---|
| `x-header-1500x500.png` | X (Twitter), header | Logo di tengah, bebas 60 px atas-bawah, tetap utuh saat crop 2:1 di HP |
| `linkedin-company-cover-1128x191.png` | LinkedIn, halaman perusahaan | Lockup compact (tanpa tagline) supaya terbaca di banner yang pendek |
| `linkedin-personal-cover-1584x396.png` | LinkedIn, profil pribadi | Logo digeser ke kanan, menjauhi foto profil di kiri bawah |
| `facebook-cover-1702x630.png` | Facebook Page | 2× dari ukuran tampil 851×315. Logo di tengah, aman untuk crop desktop dan HP |
| `youtube-banner-2560x1440.png` | YouTube, channel banner | Logo berada di area aman tengah 1235×338, jadi terlihat di TV, desktop, dan HP |
| `og-image-1200x630.png` | Pratinjau tautan (Open Graph) | Gambar yang muncul saat link situs dibagikan di WhatsApp, LinkedIn, X, atau Slack |

Untuk memakai `og-image`, pasang di `<head>` situs:
```html
<meta property="og:image" content="https://<domain>/og-image-1200x630.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
```

## Watermark postingan — `watermark/`
| File | Pakai untuk |
|---|---|
| `entaris-watermark-white.png` | Ditempel di foto atau postingan berlatar gelap |
| `entaris-watermark-navy.png` | Ditempel di postingan berlatar terang |

PNG transparan, lebar 600 px. Taruh di salah satu sudut dengan lebar sekitar 15–20% dari lebar postingan.

## Jangan
- Memotong simbol ∇ di foto profil, atau memutar dan meregangkannya.
- Menambah gradien, bayangan, atau efek kilau ke logo.
- Menaruh logo berwarna (bukan versi negatif) di atas latar navy.
