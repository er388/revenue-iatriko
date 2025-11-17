/**
 * state.js - Global State Management
 */

export const CONFIG = {
    pageSize: 20,
    defaultPageSize: 20,
    chartColors: {
        primary: '#2563eb',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#3b82f6'
    }
};

export const STATE = {
    entries: [],
    sources: ['Ταμείο 1', 'Ταμείο 2'],
    insurances: ['ΕΟΠΥΥ', 'Ιδιωτική'],
    currentView: 'dashboard',
    filters: {},
    currentPage: 1,
    pageSize: 20,
    sortField: null,
    sortDirection: 'asc',
    editingEntry: null,
    undoStack: [],
    userLabel: 'Admin',
    charts: {},
    cdnAvailable: true,
    currentKPIs: {},
    changeCounter: 0
    autosaveThreshold: 5
};

export function resetState() {
    STATE.entries = [];
    STATE.sources = ['Ταμείο 1', 'Ταμείο 2'];
    STATE.insurances = ['ΕΟΠΥΥ', 'Ιδιωτική'];
    STATE.currentView = 'dashboard';
    STATE.filters = {};
    STATE.currentPage = 1;
    STATE.editingEntry = null;
    STATE.undoStack = [];
    STATE.userLabel = 'Admin';
    STATE.charts = {};
    STATE.cdnAvailable = true;
    STATE.currentKPIs = {};
    STATE.changeCounter = 0;
}

export function getState() {
    return STATE;
}

export function updateState(key, value) {
    if (STATE.hasOwnProperty(key)) {
        STATE[key] = value;
    } else {
        console.warn("State key does not exist: " + key);
    }
}

export function getStateProperty(key) {
    return STATE[key];
}

export function resetFilters() {
    STATE.filters = {};
    STATE.currentPage = 1;
}

export function destroyAllCharts() {
    Object.values(STATE.charts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
    });
    STATE.charts = {};
}

export function exportStateSnapshot() {
    return {
        timestamp: Date.now(),
        entriesCount: STATE.entries.length,
        sourcesCount: STATE.sources.length,
        insurancesCount: STATE.insurances.length,
        currentView: STATE.currentView,
        filtersActive: Object.keys(STATE.filters).length > 0,
        currentPage: STATE.currentPage,
        cdnAvailable: STATE.cdnAvailable,
        changeCounter: STATE.changeCounter
    };
}

export default {
    CONFIG,
    STATE,
    resetState,
    getState,
    updateState,
    getStateProperty,
    resetFilters,
    destroyAllCharts,
    exportStateSnapshot
};