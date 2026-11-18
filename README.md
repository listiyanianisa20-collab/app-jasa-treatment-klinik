# Lsty Klinik - Sistem Informasi Akuntansi Penjualan Produk dan Jasa Treatment pada Klinik Kecantikan

Lsty Klinik adalah aplikasi demo Sistem Informasi Akuntansi untuk membantu pencatatan penjualan produk dan jasa treatment pada klinik kecantikan. Aplikasi ini mengelola data pelanggan, katalog, transaksi, serta pencatatan dan laporan keuangan. Data utama disimpan menggunakan Supabase (PostgreSQL), sementara server Node.js menyediakan antarmuka untuk penggunaan lokal.

## Identitas Tugas

| Keterangan | Detail |
|---|---|
| Nama | Anisa Listiyani |
| NIM | 12030124120060 |
| Mata Kuliah | Pengkodean dan Pemrograman |
| Kelas | D |
| Dosen Pengampu | Dr. Totok Dewayanto, S.E., M.Si., Akt. |

**Disusun untuk memenuhi Tugas Project UTS Pengkodean dan Pemrograman.**

## Tautan Proyek

- Repository GitHub: [https://github.com/listiyanianisa20-collab/LstyKlinik](https://github.com/listiyanianisa20-collab/LstyKlinik)
- Demo aplikasi: [https://listiyanianisa20-collab.github.io/LstyKlinik/](https://listiyanianisa20-collab.github.io/LstyKlinik/)

## Demo

[Buka demo Lsty Klinik](https://listiyanianisa20-collab.github.io/LstyKlinik/)

Situs demo memakai login admin melalui Supabase Auth. Masuk dengan akun admin yang sudah dibuat pada proyek Supabase.

## Akses Aplikasi

Aplikasi menggunakan Supabase Auth untuk autentikasi admin. Buat akun admin melalui Supabase Dashboard pada menu **Authentication → Users**; aplikasi tidak menyediakan pendaftaran akun.

Kredensial demo untuk diisi sendiri:

- Email: `[EMAIL_ADMIN_DEMO]`
- Password: `[PASSWORD_ADMIN_DEMO]`

Jangan menyimpan password sungguhan ke repository.

## Fitur Utama

- CRUD pelanggan serta katalog produk dan jasa treatment.
- Tampilan kasir dengan katalog Produk dan Jasa Treatment terpisah, keranjang, konfirmasi pesanan, dan pilihan pembayaran Tunai, Transfer, atau Kredit/cicilan.
- Diskon otomatis 15% jika subtotal produk dalam satu transaksi lebih dari Rp 500.000. Diskon hanya berlaku untuk produk dan dicatat pada akun **Diskon Penjualan**.
- Pencocokan foto item otomatis dari slug nama item di `frontend/images/` (JPG, PNG, atau WebP), dengan placeholder jika foto tidak tersedia.
- Booking jasa treatment pada Senin–Sabtu pukul 09.00–20.00, dengan slot per jam (slot terakhir pukul 19.00), maksimal dua booking aktif per slot, dan tanpa DP. Pembayaran diproses melalui transaksi kasir.
- Pengelolaan piutang, jadwal cicilan, dan pencatatan pembayaran cicilan.
- Jurnal umum, Buku Besar, dan Laporan Laba Kotor yang terbentuk otomatis dari transaksi.
- Riwayat dan detail transaksi, nota yang dapat dicetak, laporan penjualan dan pelunasan piutang berdasarkan periode.
- Ekspor laporan ke CSV dan pencetakan laporan melalui dialog cetak browser atau simpan sebagai PDF.

### Kebijakan dan ruang lingkup

- Transaksi yang sudah tercatat bersifat final (tidak dapat diubah atau dibatalkan) untuk menjaga jejak audit.
- Sistem ditujukan untuk operasional kasir. Pencatatan beban operasional dan pembelian stok berada di luar ruang lingkup aplikasi.

## Struktur Folder

```text
.
├── index.html                 # Halaman pengarah ke aplikasi frontend
├── frontend/
│   ├── index.html             # Halaman aplikasi
│   ├── script.js              # Logika aplikasi dan koneksi ke Supabase
│   ├── style.css              # Gaya dan tata letak antarmuka
│   └── images/                # Foto item yang dicocokkan otomatis dari nama item
└── backend/
    ├── app.js                 # Server Node.js untuk menyajikan frontend secara lokal
    ├── data.json              # Data contoh yang disertakan untuk referensi/demo
    └── database.sql           # Skema, view, fungsi, kebijakan authenticated, dan data contoh Supabase
```

## ERD dan Entitas

Database memiliki **5 entitas (tabel)**:

| Entitas | Fungsi |
|---|---|
| `pelanggan` | Menyimpan identitas dan informasi kontak pelanggan klinik. |
| `item` | Menyimpan katalog produk dan jasa treatment beserta harga dan informasi stok produk. |
| `penjualan` | Menyimpan transaksi, pelanggan, tanggal, metode, status pembayaran, subtotal, diskon_persen, diskon_nominal, dan total bersih yang dibayar pelanggan. |
| `detail_penjualan` | Menyimpan item, jumlah, harga satuan, dan subtotal untuk setiap transaksi penjualan. |
| `booking` | Menyimpan jasa dan jadwal treatment, pelanggan, status booking, serta nomor transaksi terkait setelah pembayaran. |

Relasi antartabel:

- `pelanggan` **1 : N** `penjualan`: satu pelanggan dapat memiliki banyak transaksi.
- `penjualan` **1 : N** `detail_penjualan`: satu transaksi dapat memiliki banyak baris detail.
- `item` **1 : N** `detail_penjualan`: satu item dapat muncul di banyak baris detail penjualan.
- `pelanggan` **1 : N** `booking`: satu pelanggan dapat memiliki banyak booking.
- `item` **1 : N** `booking`: satu jasa treatment dapat digunakan di banyak booking.
- `penjualan` **1 : N** `booking`: satu transaksi dapat terkait dengan booking yang telah dibayar.

Pada tabel `penjualan`, `subtotal` menyimpan nilai kotor transaksi, `diskon_persen` dan `diskon_nominal` menyimpan diskon produk, sedangkan `total` menyimpan jumlah bersih yang dibayar pelanggan. Jadwal dan pembayaran cicilan disimpan pada kolom `jadwal_cicilan` (JSONB) dan tenor pada kolom `tenor`. Jurnal umum, laporan, dan piutang disajikan lewat *view* database, bukan tabel tambahan.

## Teknologi

- HTML
- CSS
- JavaScript
- Node.js
- Supabase (PostgreSQL)

## Cara Menjalankan

### a. Melalui GitHub Pages

Buka [halaman demo Lsty Klinik](https://listiyanianisa20-collab.github.io/LstyKlinik/) dan masuk menggunakan email serta password akun admin Supabase Auth.

### b. Menjalankan secara lokal

Pastikan Node.js sudah terpasang. Dari folder utama proyek, jalankan:

```bash
node backend/app.js
```

Kemudian buka [http://localhost:3000](http://localhost:3000) di browser dan masuk menggunakan akun admin Supabase Auth. Server lokal ini menyajikan frontend; agar data aplikasi dapat digunakan, siapkan database dan koneksi Supabase seperti pada langkah berikut.

### c. Menyiapkan database Supabase

1. Buka **SQL Editor** pada proyek Supabase, lalu jalankan isi file `backend/database.sql`.
2. Pastikan `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di bagian atas `frontend/script.js` menggunakan URL proyek dan *publishable key* Supabase yang sesuai.
3. Buat akun admin di Supabase Dashboard melalui **Authentication → Users**; aplikasi tidak menyediakan pendaftaran akun. Masuk dengan email dan password akun tersebut.

Jangan mencantumkan kunci Supabase di README atau membagikan kunci rahasia.

## Catatan Keamanan

Aplikasi menggunakan *publishable key* di browser dan token Supabase Auth untuk mengakses REST API. RLS dan grant database membatasi akses data ke role `authenticated`; jangan menambahkan kebijakan untuk `anon` atau menaruh *secret key* di frontend. Buat akun admin secara terkontrol dan nonaktifkan pendaftaran publik di konfigurasi Supabase Auth.
