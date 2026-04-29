# WarungPOS

WarungPOS adalah aplikasi POS multi-role berbasis Node.js, Express, MySQL, EJS, dan Tailwind CSS. Project ini memakai pola MVC dan mencakup alur operasional utama dari login role, katalog produk, checkout konsumen, approval kasir, pembayaran, sampai dashboard manager dan export laporan.

## Fitur

- Login multi-role: `manager`, `operator`, `kasir`, `konsumen`
- Dashboard manager dengan KPI real-time, chart penjualan, monitor kasir, filter periode, export CSV, dan export PDF
- Dashboard operator untuk CRUD produk, update stock, kategori, dan gambar produk
- Katalog konsumen dengan search, filter kategori, session cart, checkout, waiting approval, dan receipt
- Dashboard kasir untuk approve, reject, detail transaksi, pembayaran manual, dan SmartBank dummy API
- Security middleware: `helmet`, `express-rate-limit`, sanitasi input, session timeout
- Error pages modern: `403`, `404`, `500`
- Partial layout reusable: `header`, `sidebar`, `footer`
- Toast notification, loading button, confirm delete, dan responsive dashboard layout

## Teknologi

- Node.js
- Express
- MySQL
- EJS
- Tailwind CSS via CDN
- `bcrypt`
- `helmet`
- `express-rate-limit`
- `express-validator`
- `csv-writer`
- `pdfkit`

## Instalasi

1. Clone atau buka project ini di mesin lokal.
2. Install dependency:

```bash
npm install
```

3. Siapkan file `.env`:

```env
DB_HOST=localhost
DB_USER=root
DB_PASS=root
DB_NAME=warungpos
PORT=3000
```

4. Pastikan database MySQL aktif dan tabel utama tersedia:

- `users`
- `products`
- `transactions`
- `transaction_items`

## Menjalankan Project

Mode development:

```bash
npm run dev
```

Mode production/local run:

```bash
npm start
```

Default app akan berjalan di:

```txt
http://localhost:3000
```

## Akun Role Demo

Project ini mengasumsikan data user demo sudah ada di tabel `users` dan password disimpan dalam hash `bcrypt`.

Contoh role:

- Manager: akses `/manager`
- Operator: akses `/operator`
- Kasir: akses `/kasir`
- Konsumen: akses `/konsumen`

Contoh struktur data `users`:

```txt
id | nama        | email              | password_hash | role
1  | Manager     | manager@test.com   | bcrypt hash   | manager
2  | Operator    | operator@test.com  | bcrypt hash   | operator
3  | Kasir       | kasir@test.com     | bcrypt hash   | kasir
4  | Konsumen    | konsumen@test.com  | bcrypt hash   | konsumen
```

## Struktur Folder

```txt
warungpos/
├── app.js
├── config/
│   └── db.js
├── controllers/
│   ├── authController.js
│   ├── errorController.js
│   ├── kasirController.js
│   ├── konsumenController.js
│   ├── managerController.js
│   └── operatorController.js
├── middleware/
│   ├── auth.js
│   └── sanitize.js
├── models/
│   ├── productModel.js
│   ├── transactionModel.js
│   └── userModel.js
├── routes/
│   ├── authRoutes.js
│   ├── kasirRoutes.js
│   ├── konsumenRoutes.js
│   ├── managerRoutes.js
│   └── operatorRoutes.js
├── views/
│   ├── auth/
│   ├── errors/
│   ├── kasir/
│   ├── konsumen/
│   ├── manager/
│   ├── operator/
│   └── partials/
└── public/
```

## Route Utama

- `GET /login`
- `GET /manager`
- `GET /manager/export/csv`
- `GET /manager/export/pdf`
- `GET /operator`
- `GET /konsumen`
- `GET /konsumen/waiting/:invoice`
- `GET /kasir`
- `POST /pos/pembayaran`

## Catatan Schema

Project ini mengasumsikan tabel `transactions` memiliki kolom tambahan berikut:

- `cashier_id`
- `payment_method`
- `created_at`

Project ini juga mengasumsikan tabel `products` memiliki kolom:

- `nama_produk`
- `harga`
- `stock`
- `kategori`
- `gambar`

## SmartBank Dummy API

Route:

```txt
POST /pos/pembayaran
```

Payload minimal:

```json
{
  "transaction_id": 12
}
```

Response akan mengembalikan `payment_request_id` dan status dummy `success` atau `failed`. Jika sukses, transaksi diubah menjadi `paid` dan stock produk akan dikurangi.
