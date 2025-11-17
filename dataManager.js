/**
 * dataManager.js - Data Operations Module
 * Handles loading, saving, adding, and deleting entries
 */

import storage from './storage.js';
import eopyyDeductionsManager from './eopyyClawback.js';
import { generateId, STRINGS } from './utils.js';
import { STATE } from './state.js';
import { markChangesPending } from './backup.js';
import { showToast } from './uiRenderers.js';

// ========================================
// Data Loading
// ========================================

export async function loadData() {
    try {
        STATE.entries = await storage.loadEntries();
        STATE.sources = (await storage.loadSetting('sources')) || STATE.sources;
        STATE.insurances = (await storage.loadSetting('insurances')) || STATE.insurances;
        STATE.userLabel = (await storage.loadSetting('userLabel')) || STATE.userLabel;
        STATE.undoStack = await storage.loadUndoActions();
        
        const userLabelEl = document.getElementById('userLabel');
        if (userLabelEl) {
            userLabelEl.textContent = `Χρήστης: ${STATE.userLabel}`;
        }
        
        await eopyyDeductionsManager.loadDeductions();
        
        console.log(`Loaded ${STATE.entries.length} entries`);
        return true;
    } catch (error) {
        console.error('Load data error:', error);
        showToast('Σφάλμα φόρτωσης δεδομένων', 'error');
        return false;
    }
}

// ========================================
// Data Saving
// ========================================

export async function saveData() {
    try {
        await storage.saveEntries(STATE.entries);
        await storage.saveSetting('sources', STATE.sources);
        await storage.saveSetting('insurances', STATE.insurances);
        
        STATE.changeCounter++;
        
        // Autosave με ρυθμιζόμενο threshold
        const threshold = STATE.autosaveThreshold || 5;
        if (STATE.changeCounter >= threshold) {
            const autosaveEnabled = localStorage.getItem('autosaveEnabled') === 'true';
            if (autosaveEnabled) {
                const { exportBackup } = await import('./backup.js');
                await exportBackup();
                showToast(`Auto-backup δημιουργήθηκε (${threshold} αλλαγές)`, 'success');
                STATE.changeCounter = 0;
            }
        }
        
        markChangesPending();
        return true;
    } catch (error) {
        if (error.message === 'QUOTA_EXCEEDED') {
            showToast(STRINGS.errors.quotaExceeded, 'error');
        } else {
            console.error('Save data error:', error);
            showToast('Σφάλμα αποθήκευσης', 'error');
        }
        return false;
    }
}

// ========================================
// Entry Management
// ========================================

export async function addEntry(entry) {
    const duplicate = STATE.entries.find(e => 
        e.date === entry.date && 
        e.source === entry.source &&
        e.id !== entry.id
    );
    
    if (duplicate) {
        showToast(STRINGS.errors.duplicateEntry, 'error');
        return false;
    }

    entry.originalAmount = entry.amount;

    if (!entry.id) {
        entry.id = generateId();
        entry.createdAt = Date.now();
        entry.createdBy = STATE.userLabel;
    }
    
    entry.updatedAt = Date.now();
    entry.updatedBy = STATE.userLabel;

    // Calculate and store percentages for ΕΟΠΥΥ entries
    const isEopyy = eopyyDeductionsManager.isEopyyEntry(entry);
    if (isEopyy && entry.deductions) {
        const originalAmount = entry.originalAmount;
        entry.deductionPercentages = {
            parakratisiPercent: originalAmount > 0 ? (entry.deductions.parakratisi / originalAmount) * 100 : 0,
            mdePercent: originalAmount > 0 ? (entry.deductions.mde / originalAmount) * 100 : 0,
            rebatePercent: originalAmount > 0 ? (entry.deductions.rebate / originalAmount) * 100 : 0,
            krathseisPercent: originalAmount > 0 ? (entry.deductions.krathseis / originalAmount) * 100 : 0,
            clawbackPercent: originalAmount > 0 ? (entry.deductions.clawback / originalAmount) * 100 : 0
        };
    } else if (!isEopyy && entry.krathseis) {
        entry.krathseisPercent = entry.originalAmount > 0 ? (entry.krathseis / entry.originalAmount) * 100 : 0;
    }

    const existingIndex = STATE.entries.findIndex(e => e.id === entry.id);
    
    if (existingIndex >= 0) {
        await storage.saveUndoAction({
            id: generateId(),
            timestamp: Date.now(),
            data: { ...STATE.entries[existingIndex] }
        });
        
        STATE.entries[existingIndex] = entry;
    } else {
        STATE.entries.push(entry);
        
        await storage.saveUndoAction({
            id: generateId(),
            type: 'insert',
            timestamp: Date.now(),
            data: { ...entry }
        });
    }

    if (isEopyy && entry.deductions) {
        await eopyyDeductionsManager.applyDeductions(
            entry.id,
            entry.deductions,
            entry.notes || ''
        );
    }

    await saveData();
    return true;
}

export async function deleteEntry(id) {
    const index = STATE.entries.findIndex(e => e.id === id);
    
    if (index >= 0) {
        await storage.saveUndoAction({
            id: generateId(),
            type: 'delete',
            timestamp: Date.now(),
            data: { ...STATE.entries[index] }
        });
        
        await eopyyDeductionsManager.removeDeductions(id);
        
        STATE.entries.splice(index, 1);
        
        await saveData();
        return true;
    }
    
    return false;
}

// ========================================
// Bulk Operations
// ========================================

export async function bulkDeleteEntries(ids) {
    let deleted = 0;
    
    for (const id of ids) {
        const success = await deleteEntry(id);
        if (success) deleted++;
    }
    
    return { deleted, total: ids.length };
}

export async function bulkUpdateEntries(updates) {
    let updated = 0;
    
    for (const update of updates) {
        const entry = STATE.entries.find(e => e.id === update.id);
        if (entry) {
            Object.assign(entry, update.changes);
            entry.updatedAt = Date.now();
            entry.updatedBy = STATE.userLabel;
            updated++;
        }
    }
    
    if (updated > 0) {
        await saveData();
    }
    
    return { updated, total: updates.length };
}

// ========================================
// Entry Queries
// ========================================

export function getEntryById(id) {
    return STATE.entries.find(e => e.id === id);
}

export function getEntriesByDateRange(startDate, endDate) {
    return STATE.entries.filter(e => {
        return e.date >= startDate && e.date <= endDate;
    });
}

export function getEntriesBySource(source) {
    return STATE.entries.filter(e => e.source === source);
}

export function getEntriesByInsurance(insurance) {
    return STATE.entries.filter(e => e.insurance === insurance);
}

// ========================================
// Statistics
// ========================================

export function getDataStats() {
    return {
        totalEntries: STATE.entries.length,
        totalSources: STATE.sources.length,
        totalInsurances: STATE.insurances.length,
        oldestEntry: STATE.entries.length > 0 
            ? STATE.entries.reduce((oldest, e) => e.date < oldest.date ? e : oldest)
            : null,
        newestEntry: STATE.entries.length > 0
            ? STATE.entries.reduce((newest, e) => e.date > newest.date ? e : newest)
            : null
    };
}

// ========================================
// Exports
// ========================================

export default {
    loadData,
    saveData,
    addEntry,
    deleteEntry,
    bulkDeleteEntries,
    bulkUpdateEntries,
    getEntryById,
    getEntriesByDateRange,
    getEntriesBySource,
    getEntriesByInsurance,
    getDataStats
};