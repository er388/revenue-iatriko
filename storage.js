/**
 * storage.js - Persistent Storage Management
 * IndexedDB with localStorage fallback
 * Version: 2.0 (Clean Rewrite)
 */

import { logError, generateId } from './utils.js';

// ========================================
// Configuration
// ========================================
const STORAGE_CONFIG = Object.freeze({
    dbName: 'RevenueDB',
    dbVersion: 2,
    stores: {
        entries: 'entries',
        settings: 'settings',
        undo: 'undo',
        cache: 'cache'
    },
    undoTTL: 30 * 60 * 1000, // 30 minutes
    maxUndoActions: 50,
    cacheTTL: 60 * 60 * 1000 // 1 hour default
});

// ========================================
// IndexedDB Helper Class
// ========================================
class IndexedDBHelper {
    constructor(dbName, version) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
        this.isAvailable = false;
    }

    /**
     * Initialize IndexedDB connection
     * @returns {Promise<boolean>} Success status
     */
    async init() {
        return new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open(this.dbName, this.version);

                request.onerror = () => {
                    this.isAvailable = false;
                    logError('IndexedDB open', request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    this.db = request.result;
                    this.isAvailable = true;
                    console.log('[Storage] IndexedDB initialized successfully');
                    resolve(true);
                };

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    
                    // Entries store
                    if (!db.objectStoreNames.contains('entries')) {
                        const entriesStore = db.createObjectStore('entries', { 
                            keyPath: 'id', 
                            autoIncrement: false 
                        });
                        entriesStore.createIndex('date', 'date', { unique: false });
                        entriesStore.createIndex('source', 'source', { unique: false });
                        entriesStore.createIndex('insurance', 'insurance', { unique: false });
                        entriesStore.createIndex('type', 'type', { unique: false });
                        entriesStore.createIndex('dateSource', ['date', 'source'], { unique: false });
                        entriesStore.createIndex('createdAt', 'createdAt', { unique: false });
                    }

                    // Settings store
                    if (!db.objectStoreNames.contains('settings')) {
                        db.createObjectStore('settings', { keyPath: 'key' });
                    }

                    // Undo store
                    if (!db.objectStoreNames.contains('undo')) {
                        const undoStore = db.createObjectStore('undo', { 
                            keyPath: 'id', 
                            autoIncrement: false 
                        });
                        undoStore.createIndex('timestamp', 'timestamp', { unique: false });
                    }

                    // Cache store
                    if (!db.objectStoreNames.contains('cache')) {
                        const cacheStore = db.createObjectStore('cache', { keyPath: 'key' });
                        cacheStore.createIndex('timestamp', 'timestamp', { unique: false });
                    }
                };
            } catch (error) {
                this.isAvailable = false;
                logError('IndexedDB init', error);
                reject(error);
            }
        });
    }

    /**
     * Get all records from store
     * @param {string} storeName - Store name
     * @returns {Promise<Array>} Records
     */
    async getAll(storeName) {
        if (!this.isAvailable || !this.db) {
            throw new Error('IndexedDB not available');
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(storeName, 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.getAll();

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result || []);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Get single record by key
     * @param {string} storeName - Store name
     * @param {string} key - Record key
     * @returns {Promise<any>} Record
     */
    async get(storeName, key) {
        if (!this.isAvailable || !this.db) {
            throw new Error('IndexedDB not available');
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(storeName, 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.get(key);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Add record to store
     * @param {string} storeName - Store name
     * @param {any} data - Data to add
     * @returns {Promise<any>} Result
     */
    async add(storeName, data) {
        if (!this.isAvailable || !this.db) {
            throw new Error('IndexedDB not available');
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(storeName, 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.add(data);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Put (add or update) record in store
     * @param {string} storeName - Store name
     * @param {any} data - Data to put
     * @returns {Promise<any>} Result
     */
    async put(storeName, data) {
        if (!this.isAvailable || !this.db) {
            throw new Error('IndexedDB not available');
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(storeName, 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.put(data);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Delete record from store
     * @param {string} storeName - Store name
     * @param {string} key - Record key
     * @returns {Promise<void>}
     */
    async delete(storeName, key) {
        if (!this.isAvailable || !this.db) {
            throw new Error('IndexedDB not available');
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(storeName, 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.delete(key);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Clear all records from store
     * @param {string} storeName - Store name
     * @returns {Promise<void>}
     */
    async clear(storeName) {
        if (!this.isAvailable || !this.db) {
            throw new Error('IndexedDB not available');
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(storeName, 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.clear();

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Batch put multiple records
     * @param {string} storeName - Store name
     * @param {Array} items - Items to put
     * @returns {Promise<number>} Number of saved items
     */
    async batchPut(storeName, items) {
        if (!this.isAvailable || !this.db) {
            throw new Error('IndexedDB not available');
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(storeName, 'readwrite');
                const store = transaction.objectStore(storeName);
                let count = 0;

                transaction.oncomplete = () => resolve(count);
                transaction.onerror = () => reject(transaction.error);

                items.forEach(item => {
                    const request = store.put(item);
                    request.onsuccess = () => count++;
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Get storage usage estimate
     * @returns {Promise<Object>} Storage estimate
     */
    async getStorageEstimate() {
        if (!navigator.storage || !navigator.storage.estimate) {
            return { usage: 0, quota: 0, percent: 0 };
        }

        try {
            const estimate = await navigator.storage.estimate();
            return {
                usage: estimate.usage || 0,
                quota: estimate.quota || 0,
                percent: estimate.quota ? (estimate.usage / estimate.quota) * 100 : 0
            };
        } catch (error) {
            logError('Storage estimate', error);
            return { usage: 0, quota: 0, percent: 0 };
        }
    }
}

// ========================================
// Storage Manager Class
// ========================================
class StorageManager {
    constructor() {
        this.strategy = 'indexeddb';
        this.idb = null;
        this.fallbackActive = false;
        this.storageEstimate = { usage: 0, quota: 0, percent: 0 };
    }

    /**
     * Initialize storage system
     * @returns {Promise<boolean>} Success status
     */
    async init() {
        // Try IndexedDB first
        try {
            this.idb = new IndexedDBHelper(STORAGE_CONFIG.dbName, STORAGE_CONFIG.dbVersion);
            const success = await this.idb.init();

            if (success) {
                this.strategy = 'indexeddb';
                this.fallbackActive = false;
                this.storageEstimate = await this.idb.getStorageEstimate();
                console.log('[Storage] Using IndexedDB');
                console.log('[Storage] Usage:', this.storageEstimate);
                return true;
            }
        } catch (error) {
            console.warn('[Storage] IndexedDB failed, falling back to localStorage', error);
        }

        // Fallback to localStorage
        try {
            this.strategy = 'localstorage';
            this.fallbackActive = true;
            console.log('[Storage] Using localStorage fallback');
            return true;
        } catch (error) {
            logError('Storage initialization', error);
            return false;
        }
    }

    /**
     * Check if storage is available
     * @returns {boolean} Available status
     */
    isAvailable() {
        if (this.strategy === 'indexeddb') {
            return this.idb && this.idb.isAvailable;
        }
        
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get storage information
     * @returns {Object} Storage info
     */
    getStorageInfo() {
        return {
            strategy: this.strategy,
            fallbackActive: this.fallbackActive,
            available: this.isAvailable(),
            estimate: this.storageEstimate
        };
    }

    // ========================================
    // Entries Operations
    // ========================================

    /**
     * Save all entries
     * @param {Array} entries - Entries to save
     * @returns {Promise<boolean>} Success status
     */
    async saveEntries(entries) {
        try {
            if (this.strategy === 'indexeddb') {
                await this.idb.clear('entries');
                const saved = await this.idb.batchPut('entries', entries);
                console.log(`[Storage] Saved ${saved} entries to IndexedDB`);
                return true;
            } else {
                localStorage.setItem('entries', JSON.stringify(entries));
                return true;
            }
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                throw new Error('QUOTA_EXCEEDED');
            }
            logError('Save entries', error);
            throw error;
        }
    }

    /**
     * Load all entries
     * @returns {Promise<Array>} Entries
     */
    async loadEntries() {
        try {
            if (this.strategy === 'indexeddb') {
                const entries = await this.idb.getAll('entries');
                return entries || [];
            } else {
                const data = localStorage.getItem('entries');
                return data ? JSON.parse(data) : [];
            }
        } catch (error) {
            logError('Load entries', error);
            return [];
        }
    }

    // ========================================
    // Settings Operations
    // ========================================

    /**
     * Save a setting
     * @param {string} key - Setting key
     * @param {any} value - Setting value
     * @returns {Promise<boolean>} Success status
     */
    async saveSetting(key, value) {
        try {
            if (this.strategy === 'indexeddb') {
                await this.idb.put('settings', { key, value });
                return true;
            } else {
                localStorage.setItem(`setting_${key}`, JSON.stringify(value));
                return true;
            }
        } catch (error) {
            logError('Save setting', error);
            return false;
        }
    }

    /**
     * Load a setting
     * @param {string} key - Setting key
     * @returns {Promise<any>} Setting value
     */
    async loadSetting(key) {
        try {
            if (this.strategy === 'indexeddb') {
                const result = await this.idb.get('settings', key);
                return result ? result.value : null;
            } else {
                const data = localStorage.getItem(`setting_${key}`);
                return data ? JSON.parse(data) : null;
            }
        } catch (error) {
            logError('Load setting', error);
            return null;
        }
    }

    // ========================================
    // Undo Operations
    // ========================================

    /**
     * Save undo action
     * @param {Object} action - Undo action
     * @returns {Promise<boolean>} Success status
     */
    async saveUndoAction(action) {
        try {
            action.timestamp = action.timestamp || Date.now();
            action.id = action.id || generateId();

            if (this.strategy === 'indexeddb') {
                await this.idb.add('undo', action);
                await this.cleanOldUndoActions();
                return true;
            } else {
                const undoStack = JSON.parse(localStorage.getItem('undoStack') || '[]');
                undoStack.push(action);
                
                // Clean old actions
                const cutoff = Date.now() - STORAGE_CONFIG.undoTTL;
                const filtered = undoStack
                    .filter(a => a.timestamp >= cutoff)
                    .slice(-STORAGE_CONFIG.maxUndoActions);
                
                localStorage.setItem('undoStack', JSON.stringify(filtered));
                return true;
            }
        } catch (error) {
            logError('Save undo action', error);
            return false;
        }
    }

    /**
     * Load all undo actions
     * @returns {Promise<Array>} Undo actions
     */
    async loadUndoActions() {
        try {
            if (this.strategy === 'indexeddb') {
                const actions = await this.idb.getAll('undo');
                return actions || [];
            } else {
                const data = localStorage.getItem('undoStack');
                return data ? JSON.parse(data) : [];
            }
        } catch (error) {
            logError('Load undo actions', error);
            return [];
        }
    }

    /**
     * Delete undo action
     * @param {string} id - Action ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteUndoAction(id) {
        try {
            if (this.strategy === 'indexeddb') {
                await this.idb.delete('undo', id);
                return true;
            } else {
                const undoStack = JSON.parse(localStorage.getItem('undoStack') || '[]');
                const filtered = undoStack.filter(a => a.id !== id);
                localStorage.setItem('undoStack', JSON.stringify(filtered));
                return true;
            }
        } catch (error) {
            logError('Delete undo action', error);
            return false;
        }
    }

    /**
     * Clean old undo actions
     * @returns {Promise<void>}
     */
    async cleanOldUndoActions() {
        try {
            const cutoff = Date.now() - STORAGE_CONFIG.undoTTL;
            const actions = await this.loadUndoActions();
            
            const toDelete = actions.filter(a => a.timestamp < cutoff);
            
            for (const action of toDelete) {
                await this.deleteUndoAction(action.id);
            }
            
            if (toDelete.length > 0) {
                console.log(`[Storage] Cleaned ${toDelete.length} old undo actions`);
            }
        } catch (error) {
            logError('Clean undo actions', error);
        }
    }

    // ========================================
    // Cache Operations
    // ========================================

    /**
     * Set cache value
     * @param {string} key - Cache key
     * @param {any} value - Cache value
     * @param {number} ttl - Time to live (ms)
     * @returns {Promise<boolean>} Success status
     */
    async setCache(key, value, ttl = STORAGE_CONFIG.cacheTTL) {
        try {
            const cacheItem = {
                key,
                value,
                timestamp: Date.now(),
                expires: Date.now() + ttl
            };

            if (this.strategy === 'indexeddb') {
                await this.idb.put('cache', cacheItem);
                return true;
            } else {
                localStorage.setItem(`cache_${key}`, JSON.stringify(cacheItem));
                return true;
            }
        } catch (error) {
            logError('Set cache', error);
            return false;
        }
    }

    /**
     * Get cache value
     * @param {string} key - Cache key
     * @returns {Promise<any>} Cache value or null
     */
    async getCache(key) {
        try {
            let cacheItem;

            if (this.strategy === 'indexeddb') {
                cacheItem = await this.idb.get('cache', key);
            } else {
                const data = localStorage.getItem(`cache_${key}`);
                cacheItem = data ? JSON.parse(data) : null;
            }

            if (!cacheItem) return null;

            // Check expiration
            if (Date.now() > cacheItem.expires) {
                await this.deleteCache(key);
                return null;
            }

            return cacheItem.value;
        } catch (error) {
            logError('Get cache', error);
            return null;
        }
    }

    /**
     * Delete cache value
     * @param {string} key - Cache key
     * @returns {Promise<boolean>} Success status
     */
    async deleteCache(key) {
        try {
            if (this.strategy === 'indexeddb') {
                await this.idb.delete('cache', key);
            } else {
                localStorage.removeItem(`cache_${key}`);
            }
            return true;
        } catch (error) {
            logError('Delete cache', error);
            return false;
        }
    }

    // ========================================
    // Bulk Operations
    // ========================================

    /**
     * Export all data
     * @returns {Promise<Object>} All data
     */
    async exportAllData() {
        try {
            const entries = await this.loadEntries();
            const sources = await this.loadSetting('sources');
            const insurances = await this.loadSetting('insurances');
            const userLabel = await this.loadSetting('userLabel');
            const eopyyDeductions = await this.loadSetting('eopyyDeductions');

            return {
                version: '2.0',
                exportDate: new Date().toISOString(),
                entries,
                sources,
                insurances,
                userLabel,
                eopyyDeductions
            };
        } catch (error) {
            logError('Export all data', error);
            throw error;
        }
    }

    /**
     * Clear all storage
     * @returns {Promise<Object>} Clear report
     */
    async clearAllStorage() {
        const report = {
            entries: false,
            settings: false,
            undo: false,
            cache: false,
            localStorage: false,
            errors: []
        };

        try {
            if (this.strategy === 'indexeddb' && this.idb) {
                // Clear IndexedDB stores
                try {
                    await this.idb.clear('entries');
                    report.entries = true;
                } catch (error) {
                    report.errors.push('Entries: ' + error.message);
                }

                try {
                    await this.idb.clear('settings');
                    report.settings = true;
                } catch (error) {
                    report.errors.push('Settings: ' + error.message);
                }

                try {
                    await this.idb.clear('undo');
                    report.undo = true;
                } catch (error) {
                    report.errors.push('Undo: ' + error.message);
                }

                try {
                    await this.idb.clear('cache');
                    report.cache = true;
                } catch (error) {
                    report.errors.push('Cache: ' + error.message);
                }
            }

            // Clear localStorage
            try {
                localStorage.clear();
                report.localStorage = true;
            } catch (error) {
                report.errors.push('localStorage: ' + error.message);
            }

            // Clear Service Worker caches
            if ('caches' in window) {
                try {
                    const cacheNames = await caches.keys();
                    await Promise.all(cacheNames.map(name => caches.delete(name)));
                    console.log('[Storage] Service Worker caches cleared');
                } catch (error) {
                    report.errors.push('Service Worker: ' + error.message);
                }
            }

            return report;
        } catch (error) {
            logError('Clear all storage', error);
            report.errors.push('General: ' + error.message);
            return report;
        }
    }
}

// ========================================
// Singleton Instance
// ========================================
const storageManager = new StorageManager();

// ========================================
// Export
// ========================================
export { StorageManager, STORAGE_CONFIG };
export default storageManager;
