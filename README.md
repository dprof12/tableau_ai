# Tableau AI Insight Extension (Vercel Ready) 🚀

Solusi **Tableau Dashboard Extension** modern yang memanfaatkan kecerdasan buatan (Google Gemini / OpenAI) untuk membaca data visual dari Tableau secara dinamis, melakukan *auto-refresh* saat filter dashboard berubah, dan menampilkan narasi insight eksekutif yang komprehensif tanpa pengulangan (*zero redundancy*).

---

## 🌟 Fitur Utama

- **Real-Time Dynamic Auto-Refresh**: Terhubung langsung dengan event listener Tableau (`FilterChanged` & `MarkSelectionChanged`) dengan *debounce* otomatis (900ms) untuk menghemat kuota token.
- **Analisis Komprehensif & Zero Redundancy**: Prompt khusus yang mengekstrak nilai realisasi saat ini, tren temporal (YoY/MoM jika ada), variasi spasial/wilayah (jika ada), dan perbandingan kategori/jenis (jika ada) tanpa mengulang fakta atau angka yang sama.
- **Kustomisasi Font di UI**: Pengguna dashboard dapat memilih jenis font (*Inter*, *Jakarta Sans*, *Segoe UI*, *Roboto*, *Open Sans*, *Arial*) dan mengatur ukuran font (*12px s/d 24px*) secara langsung dari UI extension. Pengaturan tersimpan di *local storage*.
- **Vercel Serverless Ready**: Backend berbentuk Serverless Function (`api/generate-insight.js`) yang otomatis HTTPS, hemat biaya, dan tidak membutuhkan server Express yang terus aktif.
- **Multi-LLM Support**: Mendukung Google Gemini (default: `gemini-2.0-flash` / `gemini-1.5-flash`) dan OpenAI (`gpt-4o-mini` / `gpt-4o`).

---

## 📁 Struktur Direktori

```
tableau-ai/
├── api/
│   └── generate-insight.js       # Vercel Serverless API Handler (Gemini / OpenAI Proxy)
├── public/
│   ├── ui.html                   # Halaman Antarmuka Extension di Dashboard Tableau
│   ├── css/
│   │   └── style.css             # Styling CSS Modern & Responsif (CSS Variables)
│   └── js/
│       └── app.js                # Logika Tableau Extension SDK, Auto-refresh & Font controller
├── manifest/
│   └── tableau-ai-insight.trex   # File Manifest XML untuk didaftarkan ke Tableau
├── test/
│   └── test-payload.js           # Script pengujian API mandiri
├── .env.example                  # Template konfigurasi environment variables
├── package.json                  # Konfigurasi dependensi Node.js
├── vercel.json                   # Konfigurasi CORS & routing Vercel
└── README.md                     # Dokumentasi panduan
```

---

## 🚀 Langkah Deploy ke Vercel

### Langkah 1: Push Project ke Git Repository
Upload folder `tableau-ai` ini ke GitHub / GitLab / Bitbucket Anda.

### Langkah 2: Import Project di Vercel
1. Buka [vercel.com](https://vercel.com) dan login ke akun Anda.
2. Klik **Add New...** > **Project**.
3. Pilih repository Git project ini.
4. Pada bagian **Root Directory**, pastikan mengarah ke folder `tableau-ai` (jika disimpan di subfolder).

### Langkah 3: Konfigurasi Environment Variables di Vercel
Di dashboard Vercel pada menu **Settings** > **Environment Variables**, tambahkan:

| Variable Key | Contoh Nilai | Keterangan |
|---|---|---|
| `AI_PROVIDER` | `gemini` *(atau `openai`)* | Provider LLM yang digunakan |
| `AI_API_KEY` | `AIzaSy...` *(atau `sk-...`)* | API Key resmi dari Google AI Studio atau OpenAI |
| `AI_MODEL` | `gemini-3.5-flash-lite` | Nama model (opsional) |

### Langkah 4: Klik Deploy
Setelah proses build selesai, Anda akan mendapatkan URL HTTPS Vercel, misalnya:
`https://tableau-ai-insight.vercel.app`

---

## 📊 Langkah Import Extension ke Tableau

### Langkah 1: Sesuaikan URL Manifest (.trex)
Buka file `manifest/tableau-ai-insight.trex` dengan text editor, lalu ganti URL target dengan domain Vercel Anda:
```xml
<source-location>
  <url>https://tableau-ai-insight.vercel.app/ui.html</url>
</source-location>
```
*Simpan file tersebut.*

### Langkah 2: Masukkan ke Tableau Dashboard
1. Buka dashboard Anda di **Tableau Desktop**.
2. Pada panel **Objects** di sebelah kiri bawah, tarik objek **Extension** ke area dashboard yang diinginkan.
3. Pada jendela popup yang muncul, pilih **Access Local Extensions** (atau *My Extensions*).
4. Pilih file `manifest/tableau-ai-insight.trex`.
5. Klik **OK** pada dialog perizinan data Tableau.
6. Extension akan memuat tampilan, membaca data dari worksheet, dan siap menghasilkan insight otomatis setiap kali filter digeser!

---

## 🛠️ Pengujian Lokal (Development)

Jika Anda ingin menjalankan atau menguji secara lokal:

1. Salin template `.env.example` menjadi `.env`:
   ```bash
   cp .env.example .env
   ```
2. Isi `AI_API_KEY` dengan API Key Anda di `.env`.
3. Jalankan pengujian script payload mock:
   ```bash
   node test/test-payload.js
   ```
4. Atau jalankan Vercel Dev:
   ```bash
   npx vercel dev
   ```
   Buka `http://localhost:3000/ui.html` di browser untuk melihat preview interface.
