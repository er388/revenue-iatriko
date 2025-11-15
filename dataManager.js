/**
 * dataManager.js - Data Operations Module
 * Handles loading, saving, adding, and deleting entries
 */

import storage from './storage.js';
import eopyyDeductionsManager from './eopyyClawback.js';
import { generateId, STRINGS } from './utils.js';
import { STATE } from './state.js';
import { markChangesPending } from './backup.js';

// ========================================
// Toast Notification (imported from UI later)
// ========================================
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
        
        // Autosave every 5 changes
        if (STATE.changeCounter >= 5) {
            const autosaveEnabled = localStorage.getItem('autosaveEnabled') === 'true';
            if (autosaveEnabled) {
                const { exportBackup } = await import('./backup.js');
                await exportBackup();
                showToast('Auto-backup δημιουργήθηκε', 'success');
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
    // Check for duplicates
    const duplicate = STATE.entries.find(e => 
        e.date === entry.date && 
        e.source === entry.source &&
        e.id !== entry.id
    );
    
    if (duplicate) {
        showToast(STRINGS.errors.duplicateEntry, 'error');
        return false;
    }

    // Store original amount
    entry.originalAmount = entry.amount;

    // Generate ID and metadata for new entries
    if (!entry.id) {
        entry.id = generateId();
        entry.createdAt = Date.now();
        entry.createdBy = STATE.userLabel;
    }
    
    entry.updatedAt = Date.now();
    entry.updatedBy = STATE.userLabel;

    const existingIndex = STATE.entries.findIndex(e => e.id === entry.id);
    
    // Update or insert
    if (existingIndex >= 0) {
        // Save undo action for update
        await storage.saveUndoAction({
            id: generateId(),
            type: 'update',
            timestamp: Date.now(),
            data: { ...STATE.entries[existingIndex] }
        });
        
        STATE.entries[existingIndex] = entry;
    } else {
        // Save undo action for insert
        STATE.entries.push(entry);
        
        await storage.saveUndoAction({
            id: generateId(),
            type: 'insert',
            timestamp: Date.now(),
            data: { ...entry }
        });
    }

    // Apply ΕΟΠΥΥ deductions if applicable
    const isEopyy = eopyyDeductionsManager.isEopyyEntry(entry);
    
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
        // Save undo action
        await storage.saveUndoAction({
            id: generateId(),
            type: 'delete',
            timestamp: Date.now(),
            data: { ...STATE.entries[index] }
        });
        
        // Remove ΕΟΠΥΥ deductions
        await eopyyDeductionsManager.removeDeductions(id);
        
        // Remove entry
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