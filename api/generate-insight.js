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
    
    // Ambil API Key berdasarkan provider untuk menghindari bentrokan
    let apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      if (provider === 'openrouter') {
        apiKey = process.env.OPENROUTER_API_KEY;
      } else if (provider === 'openai') {
        apiKey = process.env.OPENAI_API_KEY;
      } else {
        apiKey = process.env.GEMINI_API_KEY;
      }
    }

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: `API Key untuk provider '${provider}' belum dikonfigurasi di Environment Variables Vercel.`
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
    const systemPrompt = `Anda adalah Analis Data Eksekutif Senior. Tugas Anda adalah menghasilkan narasi insight yang tajam, alami, dan fokus HANYA pada konteks data yang SEDANG AKTIF di Tableau Dashboard.

PANDUAN BAHASA & STRUKTUR INSIGHT (STORYTELLING & SEAMLESS):
1. SATU PARAGRAF UTUH (MANDATORI KETAT):
   - Wajib menyajikan seluruh narasi insight dalam TEPAT 1 PARAGRAF mengalir.
   - DILARANG memecah teks menjadi beberapa paragraf atau menggunakan bullet points/daftar rincian.
2. GAYA BERCERITA ALAMI & KATA HUBUNG DINAMIS:
   - Gunakan alur cerita mengalir yang alami (storytelling) dengan kata hubung yang luwes (contoh: "yang diiringi oleh", "sementara itu", "dengan puncak aktivitas pada bulan", "setelah sebelumnya sempat berada di titik terendah pada").
   - Wajib menyisipkan nama tahun/periode aktif secara natural di awal kalimat pembuka paragraf (contoh: "Total **jumlah penumpang angkutan umum** pada tahun **2025** mencapai...").
3. NAMA METRIK BISNIS ALAMI (ANTI-TEKNIS):
   - Gunakan nama metrik asli yang diambil dari judul dashboard atau nama kolom (contoh: "jumlah penumpang angkutan umum", "penerima bantuan", dsb.).
   - JANGAN gunakan kata-kata khusus seperti "realisasi" untuk menjaga keumuman agar bisa dipakai di dashboard mana pun.
   - DILARANG keras menggunakan istilah teknis database/sistem seperti: "yang terfilter", "pada visual", "tampilan", "baris data", "dataset", "tabel data", "nilai".
   - DILARANG menggunakan tanda baca dash panjang (em-dash/en-dash seperti "—") atau simbol pembatas kaku lainnya untuk menghindari kesan tulisan hasil generate AI.
4. BEBAS BASA-BASI & PENGULANGAN:
   - JANGAN ada kalimat pengantar/pembuka (seperti "Berikut adalah...", "Berdasarkan dashboard...") atau kalimat penutup. Langsung mulai dengan fakta data.
   - Setiap fakta dan angka hanya disebutkan SATU KALI.
   - Gunakan format **bold** HANYA untuk angka kunci, nama kategori/moda/wilayah penting, dan periode/bulan.`;

    const userPrompt = `### KONTEKS FILTER DASHBOARD:
- Dashboard: ${dashboardName}
- Filter Aktif: ${filterText}

### DATA VISUAL DARI WORKSHETS TABLEAU:
${formattedDataText}

Tuliskan narasi insight eksekutif yang fokus pada data terfilter di atas:`;

    // 5. Invoke LLM (OpenRouter, OpenAI, or Gemini)
    let insightResult = '';

    if (provider === 'openrouter') {
      const modelName = process.env.AI_MODEL || 'google/gemini-2.5-flash';
      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://tableau-ai.vercel.app',
          'X-Title': 'Tableau AI Insight'
        }
      });

      const completion = await openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2
      });

      insightResult = completion.choices[0]?.message?.content || '';
    } else if (provider === 'openai') {
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
      // Default: Google Gemini (Native API)
      const modelName = process.env.AI_MODEL || 'gemini-2.5-flash';
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
        model: process.env.AI_MODEL || (provider === 'openrouter' ? 'google/gemini-2.5-flash' : provider === 'openai' ? 'gpt-4o-mini' : 'gemini-3.5-flash-lite'),
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
