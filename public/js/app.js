/**
 * Tableau AI Insight Extension - Frontend Application Logic
 * Integrates Official Tableau Extensions SDK, Multi/Single Worksheet Data Extraction,
 * Auto-Refresh on Filter/Parameter Changed, Font Customization, and AI Proxy.
 */

// Application State
const state = {
  dashboard: null,
  activeWorksheetName: '__ALL__', // '__ALL__' or specific worksheet name
  availableWorksheets: [],
  filterUnregisterHandlers: [],
  debounceTimer: null,
  debounceDelayMs: 600,
  activeAbortController: null,
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
    triggerDataExtractionAndAnalysis();
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
    state.activeWorksheetName = e.target.value;
    triggerDataExtractionAndAnalysis();
  });
}

/**
 * 3. Initialize Tableau Extensions SDK
 */
function initTableauExtension() {
  if (typeof tableau !== 'undefined' && tableau.extensions && tableau.extensions.initializeAsync) {
    console.log('Calling tableau.extensions.initializeAsync()...');
    
    tableau.extensions.initializeAsync().then(() => {
      state.isTableauEnvironment = true;
      state.dashboard = tableau.extensions.dashboardContent.dashboard;
      state.availableWorksheets = state.dashboard.worksheets || [];

      console.log('Connected to Tableau Dashboard:', state.dashboard.name);
      console.log('Available Worksheets:', state.availableWorksheets.map(w => w.name));

      populateWorksheetDropdown();
      attachAllEventListeners();
      
      // Trigger initial analysis with real Tableau data
      triggerDataExtractionAndAnalysis();

    }).catch((err) => {
      console.error('Tableau initializeAsync error:', err);
      elements.modelInfoBadge.innerHTML = `<span style="color:#ef4444">Tableau Init Error</span>`;
      setupBrowserPreviewMode();
    });
  } else {
    console.warn('Tableau API object not found, falling back to preview mode.');
    setupBrowserPreviewMode();
  }
}

/**
 * Fallback Browser Preview Mode (When tested in browser outside Tableau)
 */
function setupBrowserPreviewMode() {
  state.isTableauEnvironment = false;
  elements.worksheetSelect.innerHTML = `<option value="__ALL__">Preview Mode (Browser)</option>`;
  elements.modelInfoBadge.innerHTML = `<span style="color:#f59e0b">Preview Mode</span>`;
  elements.metaDataPoints.textContent = 'Demo Mode';
  elements.metaTimestamp.textContent = 'Ready';
  
  renderInsightMarkdown(`### Selamat Datang di Tableau AI Insight Extension 🚀

Extension sedang berjalan dalam **Preview Mode** di browser biasa.

- Di dalam **Tableau Dashboard**, extension ini akan otomatis terhubung ke seluruh visual worksheet Anda (*Total Penumpang*, *Tren Bulanan*, *Jenis Moda*, dll.) dan membaca filter secara dinamis.
- Klik tombol **Refresh (⟳)** untuk menguji panggilan AI dengan sampel data simulasi.`);
}

/**
 * 4. Populate Worksheet Dropdown
 */
function populateWorksheetDropdown() {
  elements.worksheetSelect.innerHTML = '';

  // Option 1: All Worksheets Combined (Recommended default)
  const allOption = document.createElement('option');
  allOption.value = '__ALL__';
  allOption.textContent = '📊 Semua Visual (Gabungan)';
  elements.worksheetSelect.appendChild(allOption);

  // Option 2...N: Individual Worksheets
  state.availableWorksheets.forEach(ws => {
    const option = document.createElement('option');
    option.value = ws.name;
    option.textContent = ws.name;
    elements.worksheetSelect.appendChild(option);
  });

  state.activeWorksheetName = '__ALL__';
}

/**
 * 5. Attach Filter & Parameter Listeners Across All Worksheets
 */
function attachAllEventListeners() {
  // Clear any existing handlers
  state.filterUnregisterHandlers.forEach(unregister => {
    try { unregister(); } catch (e) {}
  });
  state.filterUnregisterHandlers = [];

  // Listen to Filter & Selection changes on ALL worksheets
  state.availableWorksheets.forEach(ws => {
    try {
      const unregFilter = ws.addEventListener(
        tableau.TableauEventType.FilterChanged,
        onTableauFilterChanged
      );
      state.filterUnregisterHandlers.push(unregFilter);

      const unregSelection = ws.addEventListener(
        tableau.TableauEventType.MarkSelectionChanged,
        onTableauFilterChanged
      );
      state.filterUnregisterHandlers.push(unregSelection);
    } catch (e) {
      console.warn('Failed to attach listener on worksheet:', ws.name, e);
    }
  });

  // Listen to Parameter changes on the Dashboard (if any)
  if (state.dashboard && state.dashboard.getParametersAsync) {
    state.dashboard.getParametersAsync().then(params => {
      params.forEach(param => {
        try {
          const unregParam = param.addEventListener(
            tableau.TableauEventType.ParameterChanged,
            onTableauFilterChanged
          );
          state.filterUnregisterHandlers.push(unregParam);
        } catch (e) {}
      });
    }).catch(() => {});
  }
}

/**
 * 6. Debounced Filter/Parameter Changed Handler
 */
function onTableauFilterChanged() {
  clearTimeout(state.debounceTimer);
  setLoadingState(true, 'Filter berubah, memperbarui insight...');

  state.debounceTimer = setTimeout(() => {
    triggerDataExtractionAndAnalysis();
  }, state.debounceDelayMs);
}

/**
 * 7. Extract Data from Worksheet(s) & Call AI API
 */
async function triggerDataExtractionAndAnalysis() {
  // Abort any ongoing fetch request
  if (state.activeAbortController) {
    state.activeAbortController.abort();
  }
  state.activeAbortController = new AbortController();
  const currentSignal = state.activeAbortController.signal;

  setLoadingState(true, 'Mengambil data Tableau & memproses AI...');

  try {
    let payload = {};

    if (state.isTableauEnvironment && state.dashboard) {
      const sheetsToRead = state.activeWorksheetName === '__ALL__'
        ? state.availableWorksheets
        : state.availableWorksheets.filter(ws => ws.name === state.activeWorksheetName);

      const combinedSheetsData = [];
      let totalDataRows = 0;
      const allAppliedFilters = [];

      for (const ws of sheetsToRead) {
        try {
          const summaryData = await ws.getSummaryDataAsync({ maxRows: 100 });
          const wsFilters = await ws.getFiltersAsync();

          const columns = summaryData.columns.map(c => c.fieldName);
          const rows = summaryData.data.map(r => {
            return r.map(cell => (cell.formattedValue !== undefined && cell.formattedValue !== null) ? cell.formattedValue : cell.value);
          });

          totalDataRows += rows.length;

          wsFilters.forEach(f => {
            if (f.appliedValues && f.appliedValues.length > 0) {
              const filterValues = f.appliedValues.map(v => v.formattedValue || v.value);
              allAppliedFilters.push({
                worksheet: ws.name,
                fieldName: f.fieldName,
                appliedValues: filterValues
              });
            }
          });

          combinedSheetsData.push({
            worksheetName: ws.name,
            columns: columns,
            rows: rows
          });
        } catch (err) {
          console.warn(`Could not read data from worksheet ${ws.name}:`, err);
        }
      }

      payload = {
        dashboardName: state.dashboard.name || 'Dashboard Tableau',
        targetMode: state.activeWorksheetName,
        totalRows: totalDataRows,
        appliedFilters: allAppliedFilters,
        sheetsData: combinedSheetsData
      };

    } else {
      // Browser Mock Payload for Testing
      payload = getDemoPayload();
    }

    // Send POST to Serverless API Endpoint
    const response = await fetch('/api/generate-insight', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: currentSignal
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || `Server error: ${response.status}`);
    }

    // Render Narrative Insight Result
    state.lastInsightText = result.insight;
    renderInsightMarkdown(result.insight);

    // Update Metadata Footer
    elements.metaDataPoints.textContent = `${payload.totalRows || 0} Data Points`;
    const now = new Date();
    elements.metaTimestamp.textContent = `Update: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    
    if (state.isTableauEnvironment) {
      elements.modelInfoBadge.innerHTML = `<span style="color:#10b981">● Live Tableau (${result.meta?.model || 'AI'})</span>`;
    } else if (result.meta?.model) {
      elements.modelInfoBadge.innerHTML = `<span style="color:#10b981">● AI (${result.meta.model})</span>`;
    }

    setLoadingState(false);

  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Previous insight request aborted for new filter.');
      return;
    }
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
    // Basic fallback formatter
    const html = markdownText
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '<p></p>')
      .replace(/\n/g, '<br>');
    elements.insightView.innerHTML = html;
  }
}

/**
 * 9. UI State Management
 */
function setLoadingState(isLoading, customText) {
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
    dashboardName: 'Jumlah Penumpang Angkutan Umum yang Terlayani',
    targetMode: '__ALL__',
    totalRows: 12,
    appliedFilters: [
      { fieldName: 'Tahun', appliedValues: ['2024'] }
    ],
    sheetsData: [
      {
        worksheetName: 'total_penumpang',
        columns: ['Tahun', 'Total Penumpang', 'YoY Growth'],
        rows: [
          ['2024', '760.761.793', '+22.53%']
        ]
      },
      {
        worksheetName: 'Jumlah Penumpang Berdasarkan Bulan',
        columns: ['Bulan', 'Jumlah Penumpang'],
        rows: [
          ['Januari', '62.286.524'],
          ['Februari', '57.080.098'],
          ['Maret', '59.884.688'],
          ['April', '55.902.441'],
          ['Mei', '63.550.890'],
          ['Juni', '62.566.823'],
          ['Juli', '69.677.569'],
          ['Agustus', '66.486.098'],
          ['September', '64.824.228'],
          ['Oktober', '70.766.388'],
          ['November', '64.441.218'],
          ['Desember', '63.294.638']
        ]
      },
      {
        worksheetName: 'Jumlah Penumpang Berdasarkan Jenis Moda',
        columns: ['Jenis Moda', 'Jumlah Penumpang'],
        rows: [
          ['Transjakarta', '382.073.717'],
          ['KRL', '325.243.803'],
          ['MRT', '40.010.400'],
          ['Bus Sekolah', '8.808.034'],
          ['KCI Commuter Bandara', '2.225.159'],
          ['LRT', '1.212.984'],
          ['Kapal', '1.187.696']
        ]
      }
    ]
  };
}
