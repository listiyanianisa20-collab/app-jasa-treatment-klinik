# Lsty Klinik - Sistem Informasi Akuntansi Penjualan Produk dan Jasa Treatment pada Klinik Kecantikan

## Identitas Tugas

| Keterangan | Detail |
|---|---|
| Nama | Anisa Listiyani |
| NIM | 12030124120060 |
| Mata Kuliah | Pengkodean dan Pemrograman |
| Kelas | D |
| Dosen Pengampu | Aulizza Abdul Fanni, S.Ak., M.Sc. |

## Tautan Proyek

- Repository GitHub: [https://github.com/listiyanianisa20-collab/app-jasa-treatment-klinik](https://github.com/listiyanianisa20-collab/app-jasa-treatment-klinik)
- Demo aplikasi: [https://listiyanianisa20-collab.github.io/app-jasa-treatment-klinik/](https://listiyanianisa20-collab.github.io/app-jasa-treatment-klinik/)

## 1. Deskripsi Singkat

Lsty Klinik adalah sistem kasir untuk mencatat penjualan produk dan jasa treatment klinik kecantikan, mengelola booking dan piutang, serta menghasilkan pencatatan keuangan secara otomatis.

## 2. Fitur Utama

- Kasir dengan katalog produk dan jasa treatment serta keranjang belanja.
- Diskon produk otomatis sesuai aturan transaksi.
- Pencocokan foto item secara otomatis dari nama item dan gambar di `frontend/images/`.
- Booking jasa treatment.
- Piutang dan jadwal pembayaran cicilan.
- Jurnal umum dan buku besar per akun, termasuk saldo awal.
- Laporan laba kotor.
- Nota transaksi yang dapat dicetak.
- Ekspor laporan ke CSV dan fitur print.

## 3. Alur Akuntansi

Jurnal penjualan mencatat nilai kotor pendapatan; diskon dicatat terpisah sebagai kontra-pendapatan. Contoh jurnal:

| Peristiwa | Debit | Kredit |
|---|---|---|
| Penjualan tunai | Kas | Pendapatan Penjualan Produk dan/atau Pendapatan Jasa Treatment |
| Penjualan transfer | Bank | Pendapatan Penjualan Produk dan/atau Pendapatan Jasa Treatment |
| Penjualan kredit | Piutang Usaha | Pendapatan Penjualan Produk dan/atau Pendapatan Jasa Treatment |
| Pelunasan cicilan | Kas atau Bank | Piutang Usaha |
| Diskon penjualan | Diskon Penjualan | Pendapatan sebesar nilai kotor (jurnal pendapatan tetap mencatat nilai kotor) |
| HPP produk | Beban Pokok Penjualan | Persediaan Produk |

Pelunasan cicilan mengurangi Piutang Usaha dan **bukan pendapatan baru**. Diskon hanya berlaku untuk produk dan dicatat terpisah dari pendapatan kotor.

**Penjualan Bersih = Pendapatan Kotor - Diskon**

**Laba Kotor = Penjualan Bersih - Beban Pokok Penjualan**

HPP disimpan sebagai snapshot pada setiap detail transaksi. Karena itu, perubahan harga pokok item tidak mengubah laporan transaksi lama. Nominal cicilan dibulatkan ke rupiah, dan sisa pembulatan ditempatkan pada cicilan terakhir.

## 4. Aturan Bisnis

- Diskon 15% hanya berlaku bila subtotal produk **lebih dari Rp 500.000 per transaksi**.
- Booking tersedia Senin–Sabtu pukul 09.00–20.00 dengan slot per jam; slot terakhir dimulai pukul 19.00. Maksimal dua booking aktif per slot dan booking tidak memerlukan DP.
- Tanggal transaksi tidak boleh melewati hari ini.
- Transaksi penjualan bersifat final: tidak tersedia edit, pembatalan, atau refund.
- Database menjaga finalitas transaksi. Hak tulis langsung pada `penjualan`, `detail_penjualan`, dan `booking` dicabut; transaksi dibuat atau diproses melalui fungsi database yang disediakan.

## 5. Batasan Sistem

- Pencatatan pembelian stok dan beban operasional tidak tersedia di luar fungsi kasir.
- Persediaan Produk dapat bernilai negatif di Buku Besar karena sistem hanya mencatat pengurangan persediaan akibat penjualan; saldo awal dan pembelian stok tidak dicatat.
- Laporan keuangan berhenti pada Laba Kotor dan belum mencakup beban operasional maupun laba bersih.

## 6. Struktur Folder dan ERD

Struktur berikut mengikuti berkas yang ada di repository:

```text
.
├── .gitignore
├── index.html
├── README.md
├── backend/
│   ├── app.js
│   ├── data.json
│   └── database.sql
└── frontend/
    ├── index.html
    ├── script.js
    ├── style.css
    ├── welcome-hero.png
    └── images/
        ├── acne-spot-gel.jpg
        ├── body-lotion-brightening.jpg
        ├── body-spa-scrub.jpg
        ├── facial-acne-care.jpg
        ├── facial-glow.jpg
        ├── facial-wash-gentle.jpg
        ├── hair-spa.jpg
        ├── laser-rejuvenation.jpg
        ├── lash-lift.jpg
        ├── lip-balm-spf-15.jpg
        ├── micellar-water.jpg
        ├── night-cream-renewal.jpg
        ├── peeling-treatment.jpg
        ├── serum-brightening.jpg
        ├── sheet-mask.jpg
        ├── sunscreen-spf-50.jpg
        └── toner.jpg
```

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

## 7. Teknologi dan Cara Menjalankan

Teknologi yang digunakan: HTML, CSS, JavaScript, Node.js, dan Supabase (PostgreSQL).

### GitHub Pages

Buka [demo Lsty Klinik](https://listiyanianisa20-collab.github.io/app-jasa-treatment-klinik/). GitHub Pages menerbitkan repository `app-jasa-treatment-klinik`; halaman root `index.html` mengarahkan browser ke aplikasi pada `frontend/index.html`.

### Lokal

Pastikan Node.js telah terpasang, lalu jalankan dari folder utama proyek:

```bash
node backend/app.js
```

Buka [http://localhost:3000](http://localhost:3000) di browser.

### Menyiapkan Supabase

1. Jalankan isi `backend/database.sql` melalui **SQL Editor** pada proyek Supabase.
2. Isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di bagian atas `frontend/script.js` dengan URL proyek dan *publishable key*.
3. Buat akun admin melalui **Authentication > Users**, lalu masuk menggunakan akun tersebut.

## 8. Akses Demo

Akun demo untuk dosen diberikan terpisah melalui laporan/pesan.

## 9. Catatan Keamanan

- Frontend hanya menggunakan *publishable key* Supabase.
- RLS dan grant membatasi akses database untuk role `authenticated`.
- Pendaftaran user publik dimatikan; buat akun admin secara terkontrol melalui Supabase Authentication.
- *Secret key* tidak pernah disimpan di repository.
