import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

/**
 * Serverless Handler for Tableau AI Insight Generation
 * Strictly focuses on currently filtered year/period with zero redundancy.
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

    // 4. Construct Highly Targeted System & User Prompt
    const systemPrompt = `Anda adalah Analis Data Eksekutif. Tugas Anda adalah menulis narasi insight yang fokus HANYA pada tahun/periode yang SEDANG DIPILIH pada filter Tableau.

PANDUAN KETAT:
1. FOKUS HANYA PADA TAHUN / FILTER AKTIF:
   - Jika filter menunjukkan tahun tertentu (contoh: Tahun 2024 atau 2026), ceritakan HANYA data dan kinerja untuk tahun tersebut.
   - JANGAN menjabarkan atau menganalisis tahun-tahun lain yang tidak dipilih, KECUALI menyebutkan satu angka perbandingan pertumbuhan YoY dengan tahun sebelumnya (misal: "naik 22,53% dari tahun lalu").
2. STRUKTUR NARASI RINGKAS (1-2 Paragraf Padat):
   - Sebutkan Tahun & batas bulan data (misal: "Tahun **2024** penuh" atau "Tahun **2026** hingga bulan **Juni**").
   - Sebutkan Total Angka / Metrik Utama pada tahun tersebut dan perbandingan pertumbuhannya (YoY) jika ada.
   - Sebutkan tren bulanan (bulan dengan volume tertinggi/puncak dan terendah beserta angkanya).
   - Sebutkan kontributor moda transportasi terbanyak/dominan (misal: Transjakarta, KRL, dsb.) beserta angkanya.
3. TANPA BASA-BASI & BEBAS PENGULANGAN (ZERO REDUNDANCY):
   - JANGAN ada kalimat pengantar seperti "Berikut analisis...", "Berdasarkan data...", dsb. Langsung ke fakta data!
   - Setiap angka dan nama entitas hanya disebutkan TEPAT SATU KALI.
   - Gunakan format **bold** untuk angka kunci, nama bulan, tahun, dan moda transportasi.`;

    const userPrompt = `### KONTEKS FILTER DASHBOARD:
- Dashboard: ${dashboardName}
- Filter Aktif: ${filterText}

### DATA VISUAL DARI WORKSHETS TABLEAU:
${formattedDataText}

Tuliskan narasi insight yang fokus HANYA pada periode/tahun filter aktif di atas:`;

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
