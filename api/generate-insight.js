import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

/**
 * Serverless Handler for Tableau AI Insight Generation
 * Supports Gemini & OpenAI with comprehensive zero-redundancy prompt engineering.
 */
export default async function handler(req, res) {
  // 1. Handle CORS Preflight Request
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed. Please send a POST request with Tableau data.'
    });
  }

  try {
    const {
      worksheetName = 'Active Worksheet',
      dashboardName = 'Dashboard',
      appliedFilters = [],
      columns = [],
      rows = [],
      totalRows = 0
    } = req.body || {};

    if (!rows || rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Data visual kosong atau tidak ada data yang terpilih dari worksheet Tableau.'
      });
    }

    // 2. Read Environment Variables
    const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase().trim();
    const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'AI_API_KEY belum dikonfigurasi pada Environment Variables Vercel/Server.'
      });
    }

    // 3. Build Compressed Representation of the Tableau Data (Optimized for Tokens)
    const formattedDataText = buildDataRepresentation(columns, rows);
    const filterContext = appliedFilters.length > 0
      ? appliedFilters.map(f => `${f.fieldName}: ${f.appliedValues?.join(', ') || 'All'}`).join(' | ')
      : 'Semua filter aktif / Default';

    // 4. Construct Strict System & User Prompt
    const systemPrompt = `Anda adalah Analis Data Senior dan Konsultan Eksekutif BI.
Tugas Anda adalah menganalisis data visual terstruktur dari Tableau Dashboard berikut dan menyusun narasi insight eksekutif yang tajam, komprehensif, dan bebas pengulangan.

PANDUAN ANALISIS KETAT:
1. CAKUPAN MENYELURUH (FULL COVERAGE):
   - Wajib menganalisis dan mencakup seluruh variabel, dimensi, dan metrik yang ada dalam data (nilai metrik utama, dimensi waktu, spasial/wilayah, kategori/jenis, dan variabel relevan lainnya).
   - Jangan mengabaikan dimensi atau data point yang ada.
2. BEBAS PENGULANGAN (ZERO REDUNDANCY):
   - Jangan mengulang angka, persentase, atau kesimpulan yang sama di kalimat berbeda.
   - Setiap angka atau fakta hanya disebutkan satu kali dalam konteks analisis yang paling tepat.
3. STRUKTUR NARASI EKSEKUTIF:
   - Nilai Realisasi Saat Ini: Sebutkan angka metrik utama saat ini sesuai filter yang aktif secara akurat.
   - Perbandingan Temporal (YoY / Periode Lalu): Tunjukkan tren pertumbuhan atau penurunan jika data memuat variabel waktu/tahun.
   - Perbandingan Wilayah / Spasial: Identifikasi variasi antar wilayah (wilayah tertinggi, terendah, kesenjangan) jika data memuat variabel geografis.
   - Perbandingan Jenis / Kategori: Tunjukkan komposisi, kontributor terbesar/terkecil jika data memuat dimensi klasifikasi.
   - Catatan Pola / Anomali: Sorot pola penting atau temuan tak terduga yang terlihat dari keseluruhan data.
4. GAYA PENULISAN:
   - Gunakan format teks Markdown yang rapi (gunakan bolding untuk angka/istilah kunci dan bullet points yang elegan).
   - Lugas, langsung ke inti data, objektif, tanpa kalimat basa-basi pembuka atau penutup bertele-tele.
   - Bahasa: Bahasa Indonesia profesional.`;

    const userPrompt = `### KONTEKS TABLEAU:
- Dashboard: ${dashboardName}
- Worksheet Target: ${worksheetName}
- Filter yang Diterapkan: ${filterContext}
- Total Data Point: ${totalRows} baris

### DATA TABULAR TABLEAU:
${formattedDataText}

Silakan susun narasi insight eksekutif yang mencakup seluruh data di atas secara utuh dan tanpa pengulangan sesuai panduan.`;

    // 5. Invoke LLM based on configured provider
    let insightResult = '';

    if (provider === 'openai') {
      const modelName = process.env.AI_MODEL || 'gpt-4o-mini';
      const openai = new OpenAI({ apiKey });

      const completion = await openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2
      });

      insightResult = completion.choices[0]?.message?.content || '';
    } else {
      // Default: Google Gemini
      const modelName = process.env.AI_MODEL || 'gemini-3.5-flash-lite';
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt
      });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.2
        }
      });

      const response = await result.response;
      insightResult = response.text();
    }

    return res.status(200).json({
      success: true,
      insight: insightResult,
      meta: {
        provider,
        model: process.env.AI_MODEL || (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-3.5-flash-lite'),
        worksheetName,
        dataPointsCount: totalRows,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error generating insight:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Terjadi kesalahan saat memproses data ke AI.',
      detail: error.toString()
    });
  }
}

/**
 * Converts columns array and rows array into a compact, token-efficient Markdown table.
 */
function buildDataRepresentation(columns, rows) {
  if (!columns || columns.length === 0 || !rows || rows.length === 0) {
    return 'Tidak ada data.';
  }

  // Limit max rows to 300 to avoid token limits while keeping full context
  const maxRows = Math.min(rows.length, 300);
  const headers = columns.map(c => (typeof c === 'string' ? c : c.fieldName || c.name || 'Column'));

  let table = `| ${headers.join(' | ')} |\n`;
  table += `| ${headers.map(() => '---').join(' | ')} |\n`;

  for (let i = 0; i < maxRows; i++) {
    const row = rows[i];
    const rowValues = Array.isArray(row)
      ? row.map(val => (val !== null && val !== undefined ? String(val).replace(/\|/g, '/') : '-'))
      : headers.map(h => (row[h] !== null && row[h] !== undefined ? String(row[h]).replace(/\|/g, '/') : '-'));

    table += `| ${rowValues.join(' | ')} |\n`;
  }

  if (rows.length > maxRows) {
    table += `\n*(Menampilkan ${maxRows} dari ${rows.length} total baris data yang teragregasi)*\n`;
  }

  return table;
}
