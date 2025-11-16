/**
 * filters.js - Filtering Module
 * Handles all filtering logic for entries table
 */

import { STATE } from './state.js';
import eopyyDeductionsManager from './eopyyClawback.js';
import { compareDates } from './utils.js';

// ========================================
// Main Filter Function
// ========================================

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

    // Amount filters
    if (STATE.filters.amountFrom) {
        filtered = filtered.filter(e => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return amounts.originalAmount >= parseFloat(STATE.filters.amountFrom);
        });
    }
    if (STATE.filters.amountTo) {
        filtered = filtered.filter(e => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return amounts.originalAmount <= parseFloat(STATE.filters.amountTo);
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

    // Sort by date (newest first)
    filtered.sort((a, b) => compareDates(b.date, a.date));

    return filtered;
}

// ========================================
// Filter Helpers
// ========================================

export function setFilters(filters) {
    STATE.filters = { ...filters };
    STATE.currentPage = 1;
}

export function clearFilters() {
    STATE.filters = {};
    STATE.currentPage = 1;
}

export function getActiveFiltersCount() {
    return Object.keys(STATE.filters).filter(key => STATE.filters[key]).length;
}

export function hasActiveFilters() {
    return getActiveFiltersCount() > 0;
}

export function getFiltersSummary() {
    const active = [];
    
    if (STATE.filters.dateFrom) active.push(`Από: ${STATE.filters.dateFrom}`);
    if (STATE.filters.dateTo) active.push(`Έως: ${STATE.filters.dateTo}`);
    if (STATE.filters.source) active.push(`Πηγή: ${STATE.filters.source}`);
    if (STATE.filters.insurance) active.push(`Ασφάλεια: ${STATE.filters.insurance}`);
    if (STATE.filters.type) active.push(`Τύπος: ${STATE.filters.type === 'cash' ? 'Μετρητά' : 'Τιμολόγια'}`);
    if (STATE.filters.amountFrom) active.push(`Ποσό από: €${STATE.filters.amountFrom}`);
    if (STATE.filters.amountTo) active.push(`Ποσό έως: €${STATE.filters.amountTo}`);
    if (STATE.filters.deductionPercentFrom) active.push(`Κρατήσεις από: ${STATE.filters.deductionPercentFrom}%`);
    if (STATE.filters.deductionPercentTo) active.push(`Κρατήσεις έως: ${STATE.filters.deductionPercentTo}%`);
    
    return active.join(' • ');
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
    },
    
    eopyyOnly: () => {
        return { insurance: 'ΕΟΠΥΥ' };
    },
    
    highDeductions: () => {
        return { deductionPercentFrom: '20' };
    }
};

export function applyPreset(presetName) {
    const preset = FILTER_PRESETS[presetName];
    if (preset) {
        setFilters(preset());
        return true;
    }
    return false;
}

// ========================================
// Exports
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