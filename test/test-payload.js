/**
 * Test script to verify API handler and Prompt Construction locally
 */
import handler from '../api/generate-insight.js';
import dotenv from 'dotenv';
dotenv.config();

async function runMockTest() {
  console.log('--- Testing Tableau AI Insight Logic ---');

  const mockReq = {
    method: 'POST',
    body: {
      dashboardName: 'Executive Performance Dashboard',
      worksheetName: 'Tren & Distribusi Wilayah',
      totalRows: 6,
      columns: [
        { fieldName: 'Tahun', dataType: 'string' },
        { fieldName: 'Wilayah', dataType: 'string' },
        { fieldName: 'Kategori', dataType: 'string' },
        { fieldName: 'Nilai Realisasi (Juta)', dataType: 'float' },
        { fieldName: 'Target (Juta)', dataType: 'float' }
      ],
      rows: [
        ['2026', 'Jakarta Pusat', 'Layanan Publik', '4,850', '4,500'],
        ['2026', 'Jakarta Selatan', 'Layanan Publik', '5,320', '5,000'],
        ['2026', 'Jakarta Timur', 'Infrastruktur', '3,920', '4,100'],
        ['2025', 'Jakarta Pusat', 'Layanan Publik', '4,200', '4,000'],
        ['2025', 'Jakarta Selatan', 'Layanan Publik', '4,800', '4,600'],
        ['2025', 'Jakarta Timur', 'Infrastruktur', '3,650', '3,800']
      ],
      appliedFilters: [
        { fieldName: 'Status', appliedValues: ['Aktif'] },
        { fieldName: 'Tahun', appliedValues: ['2025', '2026'] }
      ]
    }
  };

  let statusCode = 200;
  const headers = {};

  const mockRes = {
    setHeader: (k, v) => { headers[k] = v; },
    status: (code) => {
      statusCode = code;
      return {
        json: (data) => {
          console.log(`[Response Status]: ${statusCode}`);
          console.log('[Response Data]:', JSON.stringify(data, null, 2));
        },
        end: () => console.log(`[Response End]: ${statusCode}`)
      };
    }
  };

  await handler(mockReq, mockRes);
}

runMockTest().catch(console.error);
