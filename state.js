/**
 * state.js - Global State Management
 * Central control for all application state
 * Version: 2.0 (Clean Rewrite)
 */

// ========================================
// Configuration Constants (Immutable)
// ========================================
export const CONFIG = Object.freeze({
    // Pagination
    pageSize: 25,  // ✅ CHANGED: Default 25 instead of 20
    pageSizeOptions: [25, 50, 75, 100, 150],  // ✅ NEW: User selectable options
    
    // Autosave
    autosaveInterval: 5, // Changes before autosave
    autosaveIntervalOptions: [1, 3, 5, 10, 20],
    
    // Chart colors
    chartColors: {
        primary: '#2563eb',
        primaryDark: '#1e40af',
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6',
        secondary: '#64748b'
    },
    
    // Date validation
    minYear: 2000,
    maxYear: 2100,
    
    // Storage
    dbName: 'RevenueDB',
    dbVersion: 2,
    undoTTL: 30 * 60 * 1000, // 30 minutes
    maxUndoActions: 50,
    
    // UI
    toastDuration: 3000, // ms
    debounceDelay: 300, // ms
    
    // Filters
    filterDateFormat: 'MM/YYYY'
});

// ========================================
// Global State (Mutable)
// ========================================
export const STATE = {
    // Data
    entries: [],
    sources: ['Διαγνωστικό 1', 'Διαγνωστικό 2'],
    insurances: ['ΕΟΠΥΥ', 'Ιδιωτική'],
    
    // UI State
    currentView: 'dashboard',
    currentPage: 1,
    pageSize: CONFIG.pageSize, // ✅ Uses CONFIG default (25)
    
    // Filters
    filters: {
        dateFrom: '',
        dateTo: '',
        source: '',
        insurance: '',
        type: '',
        originalAmountFrom: '',
        originalAmountTo: '',
        finalAmountFrom: '',
        finalAmountTo: '',
        deductionPercentFrom: '',
        deductionPercentTo: ''
    },
    
    // Session State
    editingEntry: null,
    userLabel: 'Admin',
    selectedEntries: [], // For bulk operations

    // Sorting State
    sortColumn: null, // Current sort column
    sortDirection: 'asc', // 'asc' | 'desc'
    
    // Dashboard State
    dashboardPeriod: 'all', // 'all' | 'month' | 'year'
    includeParakratisi: false, // ✅ DEFAULT: false (χωρίς παρακράτηση)
    
    // System State
    cdnAvailable: true,
    currentKPIs: {},
    charts: {},
    changeCounter: 0,
    lastSaveTimestamp: null,
    
    // Undo/Redo
    undoStack: [],
    redoStack: [],
    
    // Loading States
    isLoading: false,
    isSaving: false,
    
    // Error State
    lastError: null
};

// ========================================
// State Manipulation Functions
// ========================================

/**
 * Update a specific state property
 * @param {string} key - State key
 * @param {any} value - New value
 * @returns {boolean} Success
 */
export function updateState(key, value) {
    if (!STATE.hasOwnProperty(key)) {
        console.warn(`[State] Key "${key}" does not exist in STATE`);
        return false;
    }
    
    STATE[key] = value;
    return true;
}

/**
 * Batch update multiple state properties
 * @param {Object} updates - Key-value pairs to update
 * @returns {number} Number of successful updates
 */
export function batchUpdateState(updates) {
    let successCount = 0;
    
    for (const [key, value] of Object.entries(updates)) {
        if (updateState(key, value)) {
            successCount++;
        }
    }
    
    return successCount;
}

/**
 * Reset state to initial values
 * @param {boolean} keepUserData - Preserve entries/sources/insurances
 */
export function resetState(keepUserData = false) {
    if (keepUserData) {
        // Reset only UI state
        STATE.currentView = 'dashboard';
        STATE.currentPage = 1;
        STATE.pageSize = CONFIG.pageSize;
        STATE.filters = {};
        STATE.editingEntry = null;
        STATE.selectedEntries = [];
        STATE.dashboardPeriod = 'all';
        STATE.includeParakratisi = false;
    } else {
        // Full reset
        STATE.entries = [];
        STATE.sources = ['Διαγνωστικό 1', 'Διαγνωστικό 2'];
        STATE.insurances = ['ΕΟΠΥΥ', 'Ιδιωτική'];
        STATE.currentView = 'dashboard';
        STATE.currentPage = 1;
        STATE.pageSize = CONFIG.pageSize;
        STATE.filters = {};
        STATE.editingEntry = null;
        STATE.selectedEntries = [];
        STATE.userLabel = 'Admin';
        STATE.dashboardPeriod = 'all';
        STATE.includeParakratisi = false;
        STATE.currentKPIs = {};
        STATE.changeCounter = 0;
        STATE.lastSaveTimestamp = null;
        STATE.undoStack = [];
        STATE.redoStack = [];
        STATE.isLoading = false;
        STATE.isSaving = false;
        STATE.lastError = null;
    }
    
    // Always reset charts
    destroyAllCharts();
}

/**
 * Reset filters to default
 */
export function resetFilters() {
    STATE.filters = {
        dateFrom: '',
        dateTo: '',
        source: '',
        insurance: '',
        type: '',
        originalAmountFrom: '',
        originalAmountTo: '',
        finalAmountFrom: '',
        finalAmountTo: '',
        deductionPercentFrom: '',
        deductionPercentTo: ''
    };
    STATE.currentPage = 1;
}

/**
 * Get a snapshot of current state for debugging/logging
 * @returns {Object} State snapshot
 */
export function getStateSnapshot() {
    return {
        timestamp: Date.now(),
        view: STATE.currentView,
        entriesCount: STATE.entries.length,
        sourcesCount: STATE.sources.length,
        insurancesCount: STATE.insurances.length,
        currentPage: STATE.currentPage,
        pageSize: STATE.pageSize,
        filtersActive: Object.keys(STATE.filters).filter(k => STATE.filters[k]).length,
        cdnAvailable: STATE.cdnAvailable,
        changeCounter: STATE.changeCounter,
        chartsActive: Object.keys(STATE.charts).length,
        includeParakratisi: STATE.includeParakratisi,
        dashboardPeriod: STATE.dashboardPeriod
    };
}

/**
 * Destroy all Chart.js instances
 */
export function destroyAllCharts() {
    Object.values(STATE.charts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            try {
                chart.destroy();
            } catch (error) {
                console.warn('[State] Error destroying chart:', error);
            }
        }
    });
    
    STATE.charts = {};
}

/**
 * Increment change counter (for autosave)
 */
export function incrementChangeCounter() {
    STATE.changeCounter++;
}

/**
 * Reset change counter (after autosave)
 */
export function resetChangeCounter() {
    STATE.changeCounter = 0;
    STATE.lastSaveTimestamp = Date.now();
}

/**
 * Add entry to undo stack
 * @param {Object} action - Undo action
 */
export function pushUndoAction(action) {
    STATE.undoStack.push({
        ...action,
        timestamp: Date.now()
    });
    
    // Limit stack size
    if (STATE.undoStack.length > CONFIG.maxUndoActions) {
        STATE.undoStack.shift();
    }
    
    // Clear redo stack on new action
    STATE.redoStack = [];
}

/**
 * Get latest undo action
 * @returns {Object|null}
 */
export function popUndoAction() {
    const action = STATE.undoStack.pop();
    if (action) {
        STATE.redoStack.push(action);
    }
    return action || null;
}

/**
 * Get latest redo action
 * @returns {Object|null}
 */
export function popRedoAction() {
    const action = STATE.redoStack.pop();
    if (action) {
        STATE.undoStack.push(action);
    }
    return action || null;
}

/**
 * Check if undo is available
 * @returns {boolean}
 */
export function canUndo() {
    return STATE.undoStack.length > 0;
}

/**
 * Check if redo is available
 * @returns {boolean}
 */
export function canRedo() {
    return STATE.redoStack.length > 0;
}

// ========================================
// Export Default
// ========================================
export default {
    CONFIG,
    STATE,
    updateState,
    batchUpdateState,
    resetState,
    resetFilters,
    getStateSnapshot,
    destroyAllCharts,
    incrementChangeCounter,
    resetChangeCounter,
    pushUndoAction,
    popUndoAction,
    popRedoAction,
    canUndo,
    canRedo
};
