/**
 * filters.js - Filtering Module
 * Handles all filtering logic for entries table
 * Version: 2.0 (Clean Implementation)
 */

import { STATE } from './state.js';
import eopyyDeductionsManager from './eopyyClawback.js';
import { compareDates } from './utils.js';

// ========================================
// Main Filter Function
// ========================================

/**
 * Apply all active filters to entries
 * @returns {Array} Filtered entries
 */
export function applyFilters() {
    let filtered = [...STATE.entries];

    // Date filters
    if (STATE.filters.dateFrom) {
        filtered = filtered.filter(e => compareDates(e.date, STATE.filters.dateFrom) >= 0);
    }
    if (STATE.filters.dateTo) {
        filtered = filtered.filter(e => compareDates(e.date, STATE.filters.dateTo) <= 0);
    }

    // Source filter
    if (STATE.filters.source) {
        filtered = filtered.filter(e => e.source === STATE.filters.source);
    }

    // Insurance filter
    if (STATE.filters.insurance) {
        filtered = filtered.filter(e => e.insurance === STATE.filters.insurance);
    }

    // Type filter
    if (STATE.filters.type) {
        filtered = filtered.filter(e => e.type === STATE.filters.type);
    }

    // Original Amount filters
    if (STATE.filters.originalAmountFrom) {
        filtered = filtered.filter(e => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return amounts.originalAmount >= parseFloat(STATE.filters.originalAmountFrom);
        });
    }
    if (STATE.filters.originalAmountTo) {
        filtered = filtered.filter(e => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return amounts.originalAmount <= parseFloat(STATE.filters.originalAmountTo);
        });
    }

    // Final Amount filters
    if (STATE.filters.finalAmountFrom) {
        filtered = filtered.filter(e => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return amounts.finalAmount >= parseFloat(STATE.filters.finalAmountFrom);
        });
    }
    if (STATE.filters.finalAmountTo) {
        filtered = filtered.filter(e => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return amounts.finalAmount <= parseFloat(STATE.filters.finalAmountTo);
        });
    }

    // Deduction percentage filters
    if (STATE.filters.deductionPercentFrom) {
        filtered = filtered.filter(e => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            const percent = amounts.originalAmount > 0 
                ? (amounts.totalDeductions / amounts.originalAmount) * 100 
                : 0;
            return percent >= parseFloat(STATE.filters.deductionPercentFrom);
        });
    }
    if (STATE.filters.deductionPercentTo) {
        filtered = filtered.filter(e => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            const percent = amounts.originalAmount > 0 
                ? (amounts.totalDeductions / amounts.originalAmount) * 100 
                : 0;
            return percent <= parseFloat(STATE.filters.deductionPercentTo);
        });
    }

    // Sort by date (newest first) by default
    filtered.sort((a, b) => compareDates(b.date, a.date));

    return filtered;
}

// ========================================
// Filter Helpers
// ========================================

/**
 * Set filters and reset to page 1
 * @param {Object} filters - Filter values
 */
export function setFilters(filters) {
    STATE.filters = { ...filters };
    STATE.currentPage = 1;
}

/**
 * Clear all filters
 */
export function clearFilters() {
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
 * Get count of active filters
 * @returns {number} Number of active filters
 */
export function getActiveFiltersCount() {
    return Object.keys(STATE.filters).filter(key => STATE.filters[key]).length;
}

/**
 * Check if any filters are active
 * @returns {boolean} True if filters active
 */
export function hasActiveFilters() {
    return getActiveFiltersCount() > 0;
}

/**
 * Get human-readable summary of active filters
 * @returns {string} Filter summary
 */
export function getFiltersSummary() {
    const active = [];
    
    if (STATE.filters.dateFrom) active.push(`Από: ${STATE.filters.dateFrom}`);
    if (STATE.filters.dateTo) active.push(`Έως: ${STATE.filters.dateTo}`);
    if (STATE.filters.source) active.push(`Πηγή: ${STATE.filters.source}`);
    if (STATE.filters.insurance) active.push(`Ασφάλεια: ${STATE.filters.insurance}`);
    if (STATE.filters.type) active.push(`Τύπος: ${STATE.filters.type === 'cash' ? 'Μετρητά' : 'Τιμολόγια'}`);
    
    return active.join(' • ') || 'Χωρίς φίλτρα';
}

// ========================================
// Preset Filters
// ========================================

export const FILTER_PRESETS = {
    thisMonth: () => {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const date = `${month}/${year}`;
        return { dateFrom: date, dateTo: date };
    },
    
    thisYear: () => {
        const year = new Date().getFullYear();
        return { 
            dateFrom: `01/${year}`,
            dateTo: `12/${year}`
        };
    },
    
    lastThreeMonths: () => {
        const now = new Date();
        const endMonth = now.getMonth() + 1;
        const endYear = now.getFullYear();
        
        let startMonth = endMonth - 2;
        let startYear = endYear;
        
        if (startMonth <= 0) {
            startMonth += 12;
            startYear--;
        }
        
        return {
            dateFrom: `${String(startMonth).padStart(2, '0')}/${startYear}`,
            dateTo: `${String(endMonth).padStart(2, '0')}/${endYear}`
        };
    }
};

/**
 * Apply a preset filter
 * @param {string} presetName - Preset name
 * @returns {boolean} Success
 */
export function applyPreset(presetName) {
    const preset = FILTER_PRESETS[presetName];
    if (preset) {
        setFilters(preset());
        return true;
    }
    return false;
}

// ========================================
// Export Default
// ========================================
export default {
    applyFilters,
    setFilters,
    clearFilters,
    getActiveFiltersCount,
    hasActiveFilters,
    getFiltersSummary,
    applyPreset,
    FILTER_PRESETS
};