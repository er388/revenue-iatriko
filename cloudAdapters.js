/**
 * cloudAdapters.js - Cloud Storage Integration Module
 * Supports Google Drive, Dropbox, OneDrive with OAuth2 PKCE
 * Version: 2.0
 */

import { STATE } from './state.js';
import storage from './storage.js';
import backupManager from './backup.js';
import { logError, generateId, formatDateTime } from './utils.js';

// ========================================
// Configuration
// ========================================
const CLOUD_CONFIG = {
    // OAuth2 endpoints and client IDs
    providers: {
        googledrive: {
            name: 'Google Drive',
            authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
            tokenUrl: 'https://oauth2.googleapis.com/token',
            apiUrl: 'https://www.googleapis.com/drive/v3',
            uploadUrl: 'https://www.googleapis.com/upload/drive/v3',
            clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
            scope: 'https://www.googleapis.com/auth/drive.file',
            redirectUri: window.location.origin + '/oauth-callback.html'
        },
        dropbox: {
            name: 'Dropbox',
            authUrl: 'https://www.dropbox.com/oauth2/authorize',
            tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
            apiUrl: 'https://api.dropboxapi.com/2',
            clientId: 'YOUR_DROPBOX_CLIENT_ID',
            scope: 'files.content.write files.content.read',
            redirectUri: window.location.origin + '/oauth-callback.html'
        },
        onedrive: {
            name: 'OneDrive',
            authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
            tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
            apiUrl: 'https://graph.microsoft.com/v1.0',
            clientId: 'YOUR_ONEDRIVE_CLIENT_ID',
            scope: 'Files.ReadWrite.All offline_access',
            redirectUri: window.location.origin + '/oauth-callback.html'
        }
    },
    
    // Sync settings
    autoSyncInterval: 15 * 60 * 1000, // 15 minutes
    conflictResolution: 'last-write-wins', // 'last-write-wins' | 'manual'
    backupFolder: 'Revenue Management Backups',
    maxBackupsToKeep: 10
};

// ========================================
// Base Cloud Adapter Class
// ========================================
class CloudAdapter {
    constructor(providerConfig) {
        this.config = providerConfig;
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiry = null;
        this.isAuthenticated = false;
        
        // Load saved tokens
        this.loadTokens();
    }

    /**
     * Load tokens from storage
     */
    async loadTokens() {
        try {
            const tokens = await storage.loadSetting(`${this.config.name}_tokens`);
            if (tokens) {
                this.accessToken = tokens.accessToken;
                this.refreshToken = tokens.refreshToken;
                this.tokenExpiry = tokens.expiry;
                this.isAuthenticated = Date.now() < this.tokenExpiry;
            }
        } catch (error) {
            logError('Load tokens', error);
        }
    }

    /**
     * Save tokens to storage
     */
    async saveTokens() {
        try {
            await storage.saveSetting(`${this.config.name}_tokens`, {
                accessToken: this.accessToken,
                refreshToken: this.refreshToken,
                expiry: this.tokenExpiry
            });
        } catch (error) {
            logError('Save tokens', error);
        }
    }

    /**
     * Generate PKCE challenge
     */
    async generatePKCE() {
        const verifier = this.generateCodeVerifier();
        const challenge = await this.generateCodeChallenge(verifier);
        
        // Store verifier for later use
        sessionStorage.setItem('pkce_verifier', verifier);
        
        return { verifier, challenge };
    }

    /**
     * Generate code verifier (random string)
     */
    generateCodeVerifier() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return this.base64UrlEncode(array);
    }

    /**
     * Generate code challenge from verifier
     */
    async generateCodeChallenge(verifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return this.base64UrlEncode(new Uint8Array(hash));
    }

    /**
     * Base64 URL encoding
     */
    base64UrlEncode(buffer) {
        const base64 = btoa(String.fromCharCode.apply(null, buffer));
        return base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    /**
     * Authenticate with OAuth2 PKCE
     */
    async authenticate() {
        try {
            // Generate PKCE challenge
            const { challenge } = await this.generatePKCE();
            
            // Build auth URL
            const params = new URLSearchParams({
                client_id: this.config.clientId,
                redirect_uri: this.config.redirectUri,
                response_type: 'code',
                scope: this.config.scope,
                code_challenge: challenge,
                code_challenge_method: 'S256',
                state: generateId() // CSRF protection
            });
            
            const authUrl = `${this.config.authUrl}?${params.toString()}`;
            
            // Open popup for authentication
            const popup = window.open(
                authUrl,
                'OAuth2 Authentication',
                'width=600,height=700,scrollbars=yes'
            );
            
            // Wait for callback
            return new Promise((resolve, reject) => {
                const checkClosed = setInterval(() => {
                    if (popup.closed) {
                        clearInterval(checkClosed);
                        reject(new Error('Authentication cancelled'));
                    }
                }, 1000);
                
                // Listen for callback message
                window.addEventListener('message', async (event) => {
                    if (event.origin !== window.location.origin) return;
                    
                    clearInterval(checkClosed);
                    popup.close();
                    
                    if (event.data.error) {
                        reject(new Error(event.data.error));
                    } else if (event.data.code) {
                        // Exchange code for token
                        await this.exchangeCodeForToken(event.data.code);
                        resolve(true);
                    }
                }, { once: true });
            });
            
        } catch (error) {
            logError('Authentication', error);
            throw error;
        }
    }

    /**
     * Exchange authorization code for access token
     */
    async exchangeCodeForToken(code) {
        throw new Error('Must be implemented by subclass');
    }

    /**
     * Refresh access token
     */
    async refreshAccessToken() {
        throw new Error('Must be implemented by subclass');
    }

    /**
     * Check if token is expired and refresh if needed
     */
    async ensureValidToken() {
        if (Date.now() >= this.tokenExpiry - 60000) { // Refresh 1 min before expiry
            await this.refreshAccessToken();
        }
    }

    /**
     * Make authenticated API request
     */
    async makeRequest(endpoint, options = {}) {
        await this.ensureValidToken();
        
        const headers = {
            'Authorization': `Bearer ${this.accessToken}`,
            ...options.headers
        };
        
        const response = await fetch(endpoint, {
            ...options,
            headers
        });
        
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        
        return response.json();
    }

    /**
     * Upload file to cloud
     */
    async upload(data, filename) {
        throw new Error('Must be implemented by subclass');
    }

    /**
     * Download file from cloud
     */
    async download(fileId) {
        throw new Error('Must be implemented by subclass');
    }

    /**
     * List files in cloud folder
     */
    async list() {
        throw new Error('Must be implemented by subclass');
    }

    /**
     * Delete file from cloud
     */
    async delete(fileId) {
        throw new Error('Must be implemented by subclass');
    }

    /**
     * Logout (revoke tokens)
     */
    async logout() {
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiry = null;
        this.isAuthenticated = false;
        
        await storage.saveSetting(`${this.config.name}_tokens`, null);
    }
}

// ========================================
// Google Drive Adapter
// ========================================
class GoogleDriveAdapter extends CloudAdapter {
    constructor() {
        super(CLOUD_CONFIG.providers.googledrive);
    }

    async exchangeCodeForToken(code) {
        const verifier = sessionStorage.getItem('pkce_verifier');
        
        const response = await fetch(this.config.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: this.config.clientId,
                code: code,
                code_verifier: verifier,
                redirect_uri: this.config.redirectUri,
                grant_type: 'authorization_code'
            })
        });
        
        const data = await response.json();
        
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token;
        this.tokenExpiry = Date.now() + (data.expires_in * 1000);
        this.isAuthenticated = true;
        
        await this.saveTokens();
        sessionStorage.removeItem('pkce_verifier');
    }

    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }
        
        const response = await fetch(this.config.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: this.config.clientId,
                refresh_token: this.refreshToken,
                grant_type: 'refresh_token'
            })
        });
        
        const data = await response.json();
        
        this.accessToken = data.access_token;
        this.tokenExpiry = Date.now() + (data.expires_in * 1000);
        
        await this.saveTokens();
    }

    async upload(data, filename) {
        await this.ensureValidToken();
        
        // First, create folder if doesn't exist
        const folderId = await this.ensureFolder(CLOUD_CONFIG.backupFolder);
        
        // Upload file
        const metadata = {
            name: filename,
            parents: [folderId],
            mimeType: 'application/json'
        };
        
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }));
        
        const response = await fetch(`${this.config.uploadUrl}/files?uploadType=multipart`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            },
            body: form
        });
        
        return response.json();
    }

    async download(fileId) {
        const response = await this.makeRequest(
            `${this.config.apiUrl}/files/${fileId}?alt=media`
        );
        
        return response;
    }

    async list() {
        const folderId = await this.ensureFolder(CLOUD_CONFIG.backupFolder);
        
        const response = await this.makeRequest(
            `${this.config.apiUrl}/files?q='${folderId}'+in+parents&orderBy=modifiedTime+desc`
        );
        
        return response.files || [];
    }

    async delete(fileId) {
        await this.makeRequest(
            `${this.config.apiUrl}/files/${fileId}`,
            { method: 'DELETE' }
        );
    }

    /**
     * Ensure folder exists, create if not
     */
    async ensureFolder(folderName) {
        // Search for folder
        const searchResponse = await this.makeRequest(
            `${this.config.apiUrl}/files?q=name='${folderName}'+and+mimeType='application/vnd.google-apps.folder'`
        );
        
        if (searchResponse.files && searchResponse.files.length > 0) {
            return searchResponse.files[0].id;
        }
        
        // Create folder
        const createResponse = await fetch(`${this.config.apiUrl}/files`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder'
            })
        });
        
        const folder = await createResponse.json();
        return folder.id;
    }
}

// ========================================
// Dropbox Adapter
// ========================================
class DropboxAdapter extends CloudAdapter {
    constructor() {
        super(CLOUD_CONFIG.providers.dropbox);
    }

    async exchangeCodeForToken(code) {
        const verifier = sessionStorage.getItem('pkce_verifier');
        
        const response = await fetch(this.config.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: this.config.clientId,
                code: code,
                code_verifier: verifier,
                redirect_uri: this.config.redirectUri,
                grant_type: 'authorization_code'
            })
        });
        
        const data = await response.json();
        
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token;
        this.tokenExpiry = Date.now() + (data.expires_in * 1000);
        this.isAuthenticated = true;
        
        await this.saveTokens();
        sessionStorage.removeItem('pkce_verifier');
    }

    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }
        
        const response = await fetch(this.config.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: this.config.clientId,
                refresh_token: this.refreshToken,
                grant_type: 'refresh_token'
            })
        });
        
        const data = await response.json();
        
        this.accessToken = data.access_token;
        this.tokenExpiry = Date.now() + (data.expires_in * 1000);
        
        await this.saveTokens();
    }

    async upload(data, filename) {
        await this.ensureValidToken();
        
        const path = `/${CLOUD_CONFIG.backupFolder}/${filename}`;
        
        const response = await fetch(`${this.config.apiUrl}/files/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/octet-stream',
                'Dropbox-API-Arg': JSON.stringify({
                    path: path,
                    mode: 'add',
                    autorename: true
                })
            },
            body: JSON.stringify(data)
        });
        
        return response.json();
    }

    async download(path) {
        await this.ensureValidToken();
        
        const response = await fetch(`${this.config.apiUrl}/files/download`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Dropbox-API-Arg': JSON.stringify({ path })
            }
        });
        
        return response.json();
    }

    async list() {
        await this.ensureValidToken();
        
        const response = await fetch(`${this.config.apiUrl}/files/list_folder`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                path: `/${CLOUD_CONFIG.backupFolder}`
            })
        });
        
        const data = await response.json();
        return data.entries || [];
    }

    async delete(path) {
        await this.ensureValidToken();
        
        await fetch(`${this.config.apiUrl}/files/delete_v2`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ path })
        });
    }
}

// ========================================
// OneDrive Adapter
// ========================================
class OneDriveAdapter extends CloudAdapter {
    constructor() {
        super(CLOUD_CONFIG.providers.onedrive);
    }

    async exchangeCodeForToken(code) {
        const verifier = sessionStorage.getItem('pkce_verifier');
        
        const response = await fetch(this.config.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: this.config.clientId,
                code: code,
                code_verifier: verifier,
                redirect_uri: this.config.redirectUri,
                grant_type: 'authorization_code'
            })
        });
        
        const data = await response.json();
        
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token;
        this.tokenExpiry = Date.now() + (data.expires_in * 1000);
        this.isAuthenticated = true;
        
        await this.saveTokens();
        sessionStorage.removeItem('pkce_verifier');
    }

    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }
        
        const response = await fetch(this.config.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: this.config.clientId,
                refresh_token: this.refreshToken,
                grant_type: 'refresh_token'
            })
        });
        
        const data = await response.json();
        
        this.accessToken = data.access_token;
        this.tokenExpiry = Date.now() + (data.expires_in * 1000);
        
        await this.saveTokens();
    }

    async upload(data, filename) {
        await this.ensureValidToken();
        
        const folderId = await this.ensureFolder(CLOUD_CONFIG.backupFolder);
        const path = `/me/drive/items/${folderId}:/${filename}:/content`;
        
        const response = await fetch(`${this.config.apiUrl}${path}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        return response.json();
    }

    async download(itemId) {
        const response = await this.makeRequest(
            `${this.config.apiUrl}/me/drive/items/${itemId}/content`
        );
        
        return response;
    }

    async list() {
        const folderId = await this.ensureFolder(CLOUD_CONFIG.backupFolder);
        
        const response = await this.makeRequest(
            `${this.config.apiUrl}/me/drive/items/${folderId}/children`
        );
        
        return response.value || [];
    }

    async delete(itemId) {
        await this.makeRequest(
            `${this.config.apiUrl}/me/drive/items/${itemId}`,
            { method: 'DELETE' }
        );
    }

    /**
     * Ensure folder exists, create if not
     */
    async ensureFolder(folderName) {
        // Search for folder
        const searchResponse = await this.makeRequest(
            `${this.config.apiUrl}/me/drive/root/children?$filter=name eq '${folderName}' and folder ne null`
        );
        
        if (searchResponse.value && searchResponse.value.length > 0) {
            return searchResponse.value[0].id;
        }
        
        // Create folder
        const createResponse = await fetch(`${this.config.apiUrl}/me/drive/root/children`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: folderName,
                folder: {}
            })
        });
        
        const folder = await createResponse.json();
        return folder.id;
    }
}

// ========================================
// Cloud Sync Manager
// ========================================
class CloudSyncManager {
    constructor() {
        this.adapters = new Map();
        this.autoSyncTimer = null;
        this.lastSyncTimestamp = {};
        
        // Register adapters
        this.registerAdapter('googledrive', new GoogleDriveAdapter());
        this.registerAdapter('dropbox', new DropboxAdapter());
        this.registerAdapter('onedrive', new OneDriveAdapter());
        
        // Load last sync timestamps
        this.loadSyncTimestamps();
    }

    /**
     * Register a cloud adapter
     */
    registerAdapter(name, adapter) {
        this.adapters.set(name, adapter);
    }

    /**
     * Get adapter by name
     */
    getAdapter(name) {
        return this.adapters.get(name);
    }

    /**
     * Load sync timestamps from storage
     */
    async loadSyncTimestamps() {
        try {
            const timestamps = await storage.loadSetting('cloud_sync_timestamps');
            if (timestamps) {
                this.lastSyncTimestamp = timestamps;
            }
        } catch (error) {
            logError('Load sync timestamps', error);
        }
    }

    /**
     * Save sync timestamps to storage
     */
    async saveSyncTimestamps() {
        try {
            await storage.saveSetting('cloud_sync_timestamps', this.lastSyncTimestamp);
        } catch (error) {
            logError('Save sync timestamps', error);
        }
    }

    /**
     * Sync data to cloud
     */
    async syncToCloud(provider) {
        try {
            const adapter = this.getAdapter(provider);
            if (!adapter) {
                throw new Error(`Unknown provider: ${provider}`);
            }

            if (!adapter.isAuthenticated) {
                throw new Error('Not authenticated. Please login first.');
            }

            // Create backup
            const backup = await backupManager.createBackup();
            
            // Generate filename
            const filename = `backup_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
            
            // Upload to cloud
            await adapter.upload(backup, filename);
            
            // Update timestamp
            this.lastSyncTimestamp[provider] = Date.now();
            await this.saveSyncTimestamps();
            
            // Clean old backups
            await this.cleanOldBackups(provider);
            
            console.log(`[Cloud] Synced to ${provider}`);
            return { success: true, filename };
            
        } catch (error) {
            logError(`Sync to ${provider}`, error);
            throw error;
        }
    }

    /**
     * Restore data from cloud
     */
    async restoreFromCloud(provider, fileId) {
        try {
            const adapter = this.getAdapter(provider);
            if (!adapter) {
                throw new Error(`Unknown provider: ${provider}`);
            }

            if (!adapter.isAuthenticated) {
                throw new Error('Not authenticated. Please login first.');
            }

            // Download from cloud
            const backup = await adapter.download(fileId);
            
            // Import backup
            const mode = CLOUD_CONFIG.conflictResolution === 'last-write-wins' 
                ? 'overwrite' 
                : 'merge';
            
            const report = await backupManager.importBackup(
                new File([JSON.stringify(backup)], 'cloud-backup.json'),
                mode
            );
            
            console.log(`[Cloud] Restored from ${provider}`);
            return report;
            
        } catch (error) {
            logError(`Restore from ${provider}`, error);
            throw error;
        }
    }

    /**
     * List backups in cloud
     */
    async listBackups(provider) {
        try {
            const adapter = this.getAdapter(provider);
            if (!adapter) {
                throw new Error(`Unknown provider: ${provider}`);
            }

            if (!adapter.isAuthenticated) {
                throw new Error('Not authenticated. Please login first.');
            }

            return await adapter.list();
            
        } catch (error) {
            logError(`List backups from ${provider}`, error);
            throw error;
        }
    }

    /**
     * Clean old backups (keep only latest N)
     */
    async cleanOldBackups(provider) {
        try {
            const adapter = this.getAdapter(provider);
            const backups = await adapter.list();
            
            // Sort by date (newest first)
            backups.sort((a, b) => {
                const dateA = new Date(a.modifiedTime || a.client_modified || a.lastModifiedDateTime);
                const dateB = new Date(b.modifiedTime || b.client_modified || b.lastModifiedDateTime);
                return dateB - dateA;
            });
            
            // Delete old backups
            const toDelete = backups.slice(CLOUD_CONFIG.maxBackupsToKeep);
            
            for (const backup of toDelete) {
                await adapter.delete(backup.id || backup.path_display || backup.id);
            }
            
            if (toDelete.length > 0) {
                console.log(`[Cloud] Cleaned ${toDelete.length} old backups from ${provider}`);
            }
            
        } catch (error) {
            logError(`Clean old backups from ${provider}`, error);
        }
    }

    /**
     * Enable auto-sync
     */
    enableAutoSync(provider, interval = CLOUD_CONFIG.autoSyncInterval) {
        this.disableAutoSync();
        
        this.autoSyncTimer = setInterval(async () => {
            try {
                await this.syncToCloud(provider);
            } catch (error) {
                console.warn('[Cloud] Auto-sync failed:', error);
            }
        }, interval);
        
        console.log(`[Cloud] Auto-sync enabled for ${provider} (interval: ${interval}ms)`);
    }

    /**
     * Disable auto-sync
     */
    disableAutoSync() {
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
            this.autoSyncTimer = null;
            console.log('[Cloud] Auto-sync disabled');
        }
    }

    /**
     * Get sync status
     */
    getSyncStatus(provider) {
        const adapter = this.getAdapter(provider);
        return {
            provider: provider,
            authenticated: adapter?.isAuthenticated || false,
            lastSync: this.lastSyncTimestamp[provider] 
                ? formatDateTime(this.lastSyncTimestamp[provider])
                : 'Ποτέ'
        };
    }
}

// ========================================
// Singleton Instance
// ========================================
const cloudSyncManager = new CloudSyncManager();

// ========================================
// Export
// ========================================
export { 
    CloudAdapter, 
    GoogleDriveAdapter, 
    DropboxAdapter, 
    OneDriveAdapter, 
    CloudSyncManager,
    CLOUD_CONFIG 
};
export default cloudSyncManager;