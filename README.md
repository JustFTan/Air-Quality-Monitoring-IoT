# Pantau Udara --- Air Quality Monitoring IoT

Dashboard pemantauan kualitas udara untuk perangkat **ESP32**, dengan
backend **FastAPI** dan frontend **Next.js**. Sistem menyimpan data CO₂,
PM2.5, suhu, dan kelembapan dalam bentuk data per menit (mentah dan
tervalidasi) serta rata-rata per jam, lengkap dengan grafik, ekspor CSV,
status perangkat, dan log kejadian.

## Daftar Isi

-   [Fitur](#fitur)
-   [Struktur Proyek](#struktur-proyek)
-   [Teknologi](#teknologi)
-   [Menjalankan Secara Lokal](#menjalankan-secara-lokal)
-   [Simulator Data](#simulator-data)
-   [Deployment Gratis: Vercel +
    Turso](#deployment-gratis-vercel--turso)
-   [Menghubungkan ESP32](#menghubungkan-esp32)
-   [Uji Ketahanan](#uji-ketahanan)
-   [Kejadian pada Log](#kejadian-pada-log)
-   [Referensi API](#referensi-api)
-   [Variabel Lingkungan](#variabel-lingkungan)
-   [Catatan Teknis](#catatan-teknis)

## Fitur

  -----------------------------------------------------------------------
  Halaman                             Fitur
  ----------------------------------- -----------------------------------
  **Ringkasan**                       Kondisi udara terkini berdasarkan
                                      parameter terburuk, ISPU PM2.5,
                                      riwayat 24 jam (satu sel mewakili
                                      15 menit), empat kartu nilai dengan
                                      tren mini, grafik empat parameter,
                                      status perangkat, kelengkapan data,
                                      jeda, dan peristiwa terbaru.

  **Tren**                            Memilih sumber data menit
                                      tervalidasi, menit mentah,
                                      rata-rata jam dari perangkat, atau
                                      rata-rata jam hasil hitung ulang.
                                      Rentang waktu 1 jam--30 hari,
                                      pemilihan parameter, perbandingan
                                      mentah vs. tervalidasi, garis
                                      ambang, zoom dengan menyeret,
                                      statistik, dan ekspor CSV.

  **Per jam**                         Grafik batang per jam, peta panas
                                      jam × hari, nilai
                                      tertinggi/terendah/rata-rata, serta
                                      perbandingan rata-rata jam dari
                                      perangkat dengan hasil hitung ulang
                                      dari data dua menit.

  **Data**                            Tabel data dengan pilihan jenis,
                                      rentang waktu termasuk rentang
                                      kustom, urutan, paginasi, dan
                                      ekspor CSV.

  **Log**                             Riwayat kejadian server dengan
                                      filter tingkat, jenis kejadian,
                                      rentang waktu, dan kata kunci. Klik
                                      baris untuk melihat paket JSON
                                      mentah. Data diperbarui otomatis.
  -----------------------------------------------------------------------

Fitur tambahan: - Tema terang, gelap, atau mengikuti sistem. - Pemilihan
perangkat jika tersedia lebih dari satu. - Pembaruan otomatis setiap 30
detik secara default; berhenti saat tab tidak aktif. - Tampilan yang
mendukung perangkat mobile. - Grafik dapat dialihkan ke tampilan
tabel. - Status disajikan dengan bentuk dan teks, bukan warna saja.

## Struktur Proyek

``` text
aq-web/
├── backend/
│   ├── main.py
│   ├── aq.py
│   ├── db.py
│   ├── simulate.py
│   └── requirements.txt
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── package.json
├── .gitignore
└── README.md
```

Database SQLite lokal (`aq.db`) dibuat otomatis oleh backend dan tidak
perlu diunggah ke GitHub.

## Teknologi

-   **Backend:** FastAPI, Python, SQLite atau Turso (libSQL).
-   **Frontend:** Next.js.
-   **Deployment:** Vercel.
-   **Perangkat:** ESP32 dengan sensor kualitas udara.
-   **Format data:** JSON dari perangkat ke endpoint API.

## Menjalankan Secara Lokal

### 1. Jalankan backend

Buka terminal dari folder utama proyek:

``` bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Dokumentasi interaktif API tersedia di:

-   `http://localhost:8000/docs`

### 2. Jalankan frontend

Buka terminal baru dari folder utama proyek:

``` bash
cd frontend
npm install
npm run dev
```

Buka dashboard di `http://localhost:3000`.

Untuk menjalankan frontend dalam mode produksi:

``` bash
npm run build
npm start
```

Jika backend berjalan di komputer lain atau sudah di-deploy, buat file
`frontend/.env.local` berdasarkan `.env.example`, lalu atur URL backend
melalui `NEXT_PUBLIC_API_URL`. Pastikan file `.env.local` tidak
di-commit.

## Simulator Data

Simulator memungkinkan dashboard diuji tanpa ESP32.

Jalankan dari folder `backend/`:

``` bash
# Isi 48 jam data, lalu berhenti
python simulate.py

# Kirim data baru setiap 120 detik secara terus-menerus
python simulate.py --live

# Mode live dengan interval 10 detik untuk demo
python simulate.py --live --interval 10

# Isi 6 jam data tanpa jeda data
python simulate.py --hours 6 --no-gaps
```

Simulator menggunakan format paket yang sama dengan `makeJson()` di
`Send.h`. Skenario simulasi mencakup lonjakan sensor (nilai mentah tetap
ada, nilai tervalidasi menjadi `NULL`), kegagalan pembacaan sensor,
perangkat yang berhenti sementara, dan paket `1h_valid`.

Data histori dari simulator dapat dicatat server sebagai **data
tertunda** pada log. Ini normal untuk data yang waktunya lebih lama
daripada waktu penerimaan.

## Deployment Gratis: Vercel + Turso

Vercel tidak menyediakan disk permanen untuk menyimpan file SQLite
lokal. Untuk deployment, proyek ini dapat memakai **Turso** sebagai
database cloud. Backend menggunakan Turso jika `TURSO_DATABASE_URL`
diatur; jika tidak, backend menggunakan SQLite lokal.

Arsitektur deployment terdiri dari dua proyek Vercel dari repository
GitHub yang sama dan satu database Turso.

### 1. Buat database Turso

1.  Daftar di [Turso](https://turso.tech) dan buat database baru.
2.  Pilih lokasi database yang dekat dengan lokasi backend jika
    memungkinkan.
3.  Salin URL database (`libsql://...turso.io`) dan buat authentication
    token.

Perintah CLI alternatif:

``` bash
turso db create aq
turso db show aq --url
turso db tokens create aq
```

Tabel database dibuat otomatis saat request pertama.

### 2. Deploy backend ke Vercel

1.  Push repository ke GitHub dan pastikan folder `backend/` serta
    `frontend/` tersedia.
2.  Di Vercel, pilih **Add New → Project**, lalu pilih repository ini.
3.  Atur **Root Directory** ke `backend`.
4.  Tambahkan environment variables berikut:
    -   `TURSO_DATABASE_URL`
    -   `TURSO_AUTH_TOKEN`
5.  Deploy backend.
6.  Uji endpoint kesehatan di
    `https://<nama-backend>.vercel.app/api/health`. Respons yang
    diharapkan memuat status `ok`.
7.  Pada pengaturan Functions, pilih region yang sedekat mungkin dengan
    lokasi database Turso.

### 3. Deploy frontend ke Vercel

1.  Tambahkan proyek Vercel baru dari repository GitHub yang sama.
2.  Atur **Root Directory** ke `frontend`.
3.  Tambahkan environment variables:
    -   `NEXT_PUBLIC_API_URL`: URL backend tanpa garis miring (`/`) di
        bagian akhir.
    -   `NEXT_PUBLIC_REFRESH_S`: disarankan `60`.
4.  Deploy frontend.

Variabel `NEXT_PUBLIC_*` dibaca saat proses build. Jika nilainya diubah,
lakukan redeploy.

### 4. Arahkan ESP32 ke backend Vercel

Ubah URL endpoint pada kode ESP32:

``` cpp
const String api_rndbirulangit = "https://<nama-backend>.vercel.app/api/post";
```

Kode asli menggunakan `WiFiClientSecure`. Pastikan konfigurasi TLS
sesuai dengan implementasi perangkat. Contoh berikut menonaktifkan
verifikasi sertifikat dan hanya layak untuk demonstrasi atau pengujian
terbatas, bukan penggunaan produksi:

``` cpp
client.setInsecure();  // WiFiClientSecure client;
```

Format JSON tidak berubah. Respons `201` untuk data baru dan `200` untuk
data duplikat tetap dianggap sukses oleh ESP32, sehingga antrean SPIFFS
dapat dikirim ulang.

### 5. Uji endpoint deployment tanpa ESP32

``` bash
python backend/simulate.py --url https://<nama-backend>.vercel.app/api/post --hours 6 --seed 1
```

### Batasan deployment gratis

-   Kuota dan batas paket Vercel Hobby serta Turso Free dapat berubah.
    Periksa halaman harga dan kuota terkini, khususnya pemakaian baca
    baris Turso.
-   Dashboard tidak menjalankan proses latar secara terus-menerus.
    Status offline dan log `device_offline` dicatat ketika ada request
    berikutnya, misalnya saat data masuk atau dashboard dibuka.
-   Setiap halaman aktif memanggil API sesuai `NEXT_PUBLIC_REFRESH_S`
    dan berhenti saat tab tidak aktif. Rentang 30 hari dapat memuat
    banyak baris.
-   Jumlah log yang disimpan dibatasi oleh `LOG_KEEP` (default 5.000 di
    Turso).
-   Pengiriman ulang setelah timeout aman terhadap duplikasi berdasarkan
    kunci unik, tetapi jumlah data pada daftar perangkat dapat sedikit
    berbeda jika koneksi terputus di tengah proses.

## Menghubungkan ESP32

### Backend lokal

Jika ESP32 dan komputer backend berada di jaringan lokal yang sama,
arahkan perangkat ke alamat IP LAN komputer:

``` cpp
const String api_rndbirulangit = "http://<IP-LAN-laptop>:8000/api/post";
WiFiClient client_local;  // gunakan WiFiClient, bukan WiFiClientSecure
```

Pada fungsi `postBody()`, gunakan client tersebut:

``` cpp
https.begin(client_local, api_rndbirulangit);
```

Pastikan: - ESP32 dan komputer berada pada jaringan yang sama. - Port
`8000` tidak diblokir firewall. - Backend dijalankan dengan host
`0.0.0.0`.

Jika Serial Monitor menampilkan `-1`, periksa alamat IP, port, jaringan,
dan firewall terlebih dahulu.

### Respons API dan antrean SPIFFS

Backend merespons: - `201` untuk data baru. - `200` untuk data yang
sudah pernah diterima (duplikat).

Dengan demikian, antrean SPIFFS pada ESP32 dapat dikirim ulang tanpa
membuat data ganda.

## Uji Ketahanan

Skenario pengujian (slide 18):

1.  Jalankan ESP32 dan pastikan data masuk; status perangkat terlihat
    **Online** pada halaman Ringkasan.
2.  Matikan backend selama 10 menit. ESP32 seharusnya menyimpan paket di
    antrean SPIFFS.
3.  Nyalakan backend kembali agar ESP32 mengirim ulang paket antrean.
4.  Buka halaman **Log**. Periksa kejadian **Data tertunda diterima**
    dan, jika ada paket terkirim dua kali, **Kiriman ganda diabaikan**.
5.  Periksa halaman **Data** atau database `aq.db` untuk memastikan
    tidak ada baris ganda. Kunci unik yang digunakan adalah
    `type + device + created_at`.

## Kejadian pada Log

  -----------------------------------------------------------------------
  Kejadian                Tingkat                 Keterangan
  ----------------------- ----------------------- -----------------------
  `ingest`                Info                    Data diterima secara
                                                  normal.

  `backfill`              Info                    Data tertunda, misalnya
                                                  terlambat lebih dari
                                                  sekitar 8 menit atau
                                                  urutan waktu mundur.

  `duplicate`             Info                    Paket sudah ada dan
                                                  diabaikan.

  `gap`                   Peringatan              Jeda antar-data lebih
                                                  dari 3,5 menit; untuk
                                                  data per jam, lebih
                                                  dari 66 menit.

  `validation_reject`     Peringatan              Nilai tervalidasi
                                                  menjadi `NULL` karena
                                                  ditolak sebagai di luar
                                                  rentang atau outlier di
                                                  ESP32.

  `hour_incomplete`       Peringatan              Rata-rata jam tidak
                                                  valid untuk parameter
                                                  tertentu.

  `level_change`          Info/Peringatan         Kategori berubah
                                                  setelah memenuhi aturan
                                                  kestabilan: tiga
                                                  pembacaan dan minimal
                                                  30 menit sejak
                                                  pencatatan terakhir.

  `sensor_fault`          Error                   Data mentah `NULL`
                                                  karena pembacaan sensor
                                                  gagal.

  `device_offline` /      Error / Info            Perangkat tidak
  `device_online`                                 mengirim data selama
                                                  `OFFLINE_AFTER_S`
                                                  (default 360 detik),
                                                  lalu terdeteksi
                                                  kembali.

  `invalid_payload`       Error                   Paket tidak valid dan
                                                  ditolak dengan HTTP
                                                  422.
  -----------------------------------------------------------------------

## Referensi API

Dokumentasi interaktif saat backend berjalan tersedia di `/docs`.

  ------------------------------------------------------------------------------------------------------------------------
  Method                  Endpoint                                                                 Fungsi
  ----------------------- ------------------------------------------------------------------------ -----------------------
  `POST`                  `/api/post`                                                              Menerima paket ESP32:
                                                                                                   `201` untuk data baru,
                                                                                                   `200` untuk duplikat,
                                                                                                   `422` untuk payload
                                                                                                   tidak valid.

  `GET`                   `/api/config`                                                            Mengambil ambang dan
                                                                                                   kategori yang digunakan
                                                                                                   backend dan frontend.

  `GET`                   `/api/devices`                                                           Daftar perangkat,
                                                                                                   status online, dan
                                                                                                   jumlah data.

  `GET`                   `/api/overview?device=`                                                  Ringkasan nilai
                                                                                                   terbaru, statistik 24
                                                                                                   jam, riwayat 24 jam,
                                                                                                   kelengkapan data, dan
                                                                                                   peristiwa.

  `GET`                   `/api/readings?type=&hours=&start=&end=&bucket=&limit=&offset=&order=`   Mengambil data. `type`:
                                                                                                   `2m_raw`,
                                                                                                   `2m_validated`, atau
                                                                                                   `1h_valid`; `bucket`:
                                                                                                   rata-rata per N menit.

  `GET`                   `/api/stats?type=&hours=`                                                Statistik minimum,
                                                                                                   rata-rata, maksimum,
                                                                                                   jumlah data, dan jumlah
                                                                                                   nilai kosong.

  `GET`                   `/api/hourly?days=`                                                      Rata-rata jam dari
                                                                                                   perangkat dan hasil
                                                                                                   hitung ulang.

  `GET`                   `/api/logs?level=&event=&q=&hours=&limit=&offset=`                       Mengambil log kejadian.

  `GET`                   `/api/export.csv?type=&hours=`                                           Mengunduh data dalam
                                                                                                   format CSV.
  ------------------------------------------------------------------------------------------------------------------------

## Variabel Lingkungan

Variabel untuk backend:

  -----------------------------------------------------------------------
  Variabel                Default                 Keterangan
  ----------------------- ----------------------- -----------------------
  `AQ_DB`                 `aq.db`                 Lokasi file SQLite pada
                                                  mode lokal.

  `TURSO_DATABASE_URL`    Kosong                  Jika diisi, backend
                                                  menggunakan Turso,
                                                  bukan SQLite lokal.

  `TURSO_AUTH_TOKEN`      Kosong                  Token autentikasi
                                                  database Turso.

  `TZ_OFFSET_HOURS`       `7`                     Offset zona waktu
                                                  server (WIB) untuk
                                                  waktu penerimaan dan
                                                  log.

  `OFFLINE_AFTER_S`       `360`                   Durasi tanpa data
                                                  (detik) sebelum
                                                  perangkat dianggap
                                                  offline.

  `LOG_KEEP`              `50000` lokal; `5000`   Jumlah log terbaru yang
                          Turso                   disimpan.
  -----------------------------------------------------------------------

Untuk frontend, gunakan `NEXT_PUBLIC_API_URL` dan, jika diperlukan,
`NEXT_PUBLIC_REFRESH_S`. Nilai `NEXT_PUBLIC_*` dimasukkan saat build
frontend.

## Catatan Teknis

-   **Kategori kualitas udara:** PM2.5 menggunakan breakpoint ISPU
    berdasarkan Permen LHK P.14/2020. ISPU pada dashboard dihitung dari
    nilai PM2.5 terbaru. ISPU resmi menggunakan rata-rata 24 jam,
    sehingga rata-rata 24 jam juga ditampilkan sebagai konteks. Ambang
    CO₂, suhu, dan kelembapan merupakan pedoman umum ruangan, bukan
    standar resmi. Pengaturan tersedia di `backend/aq.py`.
-   **Waktu:** Dashboard menampilkan waktu sesuai nilai yang dikirim
    ESP32 (`created_at_1`), tanpa konversi zona waktu tambahan.
-   **Mode database:** Pada mode lokal, backend memakai SQLite (`aq.db`)
    dan pemantau offline setiap 30 detik. Pada mode Turso, status dan
    kategori terakhir yang dicatat disimpan di tabel database, bukan
    hanya di memori server.
-   **Migrasi database:** Database `aq.db` dari versi sebelumnya
    dimigrasikan otomatis dengan penambahan kolom yang diperlukan.
-   **File rahasia:** Simpan SSID dan password Wi-Fi di `secrets.h`,
    bukan langsung di `Tubes.ino`. File tersebut sebaiknya tetap
    dikecualikan melalui `.gitignore`.
-   **Repository Git:** Jalankan `git init` hanya pada folder utama
    proyek. Hindari repository Git bersarang di dalam `backend/` atau
    `frontend/`, agar file proyek dapat dilacak dari repository utama.
