/**
 * Tableau AI Insight Extension - Pure Text Mode
 * Seamlessly integrates with Tableau Dashboard to display dynamic AI insight text.
 */

// Application State
const state = {
  dashboard: null,
  availableWorksheets: [],
  filterUnregisterHandlers: [],
  debounceTimer: null,
  debounceDelayMs: 500,
  activeAbortController: null,
  isTableauEnvironment: false
};

// DOM Elements
const elements = {
  loadingView: document.getElementById('loadingView'),
  insightView: document.getElementById('insightView'),
  errorView: document.getElementById('errorView'),
  errorMessage: document.getElementById('errorMessage')
};

// Initialize Application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initTableauExtension();
});

/**
 * 1. Initialize Tableau Extensions SDK
 */
function initTableauExtension() {
  if (typeof tableau !== 'undefined' && tableau.extensions && tableau.extensions.initializeAsync) {
    tableau.extensions.initializeAsync().then(() => {
      state.isTableauEnvironment = true;
      state.dashboard = tableau.extensions.dashboardContent.dashboard;
      state.availableWorksheets = state.dashboard.worksheets || [];

      console.log('Connected to Tableau Dashboard:', state.dashboard.name);
      attachAllEventListeners();
      
      // Initial Insight Generation
      triggerDataExtractionAndAnalysis();

    }).catch((err) => {
      console.error('Tableau initializeAsync error:', err);
      setupBrowserPreviewMode();
    });
  } else {
    setupBrowserPreviewMode();
  }
}

/**
 * Fallback Browser Preview Mode (When tested in browser outside Tableau)
 */
function setupBrowserPreviewMode() {
  state.isTableauEnvironment = false;
  renderInsightMarkdown(`*Menunggu data Tableau... (Buka extension ini di dalam Tableau Dashboard untuk melihat insight dinamis saat filter diubah).*`);
}

/**
 * 2. Attach Filter & Parameter Listeners Across All Worksheets
 */
function attachAllEventListeners() {
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
 * 3. Debounced Filter/Parameter Changed Handler
 */
function onTableauFilterChanged() {
  clearTimeout(state.debounceTimer);
  setLoadingState(true, 'Filter diperbarui...');

  state.debounceTimer = setTimeout(() => {
    triggerDataExtractionAndAnalysis();
  }, state.debounceDelayMs);
}

/**
 * 4. Extract Data from Worksheet(s) & Call AI API
 */
async function triggerDataExtractionAndAnalysis() {
  // Abort any ongoing fetch request
  if (state.activeAbortController) {
    state.activeAbortController.abort();
  }
  state.activeAbortController = new AbortController();
  const currentSignal = state.activeAbortController.signal;

  setLoadingState(true);

  try {
    let payload = {};

    if (state.isTableauEnvironment && state.dashboard) {
      const combinedSheetsData = [];
      let totalDataRows = 0;
      const allAppliedFilters = [];

      for (const ws of state.availableWorksheets) {
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
        targetMode: '__ALL__',
        totalRows: totalDataRows,
        appliedFilters: allAppliedFilters,
        sheetsData: combinedSheetsData
      };

    } else {
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

    // Render Clean Text
    renderInsightMarkdown(result.insight);
    setLoadingState(false);

  } catch (error) {
    if (error.name === 'AbortError') {
      return;
    }
    console.error('Error generating insight:', error);
    showError(error.message || 'Gagal memuat insight.');
  }
}

/**
 * 5. Render Markdown to DOM
 */
function renderInsightMarkdown(markdownText) {
  hideAllViews();
  elements.insightView.classList.remove('hidden');

  if (typeof marked !== 'undefined' && marked.parse) {
    elements.insightView.innerHTML = marked.parse(markdownText);
  } else {
    const html = markdownText
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '<p></p>')
      .replace(/\n/g, '<br>');
    elements.insightView.innerHTML = html;
  }
}

/**
 * 6. UI State Management
 */
function setLoadingState(isLoading) {
  if (isLoading) {
    hideAllViews();
    elements.loadingView.classList.remove('hidden');
  }
}

function showError(message) {
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
      }
    ]
  };
}
