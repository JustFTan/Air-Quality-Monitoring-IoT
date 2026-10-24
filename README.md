# Pantau Udara — dashboard kualitas udara (FastAPI + Next.js, SQLite lokal atau Turso + Vercel)

Dashboard untuk data sensor ESP32: **CO₂, PM2.5, suhu, dan kelembapan**, dengan data **per menit** (mentah dan tervalidasi) dan **per jam**, lengkap dengan **log** semua kejadian.

```
aq-dashboard-pro/
├─ backend/    main.py  aq.py  db.py  simulate.py  requirements.txt     (aq.db dibuat otomatis)
└─ frontend/   app/ (5 halaman)  components/  lib/  package.json
```

## Fitur

| Halaman | Isi |
|---|---|
| **Ringkasan** | Kondisi udara sekarang (parameter terburuk), ISPU PM2.5, jalur 24 jam (1 sel = 15 menit), 4 kartu nilai + tren mini, grafik 4 parameter, status perangkat (online, WiFi, uptime, sensor), kelengkapan data & jeda, peristiwa terbaru |
| **Tren** | Pilih sumber (menit tervalidasi / menit mentah / jam dari perangkat / jam dihitung ulang), rentang 1 jam–30 hari, parameter, **bandingkan mentah vs tervalidasi**, garis ambang, zoom dengan menyeret, tabel statistik, unduh CSV |
| **Per jam** | Grafik batang per jam, peta panas jam × hari, tertinggi/terendah/rata-rata, dan **tabel cek rata-rata jam**: nilai dari perangkat vs hitung ulang dari data 2 menit |
| **Data** | Tabel data (jenis, rentang termasuk kustom, urutan, paginasi), unduh CSV |
| **Log** | Semua kejadian server: filter tingkat/kejadian/rentang/kata kunci, klik baris untuk melihat paket JSON mentah, diperbarui otomatis |

Lainnya: tema terang/gelap/ikut sistem, pilih perangkat (kalau lebih dari satu), perbarui otomatis tiap 30 detik (berhenti saat tab tidak dibuka), tampilan mobile.
Setiap grafik punya tombol **Tabel** (angka yang sama dalam bentuk tabel). Status selalu memakai **bentuk + teks**, bukan warna saja.

## Menjalankan

**1. Backend**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```
Dokumentasi API: http://localhost:8000/docs

**2. Frontend**
```bash
cd frontend
npm install
npm run dev          # http://localhost:3000   (produksi: npm run build && npm start)
```
Kalau backend ada di komputer lain atau di Vercel, salin `.env.example` jadi `.env.local` lalu ubah `NEXT_PUBLIC_API_URL`.

**3. Coba tanpa ESP32 (simulator)**
```bash
cd backend
python simulate.py                        # isi 48 jam data lalu selesai
python simulate.py --live                 # lanjut kirim data baru tiap 120 detik
python simulate.py --live --interval 10   # live dipercepat untuk demo
python simulate.py --hours 6 --no-gaps    # lebih sedikit data, tanpa jeda
```
Simulator memakai format paket yang sama persis dengan `makeJson()` di `Send.h`, termasuk lonjakan sensor (mentah ada, tervalidasi `NULL`), sensor gagal baca, perangkat mati sebentar, dan paket `1h_valid`.
Data histori dari simulator dihitung server sebagai "data tertunda" di log, itu normal.

## Deploy gratis tanpa API lokal (Vercel + Turso)

Vercel tidak punya disk permanen, jadi file `aq.db` tidak bisa dipakai di sana. Solusinya database terpisah di **Turso** (SQLite di cloud, gratis, tanpa kartu kredit). Backend otomatis memakai Turso kalau `TURSO_DATABASE_URL` terisi, dan SQLite lokal kalau kosong, jadi kode yang sama jalan di dua tempat.

Struktur: dua project Vercel dari satu repo GitHub, ditambah satu database Turso.

**1. Database Turso**
1. Daftar di https://turso.tech (boleh pakai GitHub), buat database baru. Pilih lokasi terdekat (Tokyo atau Singapura kalau ada).
2. Buka database itu, ambil **URL** (`libsql://...turso.io`) dan buat **token** (Create Token).
   Lewat CLI: `turso db create aq`, `turso db show aq --url`, `turso db tokens create aq`.

Tabel dibuat otomatis saat request pertama.

**2. Backend di Vercel**
1. Push repo ke GitHub (pastikan `backend/` dan `frontend/` ada di dalamnya).
2. Vercel → Add New → Project → pilih repo → **Root Directory: `backend`**. Framework terdeteksi FastAPI otomatis (`main.py` berisi `app`).
3. Environment Variables: `TURSO_DATABASE_URL` dan `TURSO_AUTH_TOKEN`. Deploy.
4. Cek `https://<backend>.vercel.app/api/health`, harus mengembalikan `{"status":"ok",...}`.
5. Settings → Functions → **Function Region**: pilih yang paling dekat dengan lokasi database Turso (satu request ESP32 butuh sekitar 5 panggilan ke database, jadi jarak berpengaruh).

**3. Frontend di Vercel**
1. Add New → Project → repo yang sama → **Root Directory: `frontend`** (Next.js).
2. Environment Variables: `NEXT_PUBLIC_API_URL` = alamat backend tadi (tanpa `/` di akhir), dan disarankan `NEXT_PUBLIC_REFRESH_S` = `60`. Deploy.
3. Variabel `NEXT_PUBLIC_*` dibaca saat build. Kalau diubah, lakukan **Redeploy**.

**4. ESP32**: ganti alamat tujuan (tetap https, karena kode asli sudah memakai `WiFiClientSecure`):
```cpp
const String api_rndbirulangit = "https://<backend>.vercel.app/api/post";
// pastikan klien aman tidak memverifikasi sertifikat (cukup untuk tugas kuliah):
client.setInsecure();      // WiFiClientSecure client;
```
Format JSON tidak berubah. Respons 201 (baru) dan 200 (duplikat) tetap dianggap sukses oleh ESP32, jadi antrean SPIFFS aman dikirim ulang.

**5. Coba tanpa ESP32** dari komputer mana saja:
```bash
python backend/simulate.py --url https://<backend>.vercel.app/api/post --hours 6 --seed 1
```

**Batas gratis yang perlu diketahui**
- Vercel Hobby dan Turso Free memakai batas yang bisa berubah. Cek halaman harga masing-masing, terutama kuota baca baris Turso.
- Dashboard tidak punya proses latar. Status *offline* dan log `device_offline` dicatat saat ada request berikutnya (data masuk atau dashboard dibuka), dengan waktu yang disesuaikan ke saat data berhenti. Kalau tidak ada yang membuka dashboard, log offline baru muncul saat itu.
- Tiap halaman yang terbuka memanggil API sesuai `NEXT_PUBLIC_REFRESH_S` dan berhenti saat tab tidak aktif. Rentang 30 hari memuat banyak baris, sebaiknya jangan dibiarkan terbuka.
- Log yang disimpan dibatasi `LOG_KEEP` (default 5000 di Turso) supaya halaman Log hemat baca.
- Satu request ESP32 yang kena timeout lalu dikirim ulang aman (kunci unik), tetapi angka "jumlah data" di daftar perangkat bisa selisih tipis kalau request terputus tepat di tengah.

## Menyambungkan ESP32 ke backend lokal

Format JSON di `Send.h` **tidak perlu diubah**. Cukup arahkan ke backend ini (http, bukan https):
```cpp
const String api_rndbirulangit = "http://<IP-LAN-laptop>:8000/api/post";
WiFiClient client_local;                                  // pakai ini, bukan WiFiClientSecure
// di postBody():  https.begin(client_local, api_rndbirulangit)
```
Laptop dan ESP32 harus satu jaringan, dan port 8000 tidak boleh diblokir firewall.
Kalau Serial Monitor menampilkan `-1`, itu artinya koneksi gagal (IP/port/firewall salah), bukan masalah format data.

Backend membalas **201** untuk data baru dan **200** untuk data yang sudah ada, jadi antrean SPIFFS di ESP32 aman dikirim ulang tanpa membuat data ganda.

## Uji ketahanan (slide 18)

1. Jalankan ESP32 dan pastikan data masuk (halaman Ringkasan, status Online).
2. Matikan backend selama 10 menit. ESP32 menyimpan paket ke antrean SPIFFS.
3. Nyalakan backend lagi. ESP32 mengirim ulang antrean.
4. Cek halaman **Log**: kejadian *Data tertunda diterima* muncul untuk paket antrean, dan *Kiriman ganda diabaikan* kalau ada paket yang terkirim dua kali.
5. Cek halaman **Data** atau `aq.db`: tidak ada baris ganda (kunci unik `type + device + created_at`).

## Kejadian di log

| Kejadian | Tingkat | Arti |
|---|---|---|
| `ingest` | Info | Data masuk normal |
| `backfill` | Info | Data tertunda (terlambat lebih dari ~8 menit atau urutan waktu mundur) |
| `duplicate` | Info | Paket sudah ada, diabaikan |
| `gap` | Peringatan | Jeda antar data lebih dari 3,5 menit (jam: lebih dari 66 menit) |
| `validation_reject` | Peringatan | Nilai tervalidasi `NULL` (ditolak range/outlier di ESP32) |
| `hour_incomplete` | Peringatan | Rata-rata jam tidak valid untuk parameter tertentu |
| `level_change` | Info/Peringatan | Kategori berubah (harus bertahan 3 pembacaan dan minimal 30 menit sejak catatan terakhir, agar tidak bolak-balik di sekitar ambang) |
| `sensor_fault` | Error | Data mentah `NULL`: sensor gagal baca |
| `device_offline` / `device_online` | Error / Info | Tidak ada data selama `OFFLINE_AFTER_S` (default 360 detik), dan saat kembali |
| `invalid_payload` | Error | Paket rusak, ditolak dengan 422 |

## Endpoint

| Method | Path | Fungsi |
|---|---|---|
| POST | `/api/post` | Terima paket ESP32 (201 baru, 200 duplikat, 422 rusak) |
| GET | `/api/config` | Ambang dan kategori (satu sumber untuk backend dan frontend) |
| GET | `/api/devices` | Daftar perangkat, status online, jumlah data |
| GET | `/api/overview?device=` | Ringkasan: nilai terbaru, statistik 24 jam, jalur 24 jam, kelengkapan, peristiwa |
| GET | `/api/readings?type=&hours=&start=&end=&bucket=&limit=&offset=&order=` | Data (`type` = `2m_raw`, `2m_validated`, `1h_valid`; `bucket` = rata-rata per N menit) |
| GET | `/api/stats?type=&hours=` | Min, rata-rata, maks, jumlah data, jumlah kosong |
| GET | `/api/hourly?days=` | Rata-rata jam dari perangkat dan hasil hitung ulang |
| GET | `/api/logs?level=&event=&q=&hours=&limit=&offset=` | Log kejadian |
| GET | `/api/export.csv?type=&hours=` | Unduh CSV |

## Pengaturan (variabel lingkungan backend)

| Variabel | Default | Fungsi |
|---|---|---|
| `AQ_DB` | `aq.db` | Lokasi file SQLite (mode lokal) |
| `TURSO_DATABASE_URL` | kosong | Kalau diisi, memakai Turso, bukan SQLite lokal |
| `TURSO_AUTH_TOKEN` | kosong | Token database Turso |
| `TZ_OFFSET_HOURS` | `7` | Zona waktu server (WIB) untuk waktu terima dan log |
| `OFFLINE_AFTER_S` | `360` | Detik tanpa data sebelum perangkat dianggap offline |
| `LOG_KEEP` | `50000` (lokal), `5000` (Turso) | Jumlah log terbaru yang disimpan |

## Catatan

- **Ambang kategori.** PM2.5 memakai breakpoint ISPU (Permen LHK P.14/2020), dan ISPU di dashboard dihitung dari nilai PM2.5 terbaru. ISPU resmi memakai rata-rata 24 jam, karena itu rata-rata 24 jam ditampilkan di sampingnya. Ambang CO₂, suhu, dan kelembapan adalah pedoman umum ruangan, bukan standar resmi. Semua ada di `backend/aq.py`, mudah diubah.
- **Waktu.** Dashboard menampilkan jam persis seperti yang dikirim ESP32 (`created_at_1`), tanpa konversi zona.
- **Dua mode database.** Lokal: SQLite (`aq.db`) dengan loop pemantau offline tiap 30 detik. Turso: semua status (online, kategori terakhir yang dicatat) disimpan di tabel, tanpa memori server.
- **Database lama.** `aq.db` dari versi sebelumnya otomatis dimigrasi (kolom baru ditambahkan).
- **Push ke GitHub.** Jalankan `git init` di folder `aq-dashboard-pro` ini saja. Jangan ada folder `.git` di dalam `backend/` atau `frontend/`, karena isinya tidak akan ikut ter-push. Taruh SSID/password WiFi di `secrets.h` (sudah di `.gitignore`), jangan di `Tubes.ino`.
#   A i r - Q u a l i t y - M o n i t o r i n g - I o T  
 