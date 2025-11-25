/**
 * backup.js - Backup & Restore Manager
 * Full implementation with merge/overwrite, autosave, conflict detection
 * Version: 2.0 (Complete)
 */

import { STATE } from './state.js';
import storage from './storage.js';
import { generateId, formatDateTime, downloadBlob, readFileAsText, logError } from './utils.js';

// ========================================
// Configuration
// ========================================
const BACKUP_CONFIG = {
    version: '2.0',
    autoSaveInterval: 5, // changes
    filePrefix: 'backup_',
    fileExtension: '.json',
    maxBackupSize: 50 * 1024 * 1024, // 50MB
    compressionEnabled: false // Future: enable JSON compression
};

// ========================================
// Backup Manager Class
// ========================================
class BackupManager {
    constructor() {
        this.autoSaveEnabled = false;
        this.autoSaveTimer = null;
        this.autoSaveInterval = BACKUP_CONFIG.autoSaveInterval;
        this.lastBackupTimestamp = null;
        
        // Load autosave settings
        this.loadAutosaveSettings();
    }

    // ========================================
    // Export Methods
    // ========================================

    /**
     * Create backup data object
     * @returns {Promise<Object>} Backup data
     */
    async createBackup() {
        try {
            const entries = await storage.loadEntries();
            const sources = await storage.loadSetting('sources');
            const insurances = await storage.loadSetting('insurances');
            const userLabel = await storage.loadSetting('userLabel');
            const eopyyDeductions = await storage.loadSetting('eopyyDeductions');

            return {
                version: BACKUP_CONFIG.version,
                timestamp: Date.now(),
                dateCreated: new Date().toISOString(),
                userLabel: userLabel || 'Admin',
                data: {
                    entries: entries || [],
                    sources: sources || STATE.sources,
                    insurances: insurances || STATE.insurances,
                    eopyyDeductions: eopyyDeductions || []
                },
                metadata: {
                    entriesCount: entries ? entries.length : 0,
                    sourcesCount: sources ? sources.length : STATE.sources.length,
                    insurancesCount: insurances ? insurances.length : STATE.insurances.length,
                    deductionsCount: eopyyDeductions ? eopyyDeductions.length : 0
                }
            };
        } catch (error) {
            logError('Create backup', error);
            throw error;
        }
    }

    /**
     * Export backup as JSON file
     * @returns {Promise<boolean>} Success status
     */
    async exportBackup() {
        try {
            const backup = await this.createBackup();
            const filename = this.generateBackupFilename();
            const json = JSON.stringify(backup, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            
            downloadBlob(filename, blob);
            
            this.lastBackupTimestamp = Date.now();
            localStorage.setItem('last_backup_timestamp', this.lastBackupTimestamp.toString());
            
            console.log('[Backup] Export successful:', filename);
            return true;
        } catch (error) {
            logError('Export backup', error);
            throw error;
        }
    }

    /**
     * Generate backup filename
     * @returns {string} Filename
     */
    generateBackupFilename() {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
        const timeStr = now.toTimeString().slice(0, 5).replace(':', '-'); // HH-MM
        return `${BACKUP_CONFIG.filePrefix}${dateStr}_${timeStr}${BACKUP_CONFIG.fileExtension}`;
    }

    // ========================================
    // Import Methods
    // ========================================

    /**
     * Import backup from file
     * @param {File} file - Backup file
     * @param {string} mode - 'overwrite' | 'merge'
     * @returns {Promise<Object>} Import report
     */
    async importBackup(file, mode = 'overwrite') {
        const report = {
            success: false,
            mode,
            inserted: 0,
            updated: 0,
            duplicates: 0,
            errors: 0,
            errorMessages: []
        };

        try {
            // Read file
            const text = await readFileAsText(file);
            const backup = JSON.parse(text);

            // Validate backup
            const validation = await this.validateBackup(backup);
            if (!validation.valid) {
                report.errorMessages.push(...validation.errors);
                report.errors = validation.errors.length;
                return report;
            }

            // Get current data
            const currentEntries = await storage.loadEntries();
            const currentSources = await storage.loadSetting('sources');
            const currentInsurances = await storage.loadSetting('insurances');

            // Process based on mode
            if (mode === 'overwrite') {
                await this.overwriteImport(backup, report);
            } else {
                await this.mergeImport(backup, currentEntries, report);
            }

            // Update sources and insurances
            await this.updateListsFromBackup(backup, currentSources, currentInsurances);

            report.success = true;
            console.log('[Backup] Import successful:', report);
            return report;

        } catch (error) {
            logError('Import backup', error);
            report.errorMessages.push(error.message);
            report.errors++;
            return report;
        }
    }

    /**
     * Overwrite import (replace all data)
     * @param {Object} backup - Backup data
     * @param {Object} report - Import report
     * @private
     */
    async overwriteImport(backup, report) {
        // Clear existing data
        await storage.clearAllStorage();

        // Import new data
        await storage.saveEntries(backup.data.entries);
        await storage.saveSetting('sources', backup.data.sources);
        await storage.saveSetting('insurances', backup.data.insurances);
        await storage.saveSetting('eopyyDeductions', backup.data.eopyyDeductions || []);
        
        if (backup.userLabel) {
            await storage.saveSetting('userLabel', backup.userLabel);
        }

        report.inserted = backup.data.entries.length;
    }

    /**
     * Merge import (smart merge with conflict detection)
     * @param {Object} backup - Backup data
     * @param {Array} currentEntries - Current entries
     * @param {Object} report - Import report
     * @private
     */
    async mergeImport(backup, currentEntries, report) {
        const backupEntries = backup.data.entries;
        const merged = [...currentEntries];
        
        // Create lookup map for current entries (by date + source)
        const currentMap = new Map();
        currentEntries.forEach(entry => {
            const key = `${entry.date}_${entry.source}`;
            currentMap.set(key, entry);
        });

        // Process each backup entry
        for (const backupEntry of backupEntries) {
            const key = `${backupEntry.date}_${backupEntry.source}`;
            
            if (currentMap.has(key)) {
                const currentEntry = currentMap.get(key);
                
                // Check if backup is newer
                const backupTime = backupEntry.updatedAt || backupEntry.createdAt || 0;
                const currentTime = currentEntry.updatedAt || currentEntry.createdAt || 0;
                
                if (backupTime > currentTime) {
                    // Update existing entry
                    const index = merged.findIndex(e => e.id === currentEntry.id);
                    if (index >= 0) {
                        merged[index] = { ...backupEntry };
                        report.updated++;
                    }
                } else {
                    // Skip (current is newer)
                    report.duplicates++;
                }
            } else {
                // Insert new entry
                merged.push({ ...backupEntry, id: backupEntry.id || generateId() });
                report.inserted++;
            }
        }

        // Save merged data
        await storage.saveEntries(merged);
        
        // Merge deductions
        await this.mergeDeductions(backup);
    }

    /**
     * Merge deductions data
     * @param {Object} backup - Backup data
     * @private
     */
    async mergeDeductions(backup) {
        if (!backup.data.eopyyDeductions) return;

        const currentDeductions = await storage.loadSetting('eopyyDeductions') || [];
        const backupDeductions = backup.data.eopyyDeductions;

        // Create map of current deductions by entryId
        const deductionsMap = new Map();
        currentDeductions.forEach(d => deductionsMap.set(d.entryId, d));

        // Merge backup deductions
        backupDeductions.forEach(backupDeduction => {
            const current = deductionsMap.get(backupDeduction.entryId);
            
            if (!current || (backupDeduction.appliedDate > (current.appliedDate || 0))) {
                deductionsMap.set(backupDeduction.entryId, backupDeduction);
            }
        });

        // Save merged deductions
        await storage.saveSetting('eopyyDeductions', Array.from(deductionsMap.values()));
    }

    /**
     * Update sources and insurances lists from backup
     * @param {Object} backup - Backup data
     * @param {Array} currentSources - Current sources
     * @param {Array} currentInsurances - Current insurances
     * @private
     */
    async updateListsFromBackup(backup, currentSources, currentInsurances) {
        // Merge sources (unique)
        const mergedSources = [...new Set([
            ...(currentSources || STATE.sources),
            ...backup.data.sources
        ])];

        // Merge insurances (unique)
        const mergedInsurances = [...new Set([
            ...(currentInsurances || STATE.insurances),
            ...backup.data.insurances
        ])];

        await storage.saveSetting('sources', mergedSources);
        await storage.saveSetting('insurances', mergedInsurances);
    }

    /**
     * Get import preview (before actual import)
     * @param {File} file - Backup file
     * @param {string} mode - 'overwrite' | 'merge'
     * @returns {Promise<Object>} Preview data
     */
    async getImportPreview(file, mode = 'overwrite') {
        try {
            const text = await readFileAsText(file);
            const backup = JSON.parse(text);

            // Validate
            const validation = await this.validateBackup(backup);
            if (!validation.valid) {
                return {
                    valid: false,
                    error: validation.errors.join(', ')
                };
            }

            // Get current data
            const currentEntries = await storage.loadEntries();

            // Calculate impact
            const impact = await this.calculateImportImpact(backup, currentEntries, mode);

            return {
                valid: true,
                backupInfo: {
                    version: backup.version,
                    date: backup.dateCreated,
                    entriesCount: backup.metadata.entriesCount,
                    sourcesCount: backup.metadata.sourcesCount,
                    insurancesCount: backup.metadata.insurancesCount
                },
                current: {
                    entriesCount: currentEntries.length,
                    sourcesCount: STATE.sources.length,
                    insurancesCount: STATE.insurances.length
                },
                impact
            };

        } catch (error) {
            logError('Import preview', error);
            return {
                valid: false,
                error: error.message
            };
        }
    }

    /**
     * Calculate import impact
     * @param {Object} backup - Backup data
     * @param {Array} currentEntries - Current entries
     * @param {string} mode - Import mode
     * @returns {Promise<Object>} Impact data
     * @private
     */
    async calculateImportImpact(backup, currentEntries, mode) {
        if (mode === 'overwrite') {
            return {
                willDelete: currentEntries.length,
                willAdd: backup.data.entries.length,
                finalCount: backup.data.entries.length
            };
        } else {
            // Merge mode
            let willInsert = 0;
            let willUpdate = 0;
            let duplicates = 0;

            const currentMap = new Map();
            currentEntries.forEach(entry => {
                const key = `${entry.date}_${entry.source}`;
                currentMap.set(key, entry);
            });

            backup.data.entries.forEach(backupEntry => {
                const key = `${backupEntry.date}_${backupEntry.source}`;
                
                if (currentMap.has(key)) {
                    const currentEntry = currentMap.get(key);
                    const backupTime = backupEntry.updatedAt || backupEntry.createdAt || 0;
                    const currentTime = currentEntry.updatedAt || currentEntry.createdAt || 0;
                    
                    if (backupTime > currentTime) {
                        willUpdate++;
                    } else {
                        duplicates++;
                    }
                } else {
                    willInsert++;
                }
            });

            return {
                willInsert,
                willUpdate,
                duplicates,
                finalCount: currentEntries.length + willInsert
            };
        }
    }

    /**
     * Validate backup structure
     * @param {Object} backup - Backup data
     * @returns {Object} Validation result
     */
    async validateBackup(backup) {
        const errors = [];

        // Check structure
        if (!backup.version) errors.push('Missing version');
        if (!backup.data) errors.push('Missing data');
        if (!backup.data.entries || !Array.isArray(backup.data.entries)) {
            errors.push('Missing or invalid entries array');
        }
        if (!backup.data.sources || !Array.isArray(backup.data.sources)) {
            errors.push('Missing or invalid sources array');
        }
        if (!backup.data.insurances || !Array.isArray(backup.data.insurances)) {
            errors.push('Missing or invalid insurances array');
        }

        // Check version compatibility
        if (backup.version && !this.isVersionCompatible(backup.version)) {
            errors.push(`Incompatible version: ${backup.version} (expected ${BACKUP_CONFIG.version})`);
        }

        // Validate entries structure
        if (backup.data.entries) {
            for (let i = 0; i < Math.min(backup.data.entries.length, 10); i++) {
                const entry = backup.data.entries[i];
                if (!entry.date || !entry.source || !entry.insurance) {
                    errors.push(`Entry ${i} missing required fields`);
                    break;
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Check version compatibility
     * @param {string} version - Backup version
     * @returns {boolean} Compatible or not
     * @private
     */
    isVersionCompatible(version) {
        const [major] = version.split('.');
        const [currentMajor] = BACKUP_CONFIG.version.split('.');
        return major === currentMajor;
    }

    // ========================================
    // Autosave Methods
    // ========================================

    /**
     * Load autosave settings from localStorage
     * @private
     */
    loadAutosaveSettings() {
        const enabled = localStorage.getItem('autosaveEnabled') === 'true';
        const interval = parseInt(localStorage.getItem('autosaveInterval')) || BACKUP_CONFIG.autoSaveInterval;
        
        this.autoSaveEnabled = enabled;
        this.autoSaveInterval = interval;

        if (this.autoSaveEnabled) {
            this.setupAutosave();
        }
    }

    /**
     * Setup autosave functionality
     */
    setupAutosave() {
        this.clearAutosave();

        if (!this.autoSaveEnabled) return;

        // Watch for changes in STATE.changeCounter
        this.autoSaveTimer = setInterval(() => {
            if (STATE.changeCounter >= this.autoSaveInterval) {
                this.triggerAutosave();
            }
        }, 5000); // Check every 5 seconds

        console.log(`[Backup] Autosave enabled (every ${this.autoSaveInterval} changes)`);
    }

    /**
     * Trigger autosave
     */
    async triggerAutosave() {
        if (!this.autoSaveEnabled) return;

        try {
            console.log('[Backup] Triggering autosave...');
            await this.exportBackup();
            
            // Reset change counter
            STATE.changeCounter = 0;
            
            // Update UI indicator
            const indicator = document.getElementById('autosaveIndicator');
            if (indicator) {
                indicator.textContent = 'Αποθηκεύτηκε ' + formatDateTime(Date.now()).split(',')[1].trim();
                indicator.className = 'autosave-indicator success';
                indicator.style.display = 'inline-block';

                setTimeout(() => {
                    indicator.style.display = 'none';
                }, 3000);
            }

            console.log('[Backup] Autosave successful');
        } catch (error) {
            logError('Autosave', error);
            
            // Update UI indicator
            const indicator = document.getElementById('autosaveIndicator');
            if (indicator) {
                indicator.textContent = 'Σφάλμα autosave';
                indicator.className = 'autosave-indicator error';
                indicator.style.display = 'inline-block';
            }
        }
    }

    /**
     * Clear autosave timer
     */
    clearAutosave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }

    /**
     * Enable autosave
     * @param {number} interval - Changes interval
     */
    enableAutosave(interval = BACKUP_CONFIG.autoSaveInterval) {
        this.autoSaveEnabled = true;
        this.autoSaveInterval = interval;
        
        localStorage.setItem('autosaveEnabled', 'true');
        localStorage.setItem('autosaveInterval', interval.toString());
        
        this.setupAutosave();
    }

    /**
     * Disable autosave
     */
    disableAutosave() {
        this.autoSaveEnabled = false;
        localStorage.setItem('autosaveEnabled', 'false');
        this.clearAutosave();
    }

    /**
     * Get autosave status
     * @returns {Object} Status info
     */
    getAutosaveStatus() {
        return {
            enabled: this.autoSaveEnabled,
            interval: this.autoSaveInterval,
            currentChanges: STATE.changeCounter,
            lastBackup: this.lastBackupTimestamp 
                ? formatDateTime(this.lastBackupTimestamp)
                : 'Ποτέ'
        };
    }
}

// ========================================
// Singleton Instance
// ========================================
const backupManager = new BackupManager();

// ========================================
// Named Exports
// ========================================
export async function exportBackup() {
    return await backupManager.exportBackup();
}

export async function importBackup(file, mode) {
    return await backupManager.importBackup(file, mode);
}

export async function getImportPreview(file, mode) {
    return await backupManager.getImportPreview(file, mode);
}

export { BackupManager };

// ========================================
// Default Export
// ========================================
export default backupManager;