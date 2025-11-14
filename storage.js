/**
 * storage.js - Storage Management Module
 * Î”Î¹Î±Ï‡ÎµÎ¯ÏÎ¹ÏƒÎ· IndexedDB Î¼Îµ localStorage fallback ÎºÎ±Î¹ graceful degradations
 */

import { logError, generateId } from './utils.js';

// ========================================
// Configuration
// ========================================
const CONFIG = {
    dbName: 'RevenueDB',
    dbVersion: 2,
    storeName: {
        entries: 'entries',
        settings: 'settings',
        undo: 'undo',
        cache: 'cache'
    },
    undoTTL: 30 * 60 * 1000, // 30 minutes
    maxUndoActions: 50
};

// ========================================
// IndexedDB Helper Class
// ========================================
class IndexedDBHelper {
    constructor(dbName, version) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
        this.isAvailable = true;
    }

    async init() {
        try {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.version);

                request.onerror = () => {
                    this.isAvailable = false;
                    logError('IndexedDB', request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    this.db = request.result;
                    this.isAvailable = true;
                    console.log('IndexedDB initialized successfully');
                    resolve(true);
                };

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    
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

                    if (!db.objectStoreNames.contains('settings')) {
                        db.createObjectStore('settings', { keyPath: 'key' });
                    }

                    if (!db.objectStoreNames.contains('undo')) {
                        const undoStore = db.createObjectStore('undo', { 
                            keyPath: 'id', 
                            autoIncrement: false 
                        });
                        undoStore.createIndex('timestamp', 'timestamp', { unique: false });
                    }

                    if (!db.objectStoreNames.contains('cache')) {
                        const cacheStore = db.createObjectStore('cache', { keyPath: 'key' });
                        cacheStore.createIndex('timestamp', 'timestamp', { unique: false });
                    }
                };
            });
        } catch (error) {
            this.isAvailable = false;
            logError('IndexedDB init', error);
            return false;
        }
    }

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

    async init() {
        try {
            this.idb = new IndexedDBHelper(CONFIG.dbName, CONFIG.dbVersion);
            const success = await this.idb.init();

            if (success) {
                this.strategy = 'indexeddb';
                this.fallbackActive = false;
                console.log('Using IndexedDB storage');
                
                this.storageEstimate = await this.idb.getStorageEstimate();
                console.log('Storage usage:', this.storageEstimate);
                
                return true;
            }
        } catch (error) {
            console.warn('IndexedDB failed, falling back to localStorage', error);
        }

        try {
            this.strategy = 'localstorage';
            this.fallbackActive = true;
            console.log('Using localStorage fallback');
            return true;
        } catch (error) {
            logError('Storage initialization', error);
            return false;
        }
    }

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

    getStorageInfo() {
        return {
            strategy: this.strategy,
            fallbackActive: this.fallbackActive,
            available: this.isAvailable(),
            estimate: this.storageEstimate
        };
    }

    async saveEntries(entries) {
        try {
            if (this.strategy === 'indexeddb') {
                await this.idb.clear('entries');
                const saved = await this.idb.batchPut('entries', entries);
                console.log(`Saved ${saved} entries to IndexedDB`);
                return true;
            } else {
                localStorage.setItem('entries', JSON.stringify(entries));
                return true;
            }
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                console.error('Storage quota exceeded');
                throw new Error('QUOTA_EXCEEDED');
            }
            logError('Save entries', error);
            throw error;
        }
    }

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
                
                const cutoff = Date.now() - CONFIG.undoTTL;
                const filtered = undoStack
                    .filter(a => a.timestamp >= cutoff)
                    .slice(-CONFIG.maxUndoActions);
                
                localStorage.setItem('undoStack', JSON.stringify(filtered));
                return true;
            }
        } catch (error) {
            logError('Save undo action', error);
            return false;
        }
    }

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

    async cleanOldUndoActions() {
        try {
            const cutoff = Date.now() - CONFIG.undoTTL;
            const actions = await this.loadUndoActions();
            
            const toDelete = actions.filter(a => a.timestamp < cutoff);
            
            for (const action of toDelete) {
                await this.deleteUndoAction(action.id);
            }
            
            console.log(`Cleaned ${toDelete.length} old undo actions`);
        } catch (error) {
            logError('Clean undo actions', error);
        }
    }

    async setCache(key, value, ttl = 3600000) {
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

    async exportAllData() {
        try {
            const entries = await this.loadEntries();
            const sources = await this.loadSetting('sources');
            const insurances = await this.loadSetting('insurances');
            const userLabel = await this.loadSetting('userLabel');

            return {
                version: '1.0',
                exportDate: new Date().toISOString(),
                entries,
                sources,
                insurances,
                userLabel
            };
        } catch (error) {
            logError('Export all data', error);
            throw error;
        }
    }

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

            try {
                localStorage.clear();
                report.localStorage = true;
            } catch (error) {
                report.errors.push('localStorage: ' + error.message);
            }

            if ('caches' in window) {
                try {
                    const cacheNames = await caches.keys();
                    await Promise.all(cacheNames.map(name => caches.delete(name)));
                    console.log('Service Worker caches cleared');
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
// Exports
// ========================================
export default storageManager;