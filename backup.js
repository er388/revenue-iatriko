/**
 * backup.js - Backup Management Module
 * Import Î¼Îµ Merge/Overwrite, Autosave, Local file handling
 */

import storage from './storage.js';
import { 
    generateId, 
    downloadBlob, 
    readFileAsText, 
    logError,
    formatDateTime,
    deepClone,
    STRINGS 
} from './utils.js';

// ========================================
// Configuration
// ========================================
const AUTOSAVE_CONFIG = {
    enabled: false,
    interval: 30000, // 30 seconds
    lastSave: null,
    pendingChanges: false
};

let autosaveTimer = null;
let autosaveIndicator = null;

// ========================================
// Backup Manager Class
// ========================================
class BackupManager {
    constructor() {
        this.autosaveEnabled = false;
        this.lastBackupTime = null;
        this.changesPending = false;
    }

    async createBackup() {
        try {
            const data = await storage.exportAllData();
            
            this.lastBackupTime = Date.now();
            
            return {
                ...data,
                appVersion: '1.0',
                backupId: generateId(),
                backupDate: new Date().toISOString()
            };
        } catch (error) {
            logError('Create backup', error);
            throw error;
        }
    }

    async exportBackup() {
            try {
                const backup = await this.createBackup();
                const json = JSON.stringify(backup, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const filename = `backup_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
                
                downloadBlob(filename, blob);
                
                // Track manual backup time
                localStorage.setItem('lastManualBackup', Date.now().toString());
                
                return { success: true, filename };
            } catch (error) {
                logError('Export backup', error);
                throw error;
            }
        }

    async importBackup(file, mode = 'overwrite', onProgress = null) {
        const report = {
            success: false,
            mode,
            inserted: 0,
            updated: 0,
            duplicates: 0,
            errors: 0,
            errorMessages: [],
            preview: null
        };

        try {
            const jsonText = await readFileAsText(file);
            const backup = JSON.parse(jsonText);

            if (!backup.version || !backup.entries) {
                throw new Error('Invalid backup format - missing version or entries');
            }

            const currentEntries = await storage.loadEntries();

            if (mode === 'overwrite') {
                report.preview = {
                    currentCount: currentEntries.length,
                    newCount: backup.entries.length,
                    willDelete: currentEntries.length,
                    willAdd: backup.entries.length
                };

                await storage.saveEntries(backup.entries);
                report.inserted = backup.entries.length;

            } else if (mode === 'merge') {
                const mergeResult = this.mergeEntries(currentEntries, backup.entries);
                
                report.preview = {
                    currentCount: currentEntries.length,
                    newCount: backup.entries.length,
                    totalAfterMerge: mergeResult.merged.length,
                    duplicatesFound: mergeResult.duplicates
                };

                await storage.saveEntries(mergeResult.merged);
                report.inserted = mergeResult.inserted;
                report.updated = mergeResult.updated;
                report.duplicates = mergeResult.duplicates;
            }

            if (backup.sources) {
                const currentSources = await storage.loadSetting('sources') || [];
                const mergedSources = [...new Set([...currentSources, ...backup.sources])];
                await storage.saveSetting('sources', mergedSources);
            }

            if (backup.insurances) {
                const currentInsurances = await storage.loadSetting('insurances') || [];
                const mergedInsurances = [...new Set([...currentInsurances, ...backup.insurances])];
                await storage.saveSetting('insurances', mergedInsurances);
            }

            if (backup.userLabel) {
                await storage.saveSetting('userLabel', backup.userLabel);
            }

            report.success = true;
            return report;

        } catch (error) {
            logError('Import backup', error);
            report.errors++;
            report.errorMessages.push(error.message);
            return report;
        }
    }

    mergeEntries(currentEntries, newEntries) {
        const result = {
            merged: [],
            inserted: 0,
            updated: 0,
            duplicates: 0
        };

        const currentMap = new Map();
        currentEntries.forEach(entry => {
            const key = `${entry.date}_${entry.source}`;
            currentMap.set(key, entry);
        });

        const keysToKeep = new Set();

        newEntries.forEach(newEntry => {
            const key = `${newEntry.date}_${newEntry.source}`;
            
            if (currentMap.has(key)) {
                const currentEntry = currentMap.get(key);
                
                const currentTime = currentEntry.updatedAt || currentEntry.createdAt || 0;
                const newTime = newEntry.updatedAt || newEntry.createdAt || 0;
                
                if (newTime > currentTime) {
                    result.merged.push(deepClone(newEntry));
                    result.updated++;
                } else {
                    result.merged.push(deepClone(currentEntry));
                    keysToKeep.add(key);
                }
                
                result.duplicates++;
            } else {
                result.merged.push(deepClone(newEntry));
                result.inserted++;
            }
        });

        currentEntries.forEach(entry => {
            const key = `${entry.date}_${entry.source}`;
            if (!keysToKeep.has(key) && !newEntries.find(e => `${e.date}_${e.source}` === key)) {
                result.merged.push(deepClone(entry));
            }
        });

        return result;
    }

    async getImportPreview(file, mode = 'overwrite') {
        try {
            const jsonText = await readFileAsText(file);
            const backup = JSON.parse(jsonText);

            if (!backup.version || !backup.entries) {
                throw new Error('Invalid backup format');
            }

            const currentEntries = await storage.loadEntries();

            const preview = {
                valid: true,
                backupInfo: {
                    version: backup.version,
                    date: backup.backupDate || backup.exportDate,
                    entriesCount: backup.entries.length
                },
                current: {
                    entriesCount: currentEntries.length
                },
                mode
            };

            if (mode === 'overwrite') {
                preview.impact = {
                    willDelete: currentEntries.length,
                    willAdd: backup.entries.length,
                    finalCount: backup.entries.length
                };
            } else {
                const mergeResult = this.mergeEntries(currentEntries, backup.entries);
                preview.impact = {
                    willInsert: mergeResult.inserted,
                    willUpdate: mergeResult.updated,
                    duplicates: mergeResult.duplicates,
                    finalCount: mergeResult.merged.length
                };
            }

            return preview;
        } catch (error) {
            logError('Import preview', error);
            return {
                valid: false,
                error: error.message
            };
        }
    }

    enableAutosave(interval = 30000) {
        this.autosaveEnabled = true;
        AUTOSAVE_CONFIG.enabled = true;
        AUTOSAVE_CONFIG.interval = interval;

        this.startAutosave();
        this.showAutosaveIndicator('Autosave ÎµÎ½ÎµÏÎ³ÏŒ');
        
        console.log(`Autosave enabled with ${interval}ms interval`);
    }

    disableAutosave() {
        this.autosaveEnabled = false;
        AUTOSAVE_CONFIG.enabled = false;

        if (autosaveTimer) {
            clearInterval(autosaveTimer);
            autosaveTimer = null;
        }

        this.hideAutosaveIndicator();
        console.log('Autosave disabled');
    }

    startAutosave() {
        if (autosaveTimer) {
            clearInterval(autosaveTimer);
        }

        autosaveTimer = setInterval(async () => {
            if (this.changesPending) {
                await this.performAutosave();
            }
        }, AUTOSAVE_CONFIG.interval);
    }

    markChangesPending() {
        this.changesPending = true;
        AUTOSAVE_CONFIG.pendingChanges = true;
    }

    async performAutosave() {
        if (!this.autosaveEnabled) return;

        try {
            this.showAutosaveIndicator(STRINGS.info.saving);

            const backup = await this.createBackup();
            const json = JSON.stringify(backup, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const filename = 'backup.json';

            downloadBlob(filename, blob);

            this.changesPending = false;
            AUTOSAVE_CONFIG.pendingChanges = false;
            AUTOSAVE_CONFIG.lastSave = Date.now();

            this.showAutosaveIndicator(STRINGS.info.saved);
            
            setTimeout(() => {
                if (!AUTOSAVE_CONFIG.pendingChanges) {
                    this.hideAutosaveIndicator();
                }
            }, 2000);

        } catch (error) {
            logError('Autosave', error);
            this.showAutosaveIndicator('Î£Ï†Î¬Î»Î¼Î± autosave', 'error');
        }
    }

    showAutosaveIndicator(message, type = 'info') {
        if (!autosaveIndicator) {
            autosaveIndicator = document.getElementById('autosaveIndicator');
        }

        if (autosaveIndicator) {
            autosaveIndicator.textContent = message;
            autosaveIndicator.className = `autosave-indicator ${type}`;
            autosaveIndicator.style.display = 'block';
        }
    }

    hideAutosaveIndicator() {
        if (autosaveIndicator) {
            autosaveIndicator.style.display = 'none';
        }
    }

    getAutosaveStatus() {
        return {
            enabled: this.autosaveEnabled,
            lastSave: AUTOSAVE_CONFIG.lastSave,
            lastSaveFormatted: AUTOSAVE_CONFIG.lastSave ? formatDateTime(AUTOSAVE_CONFIG.lastSave) : 'Î Î¿Ï„Î­',
            pendingChanges: this.changesPending,
            interval: AUTOSAVE_CONFIG.interval
        };
    }
}

// ========================================
// Singleton Instance
// ========================================
const backupManager = new BackupManager();

// ========================================
// Public API Functions
// ========================================

export async function exportBackup() {
    return await backupManager.exportBackup();
}

export async function importBackup(file, mode = 'overwrite') {
    return await backupManager.importBackup(file, mode);
}

export async function getImportPreview(file, mode = 'overwrite') {
    return await backupManager.getImportPreview(file, mode);
}

export function enableAutosave(interval = 30000) {
    backupManager.enableAutosave(interval);
}

export function disableAutosave() {
    backupManager.disableAutosave();
}

export function markChangesPending() {
    backupManager.markChangesPending();
}

export function getAutosaveStatus() {
    return backupManager.getAutosaveStatus();
}

export { BackupManager, AUTOSAVE_CONFIG };
export default backupManager;