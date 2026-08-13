import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

/**
 * Serverless Handler for Tableau AI Insight Generation
 * Strictly focuses on currently filtered year/period with zero redundancy.
 * Universal support for all Tableau dashboard domains & filters.
 * [Git Push Test Update]
 */
export default async function handler(req, res) {
  // 1. CORS Headers
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
      error: 'Method Not Allowed. Please send a POST request.'
    });
  }

  try {
    const {
      dashboardName = 'Dashboard Tableau',
      targetMode = '__ALL__',
      totalRows = 0,
      appliedFilters = [],
      sheetsData = [],
      worksheetName,
      columns,
      rows
    } = req.body || {};

    // 2. Read Environment Variables
    const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase().trim();
    const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'AI_API_KEY belum dikonfigurasi di Environment Variables Vercel.'
      });
    }

    // 3. Format Data Representation from Single or Multi-Worksheets
    let formattedDataText = '';
    
    if (sheetsData && sheetsData.length > 0) {
      formattedDataText = sheetsData.map(sheet => {
        return `#### Visual Worksheet: ${sheet.worksheetName}\n` + buildTable(sheet.columns, sheet.rows);
      }).join('\n\n');
    } else if (columns && rows) {
      formattedDataText = `#### Visual Worksheet: ${worksheetName || 'Active'}\n` + buildTable(columns, rows);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Tidak ada data visual yang diterima dari Tableau.'
      });
    }

    const filterText = appliedFilters.length > 0
      ? appliedFilters.map(f => `${f.fieldName}: ${f.appliedValues?.join(', ') || 'Semua'}`).join(' | ')
      : 'Semua Filter Aktif';

    // 4. Construct Universal, Adaptive & Context-Aware Prompt
    const systemPrompt = `Anda adalah Analis Data Eksekutif Senior. Tugas Anda adalah menghasilkan narasi insight yang tajam, ringkas, dan fokus HANYA pada konteks filter/kondisi data yang SEDANG AKTIF di Tableau Dashboard.

PANDUAN UNIVERSAL (DAPAT DITERAPKAN DI SEMUA JENIS DASHBOARD):
1. FOKUS PADA KONTEKS FILTER AKTIF:
   - Identifikasi semua filter yang sedang aktif (baik itu Dimensi Waktu/Tahun/Bulan, Wilayah/Geografis, Kategori/Jenis Layanan, Status, dsb.).
   - Ceritakan data, pencapaian, dan metrik yang sesuai dengan irisan filter yang sedang aktif tersebut.
   - Jangan membahas data di luar filter yang dipilih, kecuali untuk memberikan konteks perbandingan yang relevan (misal: persentase pertumbuhan dibanding periode lalu, atau perbandingan terhadap rata-rata).
2. STRUKTUR NARASI ADAPTIF (1-2 Paragraf Padat & Mengalir):
   - Nilai / Metrik Utama: Sebutkan angka total/realisasi utama saat ini sesuai filter yang aktif.
   - Distribusi / Breakdown: Sebutkan proporsi atau kontributor terbesar & terkecil (misal: jenis kategori, wilayah, atau moda) beserta angkanya.
   - Dinamika Tren / Perbandingan: Sebutkan tren (bulan/waktu puncak vs terendah, atau perbandingan YoY/MoM) jika terdapat variabel waktu.
3. PRINSIP PENULISAN:
   - Lugas, profesional, langsung ke fakta data, TANPA kalimat pembuka/pengantar basa-basi (tanpa "Berikut analisis...", "Berdasarkan data...", dsb.).
   - BEBAS PENGULANGAN (ZERO REDUNDANCY): Setiap fakta dan angka hanya disebutkan SATU KALI.
   - Gunakan format **bold** untuk angka kunci, nama kategori/moda/wilayah, dan periode.`;

    const userPrompt = `### KONTEKS FILTER DASHBOARD:
- Dashboard: ${dashboardName}
- Filter Aktif: ${filterText}

### DATA VISUAL DARI WORKSHETS TABLEAU:
${formattedDataText}

Tuliskan narasi insight eksekutif yang fokus pada data terfilter di atas:`;

    // 5. Invoke LLM (Gemini or OpenAI)
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
      insight: insightResult.trim(),
      meta: {
        provider,
        model: process.env.AI_MODEL || (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-3.5-flash-lite'),
        dataPointsCount: totalRows,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error in generate-insight handler:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Terjadi kesalahan pada backend proxy AI.'
    });
  }
}

/**
 * Builds compact Markdown Table from columns and rows
 */
function buildTable(columns, rows) {
  if (!columns || columns.length === 0 || !rows || rows.length === 0) {
    return '*(Tidak ada data)*';
  }

  const headers = columns.map(c => (typeof c === 'string' ? c : c.fieldName || c.name || 'Kolom'));
  let table = `| ${headers.join(' | ')} |\n`;
  table += `| ${headers.map(() => '---').join(' | ')} |\n`;

  const maxRows = Math.min(rows.length, 100);
  for (let i = 0; i < maxRows; i++) {
    const row = rows[i];
    const rowValues = Array.isArray(row)
      ? row.map(val => (val !== null && val !== undefined ? String(val).replace(/\|/g, '/') : '-'))
      : headers.map(h => (row[h] !== null && row[h] !== undefined ? String(row[h]).replace(/\|/g, '/') : '-'));

    table += `| ${rowValues.join(' | ')} |\n`;
  }

  return table;
}
