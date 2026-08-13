/**
 * Tableau AI Insight Extension - Frontend Application Logic
 * Integrates Tableau Extensions SDK, Auto-Refresh on Filter Changed, Font Customization, and AI API Proxy.
 */

// Application State
const state = {
  dashboard: null,
  activeWorksheet: null,
  availableWorksheets: [],
  unregisterFilterListener: null,
  debounceTimer: null,
  debounceDelayMs: 900,
  isLoading: false,
  fontSize: 14,
  fontFamily: "'Inter', sans-serif",
  lastInsightText: '',
  isTableauEnvironment: false
};

// DOM Element References
const elements = {
  worksheetSelect: document.getElementById('worksheetSelect'),
  fontFamilySelect: document.getElementById('fontFamilySelect'),
  fontSizeDisplay: document.getElementById('fontSizeDisplay'),
  btnFontDec: document.getElementById('btnFontDec'),
  btnFontInc: document.getElementById('btnFontInc'),
  btnRefresh: document.getElementById('btnRefresh'),
  btnCopy: document.getElementById('btnCopy'),
  btnRetry: document.getElementById('btnRetry'),
  refreshIcon: document.getElementById('refreshIcon'),
  statusDot: document.getElementById('statusDot'),
  loadingView: document.getElementById('loadingView'),
  insightView: document.getElementById('insightView'),
  errorView: document.getElementById('errorView'),
  errorMessage: document.getElementById('errorMessage'),
  metaDataPoints: document.getElementById('metaDataPoints'),
  metaTimestamp: document.getElementById('metaTimestamp'),
  modelInfoBadge: document.getElementById('modelInfoBadge')
};

// Initialize Application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initTypographySettings();
  setupEventListeners();
  initTableauExtension();
});

/**
 * 1. Setup User Typography Preferences (Font Family & Font Size)
 */
function initTypographySettings() {
  const savedFont = localStorage.getItem('tableau_ai_font_family');
  const savedSize = localStorage.getItem('tableau_ai_font_size');

  if (savedFont) {
    state.fontFamily = savedFont;
    elements.fontFamilySelect.value = savedFont;
  }
  if (savedSize) {
    state.fontSize = parseInt(savedSize, 10) || 14;
  }

  applyTypography();
}

function applyTypography() {
  document.documentElement.style.setProperty('--user-font-family', state.fontFamily);
  document.documentElement.style.setProperty('--user-font-size', `${state.fontSize}px`);
  elements.fontSizeDisplay.textContent = `${state.fontSize}px`;

  localStorage.setItem('tableau_ai_font_family', state.fontFamily);
  localStorage.setItem('tableau_ai_font_size', state.fontSize.toString());
}

/**
 * 2. Setup UI Event Listeners
 */
function setupEventListeners() {
  // Font Family Selector
  elements.fontFamilySelect.addEventListener('change', (e) => {
    state.fontFamily = e.target.value;
    applyTypography();
  });

  // Font Size Steppers
  elements.btnFontDec.addEventListener('click', () => {
    if (state.fontSize > 11) {
      state.fontSize -= 1;
      applyTypography();
    }
  });

  elements.btnFontInc.addEventListener('click', () => {
    if (state.fontSize < 24) {
      state.fontSize += 1;
      applyTypography();
    }
  });

  // Manual Refresh Button
  elements.btnRefresh.addEventListener('click', () => {
    if (!state.isLoading) {
      triggerDataExtractionAndAnalysis();
    }
  });

  // Copy Insight Button
  elements.btnCopy.addEventListener('click', async () => {
    if (!state.lastInsightText) return;
    try {
      await navigator.clipboard.writeText(state.lastInsightText);
      const originalText = elements.btnCopy.innerHTML;
      elements.btnCopy.innerHTML = `<span style="color:#10b981; font-size:11px;">Tersalin ✓</span>`;
      setTimeout(() => {
        elements.btnCopy.innerHTML = originalText;
      }, 1800);
    } catch (err) {
      console.warn('Clipboard copy failed:', err);
    }
  });

  // Retry Button on Error
  elements.btnRetry.addEventListener('click', () => {
    triggerDataExtractionAndAnalysis();
  });

  // Worksheet Selection Change
  elements.worksheetSelect.addEventListener('change', (e) => {
    const selectedSheetName = e.target.value;
    const targetSheet = state.availableWorksheets.find(ws => ws.name === selectedSheetName);
    if (targetSheet) {
      setActiveWorksheet(targetSheet);
    }
  });
}

/**
 * 3. Initialize Tableau Extensions SDK
 */
function initTableauExtension() {
  if (typeof tableau !== 'undefined' && tableau.extensions) {
    tableau.extensions.initializeAsync().then(() => {
      state.isTableauEnvironment = true;
      state.dashboard = tableau.extensions.dashboardContent.dashboard;
      state.availableWorksheets = state.dashboard.worksheets;

      populateWorksheetDropdown();

      // Default to first worksheet or "Chart Tren" if exists
      const preferredSheet = state.availableWorksheets.find(ws => ws.name.toLowerCase().includes('tren')) 
        || state.availableWorksheets[0];

      if (preferredSheet) {
        setActiveWorksheet(preferredSheet);
      } else {
        showError('Tidak ditemukan worksheet aktif di dashboard Tableau ini.');
      }
    }).catch((err) => {
      console.warn('Tableau extension initialization error:', err);
      setupBrowserPreviewMode();
    });
  } else {
    setupBrowserPreviewMode();
  }
}

/**
 * Fallback Browser Preview Mode (When tested outside Tableau Desktop)
 */
function setupBrowserPreviewMode() {
  state.isTableauEnvironment = false;
  elements.worksheetSelect.innerHTML = `<option value="demo">Demo Worksheet (Browser Mode)</option>`;
  elements.modelInfoBadge.innerHTML = `<span style="color:#f59e0b">Preview Mode</span>`;
  elements.metaDataPoints.textContent = 'Mock Dataset';
  elements.metaTimestamp.textContent = 'Ready';
  
  // Show welcome guidance
  renderInsightMarkdown(`### Selamat Datang di Tableau AI Insight Extension 🚀

Extension ini siap membaca data visual dari **Tableau Dashboard** secara otomatis saat filter diubah.

- **Status**: Berjalan dalam mode browser preview.
- **Vercel API Endpoint**: \`/api/generate-insight\`
- **Fitur**: Auto-refresh filter listener, Zero-redundancy narrative, & Font Customizer.

*Klik tombol **Refresh (⟳)** di atas untuk menguji panggilan AI dengan sampel data simulasi.*`);
}

/**
 * 4. Populate Worksheet Dropdown
 */
function populateWorksheetDropdown() {
  elements.worksheetSelect.innerHTML = '';
  state.availableWorksheets.forEach(ws => {
    const option = document.createElement('option');
    option.value = ws.name;
    option.textContent = ws.name;
    elements.worksheetSelect.appendChild(option);
  });
}

/**
 * 5. Set Active Worksheet & Attach Filter Listeners
 */
function setActiveWorksheet(worksheet) {
  state.activeWorksheet = worksheet;
  elements.worksheetSelect.value = worksheet.name;

  // Unregister previous filter listener if exists
  if (state.unregisterFilterListener) {
    state.unregisterFilterListener();
    state.unregisterFilterListener = null;
  }

  // Register Filter & Selection Event Listeners with Debounce
  if (worksheet.addEventListener) {
    state.unregisterFilterListener = worksheet.addEventListener(
      tableau.TableauEventType.FilterChanged,
      onTableauFilterChanged
    );

    worksheet.addEventListener(
      tableau.TableauEventType.MarkSelectionChanged,
      onTableauFilterChanged
    );
  }

  // Trigger initial insight analysis
  triggerDataExtractionAndAnalysis();
}

/**
 * 6. Debounced Filter Changed Handler
 */
function onTableauFilterChanged() {
  clearTimeout(state.debounceTimer);
  setLoadingState(true, 'Filter berubah, menunggu input selesai...');

  state.debounceTimer = setTimeout(() => {
    triggerDataExtractionAndAnalysis();
  }, state.debounceDelayMs);
}

/**
 * 7. Extract Data from Worksheet & Call AI API
 */
async function triggerDataExtractionAndAnalysis() {
  if (state.isLoading) return;

  setLoadingState(true);

  try {
    let payload = {};

    if (state.isTableauEnvironment && state.activeWorksheet) {
      // 1. Fetch Summary Data from Tableau Worksheet
      const dataTable = await state.activeWorksheet.getSummaryDataAsync({ maxRows: 300 });
      const filters = await state.activeWorksheet.getFiltersAsync();

      // 2. Format Columns & Rows
      const columns = dataTable.columns.map(col => ({
        fieldName: col.fieldName,
        dataType: col.dataType
      }));

      const rows = dataTable.data.map(row => {
        return row.map(cell => cell.formattedValue || cell.value);
      });

      const appliedFilters = filters.map(f => ({
        fieldName: f.fieldName,
        appliedValues: f.appliedValues?.map(v => v.formattedValue || v.value) || []
      }));

      payload = {
        dashboardName: state.dashboard ? state.dashboard.name : 'Dashboard Tableau',
        worksheetName: state.activeWorksheet.name,
        totalRows: dataTable.totalRowCount || rows.length,
        columns,
        rows,
        appliedFilters
      };

    } else {
      // Browser Mock Payload for Testing
      payload = getDemoPayload();
    }

    // 3. Send to Serverless API Endpoint
    const response = await fetch('/api/generate-insight', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || `Server error: ${response.status}`);
    }

    // 4. Render Narrative Insight Result
    state.lastInsightText = result.insight;
    renderInsightMarkdown(result.insight);

    // 5. Update Metadata Footer
    elements.metaDataPoints.textContent = `${payload.totalRows || payload.rows.length} Data Points`;
    const now = new Date();
    elements.metaTimestamp.textContent = `Update: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    
    if (result.meta?.model) {
      elements.modelInfoBadge.innerHTML = `<span style="color:#10b981">● AI (${result.meta.model})</span>`;
    }

    setLoadingState(false);

  } catch (error) {
    console.error('Error generating insight:', error);
    showError(error.message || 'Gagal menghasilkan insight dari AI.');
  }
}

/**
 * 8. Render Markdown to DOM
 */
function renderInsightMarkdown(markdownText) {
  hideAllViews();
  elements.insightView.classList.remove('hidden');

  if (typeof marked !== 'undefined' && marked.parse) {
    elements.insightView.innerHTML = marked.parse(markdownText);
  } else {
    elements.insightView.textContent = markdownText;
  }
}

/**
 * 9. UI State Management
 */
function setLoadingState(isLoading, customText) {
  state.isLoading = isLoading;

  if (isLoading) {
    elements.statusDot.className = 'status-dot loading';
    elements.refreshIcon.classList.add('spin-anim');
    hideAllViews();
    elements.loadingView.classList.remove('hidden');
    if (customText) {
      const label = elements.loadingView.querySelector('.loading-label span:last-child');
      if (label) label.textContent = customText;
    }
  } else {
    elements.statusDot.className = 'status-dot';
    elements.refreshIcon.classList.remove('spin-anim');
  }
}

function showError(message) {
  state.isLoading = false;
  elements.statusDot.className = 'status-dot error';
  elements.refreshIcon.classList.remove('spin-anim');
  
  hideAllViews();
  elements.errorView.classList.remove('hidden');
  elements.errorMessage.textContent = message;
}

function hideAllViews() {
  elements.loadingView.classList.add('hidden');
  elements.insightView.classList.add('hidden');
  elements.errorView.classList.add('hidden');
}

/**
 * Demo Mock Payload for Testing outside Tableau
 */
function getDemoPayload() {
  return {
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
  };
}
