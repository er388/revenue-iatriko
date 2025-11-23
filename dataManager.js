/**
 * dataManager.js - Data CRUD Operations Manager
 * Handles all data operations with storage layer
 * Version: 2.0 (Clean Rewrite)
 */

import { STATE } from './state.js';
import storage from './storage.js';
import eopyyDeductionsManager from './eopyyClawback.js';
import { generateId, STRINGS, compareDates } from './utils.js';

// ========================================
// Data Loading
// ========================================

/**
 * Load all data from storage
 * @returns {Promise<boolean>} Success status
 */
export async function loadData() {
    try {
        console.log('[DataManager] Loading data...');
        
        // Load entries
        STATE.entries = await storage.loadEntries();
        
        // Load settings
        STATE.sources = (await storage.loadSetting('sources')) || STATE.sources;
        STATE.insurances = (await storage.loadSetting('insurances')) || STATE.insurances;
        STATE.userLabel = (await storage.loadSetting('userLabel')) || STATE.userLabel;
        
        // Load undo stack
        STATE.undoStack = await storage.loadUndoActions();
        
        // Load deductions
        await eopyyDeductionsManager.loadDeductions();
        
        console.log(`[DataManager] Loaded ${STATE.entries.length} entries`);
        console.log(`[DataManager] Loaded ${STATE.sources.length} sources`);
        console.log(`[DataManager] Loaded ${STATE.insurances.length} insurances`);
        
        return true;
    } catch (error) {
        console.error('[DataManager] Load error:', error);
        return false;
    }
}

/**
 * Save all data to storage
 * @returns {Promise<boolean>} Success status
 */
export async function saveData() {
    try {
        await storage.saveEntries(STATE.entries);
        await storage.saveSetting('sources', STATE.sources);
        await storage.saveSetting('insurances', STATE.insurances);
        await storage.saveSetting('userLabel', STATE.userLabel);
        
        STATE.changeCounter++;
        
        return true;
    } catch (error) {
        if (error.message === 'QUOTA_EXCEEDED') {
            console.error('[DataManager] Storage quota exceeded');
            throw new Error(STRINGS.errors.quotaExceeded);
        }
        
        console.error('[DataManager] Save error:', error);
        throw error;
    }
}

// ========================================
// Entry Operations
// ========================================

/**
 * Add or update entry
 * @param {Object} entry - Entry object
 * @returns {Promise<boolean>} Success status
 */
export async function addEntry(entry) {
    try {
        // Check for duplicates (same date + source, different id)
        const duplicate = STATE.entries.find(e => 
            e.date === entry.date && 
            e.source === entry.source &&
            e.id !== entry.id
        );
        
        if (duplicate) {
            throw new Error(STRINGS.errors.duplicateEntry);
        }

        // Ensure originalAmount is set
        entry.originalAmount = entry.amount;

        // Generate ID for new entries
        if (!entry.id) {
            entry.id = generateId();
            entry.createdAt = Date.now();
            entry.createdBy = STATE.userLabel;
        }
        
        // Update metadata
        entry.updatedAt = Date.now();
        entry.updatedBy = STATE.userLabel;

        const existingIndex = STATE.entries.findIndex(e => e.id === entry.id);
        
        // Save to undo stack
        if (existingIndex >= 0) {
            // Update existing
            await storage.saveUndoAction({
                id: generateId(),
                type: 'update',
                timestamp: Date.now(),
                data: { ...STATE.entries[existingIndex] }
            });
            
            STATE.entries[existingIndex] = entry;
        } else {
            // Add new
            await storage.saveUndoAction({
                id: generateId(),
                type: 'insert',
                timestamp: Date.now(),
                data: { ...entry }
            });
            
            STATE.entries.push(entry);
        }

        // Apply deductions if ΕΟΠΥΥ
        const isEopyy = eopyyDeductionsManager.isEopyyEntry(entry);
        
        if (isEopyy && entry.deductions) {
            await eopyyDeductionsManager.applyDeductions(
                entry.id,
                entry.deductions,
                entry.notes || ''
            );
        } else if (!isEopyy && entry.krathseis !== undefined) {
            // Non-ΕΟΠΥΥ: just store krathseis in entry
            entry.krathseis = parseFloat(entry.krathseis) || 0;
            entry.krathseisPercent = parseFloat(entry.krathseisPercent) || 0;
        }

        // Save to storage
        await saveData();
        
        console.log(`[DataManager] Entry ${existingIndex >= 0 ? 'updated' : 'added'}: ${entry.id}`);
        return true;
    } catch (error) {
        console.error('[DataManager] Add entry error:', error);
        throw error;
    }
}

/**
 * Delete entry
 * @param {string} id - Entry ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteEntry(id) {
    try {
        const index = STATE.entries.findIndex(e => e.id === id);
        
        if (index < 0) {
            console.warn(`[DataManager] Entry not found: ${id}`);
            return false;
        }
        
        // Save to undo stack
        await storage.saveUndoAction({
            id: generateId(),
            type: 'delete',
            timestamp: Date.now(),
            data: { ...STATE.entries[index] }
        });
        
        // Remove deductions if ΕΟΠΥΥ
        await eopyyDeductionsManager.removeDeductions(id);
        
        // Remove entry
        STATE.entries.splice(index, 1);
        
        // Save to storage
        await saveData();
        
        console.log(`[DataManager] Entry deleted: ${id}`);
        return true;
    } catch (error) {
        console.error('[DataManager] Delete entry error:', error);
        throw error;
    }
}

/**
 * Get entry by ID
 * @param {string} id - Entry ID
 * @returns {Object|null} Entry object
 */
export function getEntryById(id) {
    return STATE.entries.find(e => e.id === id) || null;
}

/**
 * Get entries by date range
 * @param {string} startDate - Start date (MM/YYYY)
 * @param {string} endDate - End date (MM/YYYY)
 * @returns {Array} Entries
 */
export function getEntriesByDateRange(startDate, endDate) {
    return STATE.entries.filter(e => {
        return compareDates(e.date, startDate) >= 0 &&
               compareDates(e.date, endDate) <= 0;
    });
}

/**
 * Get entries by source
 * @param {string} source - Source name
 * @returns {Array} Entries
 */
export function getEntriesBySource(source) {
    return STATE.entries.filter(e => e.source === source);
}

/**
 * Get entries by insurance
 * @param {string} insurance - Insurance name
 * @returns {Array} Entries
 */
export function getEntriesByInsurance(insurance) {
    return STATE.entries.filter(e => e.insurance === insurance);
}

/**
 * Get entries by type
 * @param {string} type - Entry type ('cash' | 'invoice')
 * @returns {Array} Entries
 */
export function getEntriesByType(type) {
    return STATE.entries.filter(e => e.type === type);
}

// ========================================
// Bulk Operations
// ========================================

/**
 * Bulk delete entries
 * @param {Array<string>} ids - Entry IDs
 * @returns {Promise<Object>} Delete result
 */
export async function bulkDeleteEntries(ids) {
    let deleted = 0;
    let failed = 0;
    const errors = [];
    
    for (const id of ids) {
        try {
            const success = await deleteEntry(id);
            if (success) {
                deleted++;
            } else {
                failed++;
            }
        } catch (error) {
            failed++;
            errors.push({ id, error: error.message });
        }
    }
    
    return { 
        total: ids.length, 
        deleted, 
        failed,
        errors
    };
}

/**
 * Bulk update entries
 * @param {Array<Object>} updates - Array of {id, changes}
 * @returns {Promise<Object>} Update result
 */
export async function bulkUpdateEntries(updates) {
    let updated = 0;
    let failed = 0;
    const errors = [];
    
    for (const update of updates) {
        try {
            const entry = STATE.entries.find(e => e.id === update.id);
            if (entry) {
                Object.assign(entry, update.changes);
                entry.updatedAt = Date.now();
                entry.updatedBy = STATE.userLabel;
                updated++;
            } else {
                failed++;
                errors.push({ id: update.id, error: 'Entry not found' });
            }
        } catch (error) {
            failed++;
            errors.push({ id: update.id, error: error.message });
        }
    }
    
    if (updated > 0) {
        await saveData();
    }
    
    return { 
        total: updates.length, 
        updated, 
        failed,
        errors
    };
}

// ========================================
// Sources & Insurances Management
// ========================================

/**
 * Add new source
 * @param {string} source - Source name
 * @returns {Promise<boolean>} Success status
 */
export async function addSource(source) {
    try {
        const trimmed = source.trim();
        
        if (!trimmed) {
            throw new Error('Source name cannot be empty');
        }
        
        if (STATE.sources.includes(trimmed)) {
            throw new Error('Source already exists');
        }
        
        STATE.sources.push(trimmed);
        await storage.saveSetting('sources', STATE.sources);
        
        console.log(`[DataManager] Source added: ${trimmed}`);
        return true;
    } catch (error) {
        console.error('[DataManager] Add source error:', error);
        throw error;
    }
}

/**
 * Remove source
 * @param {string} source - Source name
 * @returns {Promise<boolean>} Success status
 */
export async function removeSource(source) {
    try {
        const index = STATE.sources.indexOf(source);
        
        if (index < 0) {
            console.warn(`[DataManager] Source not found: ${source}`);
            return false;
        }
        
        // Check if source is used in entries
        const usedInEntries = STATE.entries.some(e => e.source === source);
        if (usedInEntries) {
            throw new Error('Cannot remove source that is used in entries');
        }
        
        STATE.sources.splice(index, 1);
        await storage.saveSetting('sources', STATE.sources);
        
        console.log(`[DataManager] Source removed: ${source}`);
        return true;
    } catch (error) {
        console.error('[DataManager] Remove source error:', error);
        throw error;
    }
}

/**
 * Add new insurance
 * @param {string} insurance - Insurance name
 * @returns {Promise<boolean>} Success status
 */
export async function addInsurance(insurance) {
    try {
        const trimmed = insurance.trim();
        
        if (!trimmed) {
            throw new Error('Insurance name cannot be empty');
        }
        
        if (STATE.insurances.includes(trimmed)) {
            throw new Error('Insurance already exists');
        }
        
        STATE.insurances.push(trimmed);
        await storage.saveSetting('insurances', STATE.insurances);
        
        console.log(`[DataManager] Insurance added: ${trimmed}`);
        return true;
    } catch (error) {
        console.error('[DataManager] Add insurance error:', error);
        throw error;
    }
}

/**
 * Remove insurance
 * @param {string} insurance - Insurance name
 * @returns {Promise<boolean>} Success status
 */
export async function removeInsurance(insurance) {
    try {
        const index = STATE.insurances.indexOf(insurance);
        
        if (index < 0) {
            console.warn(`[DataManager] Insurance not found: ${insurance}`);
            return false;
        }
        
        // Check if insurance is used in entries
        const usedInEntries = STATE.entries.some(e => e.insurance === insurance);
        if (usedInEntries) {
            throw new Error('Cannot remove insurance that is used in entries');
        }
        
        STATE.insurances.splice(index, 1);
        await storage.saveSetting('insurances', STATE.insurances);
        
        console.log(`[DataManager] Insurance removed: ${insurance}`);
        return true;
    } catch (error) {
        console.error('[DataManager] Remove insurance error:', error);
        throw error;
    }
}

/**
 * Reorder sources
 * @param {Array<string>} newOrder - New order of sources
 * @returns {Promise<boolean>} Success status
 */
export async function reorderSources(newOrder) {
    try {
        STATE.sources = newOrder;
        await storage.saveSetting('sources', STATE.sources);
        return true;
    } catch (error) {
        console.error('[DataManager] Reorder sources error:', error);
        throw error;
    }
}

/**
 * Reorder insurances
 * @param {Array<string>} newOrder - New order of insurances
 * @returns {Promise<boolean>} Success status
 */
export async function reorderInsurances(newOrder) {
    try {
        STATE.insurances = newOrder;
        await storage.saveSetting('insurances', STATE.insurances);
        return true;
    } catch (error) {
        console.error('[DataManager] Reorder insurances error:', error);
        throw error;
    }
}

// ========================================
// Statistics
// ========================================

/**
 * Get data statistics
 * @returns {Object} Statistics
 */
export function getDataStats() {
    if (STATE.entries.length === 0) {
        return {
            totalEntries: 0,
            totalSources: STATE.sources.length,
            totalInsurances: STATE.insurances.length,
            oldestEntry: null,
            newestEntry: null,
            dateRange: null
        };
    }
    
    const sorted = [...STATE.entries].sort((a, b) => compareDates(a.date, b.date));
    
    return {
        totalEntries: STATE.entries.length,
        totalSources: STATE.sources.length,
        totalInsurances: STATE.insurances.length,
        oldestEntry: sorted[0],
        newestEntry: sorted[sorted.length - 1],
        dateRange: {
            from: sorted[0].date,
            to: sorted[sorted.length - 1].date
        }
    };
}

/**
 * Get summary by source
 * @returns {Array} Summary array
 */
export function getSummaryBySource() {
    const summary = {};
    
    STATE.entries.forEach(entry => {
        if (!summary[entry.source]) {
            summary[entry.source] = {
                source: entry.source,
                count: 0,
                totalOriginal: 0,
                totalFinal: 0
            };
        }
        
        const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);
        summary[entry.source].count++;
        summary[entry.source].totalOriginal += amounts.originalAmount;
        summary[entry.source].totalFinal += amounts.finalAmount;
    });
    
    return Object.values(summary).sort((a, b) => b.totalFinal - a.totalFinal);
}

/**
 * Get summary by insurance
 * @returns {Array} Summary array
 */
export function getSummaryByInsurance() {
    const summary = {};
    
    STATE.entries.forEach(entry => {
        if (!summary[entry.insurance]) {
            summary[entry.insurance] = {
                insurance: entry.insurance,
                count: 0,
                totalOriginal: 0,
                totalFinal: 0
            };
        }
        
        const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);
        summary[entry.insurance].count++;
        summary[entry.insurance].totalOriginal += amounts.originalAmount;
        summary[entry.insurance].totalFinal += amounts.finalAmount;
    });
    
    return Object.values(summary).sort((a, b) => b.totalFinal - a.totalFinal);
}

/**
 * Get summary by month
 * @returns {Array} Summary array
 */
export function getSummaryByMonth() {
    const summary = {};
    
    STATE.entries.forEach(entry => {
        if (!summary[entry.date]) {
            summary[entry.date] = {
                date: entry.date,
                count: 0,
                totalOriginal: 0,
                totalFinal: 0
            };
        }
        
        const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);
        summary[entry.date].count++;
        summary[entry.date].totalOriginal += amounts.originalAmount;
        summary[entry.date].totalFinal += amounts.finalAmount;
    });
    
    return Object.values(summary).sort((a, b) => compareDates(a.date, b.date));
}

// ========================================
// Validation
// ========================================

/**
 * Validate entry before saving
 * @param {Object} entry - Entry object
 * @returns {Object} Validation result
 */
export function validateEntry(entry) {
    const errors = [];
    
    // Required fields
    if (!entry.date) errors.push('Η ημερομηνία είναι υποχρεωτική');
    if (!entry.source) errors.push('Η πηγή είναι υποχρεωτική');
    if (!entry.insurance) errors.push('Η ασφάλεια είναι υποχρεωτική');
    if (!entry.type) errors.push('Ο τύπος είναι υποχρεωτικός');
    if (entry.amount === undefined || entry.amount === null) {
        errors.push('Το ποσό είναι υποχρεωτικό');
    }
    
    // Amount validation
    if (entry.amount < 0) errors.push('Το ποσό δεν μπορεί να είναι αρνητικό');
    
    // Date validation
    if (entry.date && !entry.date.match(/^\d{2}\/\d{4}$/)) {
        errors.push('Η ημερομηνία πρέπει να είναι σε μορφή ΜΜ/ΕΕΕΕ');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

// ========================================
// Export All
// ========================================
export default {
    loadData,
    saveData,
    addEntry,
    deleteEntry,
    getEntryById,
    getEntriesByDateRange,
    getEntriesBySource,
    getEntriesByInsurance,
    getEntriesByType,
    bulkDeleteEntries,
    bulkUpdateEntries,
    addSource,
    removeSource,
    addInsurance,
    removeInsurance,
    reorderSources,
    reorderInsurances,
    getDataStats,
    getSummaryBySource,
    getSummaryByInsurance,
    getSummaryByMonth,
    validateEntry
};
