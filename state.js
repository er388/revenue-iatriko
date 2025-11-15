<artifact identifier="state-js" type="application/vnd.ant.code" language="javascript" title="state.js - Global State Management">
/**
 * state.js - Global State Management
 * Centralized application state και configuration
 */
// ========================================
// Configuration
// ========================================
export const CONFIG = {
pageSize: 20,
chartColors: {
primary: '#2563eb',
success: '#10b981',
warning: '#f59e0b',
danger: '#ef4444',
info: '#3b82f6'
}
};
// ========================================
// Global State
// ========================================
export const STATE = {
entries: [],
sources: ['Ταμείο 1', 'Ταμείο 2'],
insurances: ['ΕΟΠΥΥ', 'Ιδιωτική'],
currentView: 'dashboard',
filters: {},
currentPage: 1,
editingEntry: null,
undoStack: [],
userLabel: 'Admin',
charts: {},
cdnAvailable: true,
currentKPIs: {},
changeCounter: 0
};
// ========================================
// State Helper Functions
// ========================================
/**

Reset state στις default τιμές
*/
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

/**

Get current state (for debugging)
*/
export function getState() {
return STATE;
}

/**

Update state property
@param {string} key - State key
@param {any} value - New value
*/
export function updateState(key, value) {
if (STATE.hasOwnProperty(key)) {
STATE[key] = value;
} else {
console.warn(State key "${key}" does not exist);
}
}

/**

Get state property
@param {string} key - State key
@returns {any}
*/
export function getStateProperty(key) {
return STATE[key];
}

/**

Reset filters
*/
export function resetFilters() {
STATE.filters = {};
STATE.currentPage = 1;
}

/**

Destroy all charts (cleanup)
*/
export function destroyAllCharts() {
Object.values(STATE.charts).forEach(chart => {
if (chart && typeof chart.destroy === 'function') {
chart.destroy();
}
});
STATE.charts = {};
}

/**

Export state για debugging/testing
*/
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

// ========================================
// Exports
// ========================================
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
</artifact>