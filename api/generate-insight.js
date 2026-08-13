import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

/**
 * Serverless Handler for Tableau AI Insight Generation
 * Generates natural, crisp, zero-redundancy executive data narratives.
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
      // Backward compatibility for single sheet payload
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
      : 'Default / Semua filter';

    // 4. Construct Highly Direct, Natural Narrative Prompt
    const systemPrompt = `Anda adalah Analis Data Senior. Tugas Anda adalah menghasilkan narasi teks INSIGHT yang sangat ringkas, padat, alami, dan langsung ke inti data visual Tableau.

ATURAN UTAMA PENULISAN:
1. GAYA BAHASA:
   - Tulis secara langsung, mengalir, lugas, dan profesional dalam Bahasa Indonesia.
   - JANGAN gunakan kalimat pembuka basa-basi seperti "Berikut adalah analisis data...", "Berdasarkan data visual...", atau "Ringkasan Eksekutif".
   - JANGAN membuat header/sub-header formal yang kaku jika bisa dirangkum dalam 1-2 paragraf narasi atau 2-3 poin ringkas.
2. CAKUPAN DATA LENGKAP & TANPA PENGULANGAN (ZERO REDUNDANCY):
   - Sebutkan periode waktu/tahun & batas bulan terkini yang tercatat.
   - Sebutkan angka total/utama saat ini.
   - Sebutkan tren/perbandingan tahun lalu (YoY) jika tersedia datanya.
   - Sebutkan kontributor tertinggi/terendah (misal: jenis moda transportasi, kategori, atau wilayah) beserta proporsi/angkanya jika ada.
   - Setiap angka dan fakta hanya disebutkan TEPAT SATU KALI tanpa pengulangan.
3. FORMATTING:
   - Gunakan format **bold** pada angka kunci, tahun, nama bulan, dan nama entitas penting (contoh: "Tahun **2026** sampai dengan bulan **Juni**, tercatat sebanyak **419.309.753 penumpang**...").`;

    const userPrompt = `DASHBOARD: ${dashboardName}
FILTER AKTIF: ${filterText}

DATA VISUAL TERKINI DARI TABLEAU:
${formattedDataText}

Tuliskan narasi insight ringkas, padat, dan langsung ke fakta utama berdasarkan data di atas:`;

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
      // Default: Google Gemini (gemini-3.5-flash-lite / gemini-2.0-flash)
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
