/**
 * cloudAdapters.js - Cloud Storage Sync Module
 * OAuth2 PKCE authentication for multiple providers
 * Version: 1.0
 */

import { STATE } from './state.js';
import storage from './storage.js';
import { showToast } from './uiRenderers.js';
import { escapeHtml } from './utils.js';

/**
 * Cloud Sync Manager - Main Class
 */
class CloudSyncManager {
    constructor() {
        // OAuth2 configurations
        this.providers = {
            gdrive: {
                name: 'Google Drive',
                icon: '📁',
                clientId: '', // User must configure
                authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
                tokenEndpoint: 'https://oauth2.googleapis.com/token',
                scopes: ['https://www.googleapis.com/auth/drive.file'],
                apiBase: 'https://www.googleapis.com/drive/v3'
            },
            dropbox: {
                name: 'Dropbox',
                icon: '📦',
                clientId: '', // User must configure
                authEndpoint: 'https://www.dropbox.com/oauth2/authorize',
                tokenEndpoint: 'https://api.dropboxapi.com/oauth2/token',
                scopes: ['files.content.write', 'files.content.read'],
                apiBase: 'https://api.dropboxapi.com/2'
            },
            onedrive: {
                name: 'OneDrive',
                icon: '☁️',
                clientId: '', // User must configure
                authEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
                tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
                scopes: ['files.readwrite', 'offline_access'],
                apiBase: 'https://graph.microsoft.com/v1.0'
            }
        };
        
        // Sync state
        this.syncState = {
            activeProvider: null,
            lastSync: null,
            autoSyncInterval: null,
            isSyncing: false
        };
        
        // Adapters
        this.adapters = {
            gdrive: new GoogleDriveAdapter(this.providers.gdrive),
            dropbox: new DropboxAdapter(this.providers.dropbox),
            onedrive: new OneDriveAdapter(this.providers.onedrive)
        };
        
        // Default sync interval (minutes)
        this.syncIntervals = [
            { value: 0, label: 'Μη αυτόματο' },
            { value: 5, label: '5 λεπτά' },
            { value: 15, label: '15 λεπτά' },
            { value: 30, label: '30 λεπτά' },
            { value: 60, label: '1 ώρα' }
        ];
        
        console.log('☁️ CloudSyncManager initialized');
    }

    /**
     * Authenticate with provider
     */
    async authenticate(provider) {
        console.log(`🔐 Authenticating with ${provider}...`);
        
        if (!this.providers[provider]) {
            throw new Error('Άγνωστος provider');
        }
        
        const adapter = this.adapters[provider];
        if (!adapter) {
            throw new Error('Adapter δεν βρέθηκε');
        }
        
        try {
            const result = await adapter.authenticate();
            
            if (result.success) {
                this.syncState.activeProvider = provider;
                await this.saveProviderConfig(provider, result.tokens);
                
                console.log('✅ Authentication successful');
                return { success: true, provider };
            } else {
                throw new Error(result.error || 'Authentication failed');
            }
        } catch (error) {
            console.error('Authentication error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Disconnect from provider
     */
    async disconnect(provider) {
        console.log(`🔌 Disconnecting from ${provider}...`);
        
        try {
            // Clear tokens
            await storage.saveSetting(`cloud_${provider}_tokens`, null);
            
            // Stop auto-sync if active
            if (this.syncState.activeProvider === provider) {
                this.stopAutoSync();
                this.syncState.activeProvider = null;
            }
            
            console.log('✅ Disconnected successfully');
            return { success: true };
        } catch (error) {
            console.error('Disconnect error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Sync data (upload/download)
     */
    async sync(provider, strategy = 'last-write-wins') {
        console.log(`🔄 Syncing with ${provider} (${strategy})...`);
        
        if (this.syncState.isSyncing) {
            console.warn('Sync already in progress');
            return { success: false, error: 'Sync σε εξέλιξη' };
        }
        
        this.syncState.isSyncing = true;
        
        try {
            const adapter = this.adapters[provider];
            if (!adapter) {
                throw new Error('Adapter δεν βρέθηκε');
            }
            
            // Check authentication
            const isAuth = await this.checkAuthentication(provider);
            if (!isAuth) {
                throw new Error('Δεν έχετε συνδεθεί');
            }
            
            // Get local data
            const localData = await this.getLocalBackup();
            
            // Download remote data
            const remoteData = await adapter.download();
            
            // Resolve conflicts based on strategy
            let finalData;
            if (strategy === 'last-write-wins') {
                finalData = this.resolveLastWriteWins(localData, remoteData);
            } else if (strategy === 'merge') {
                finalData = this.resolveMerge(localData, remoteData);
            } else {
                throw new Error('Άγνωστη στρατηγική');
            }
            
            // Upload merged data
            await adapter.upload(finalData);
            
            // Apply locally if needed
            if (strategy !== 'last-write-wins' || remoteData.timestamp > localData.timestamp) {
                await this.applyBackup(finalData);
            }
            
            // Update sync state
            this.syncState.lastSync = Date.now();
            await storage.saveSetting('cloud_last_sync', this.syncState.lastSync);
            
            console.log('✅ Sync completed');
            
            return {
                success: true,
                timestamp: this.syncState.lastSync,
                strategy,
                conflicts: finalData.conflicts || 0
            };
            
        } catch (error) {
            console.error('Sync error:', error);
            return { success: false, error: error.message };
        } finally {
            this.syncState.isSyncing = false;
        }
    }

    /**
     * Start auto-sync
     */
    startAutoSync(intervalMinutes) {
        if (intervalMinutes <= 0) {
            console.log('Auto-sync disabled');
            return;
        }
        
        // Clear existing interval
        this.stopAutoSync();
        
        const intervalMs = intervalMinutes * 60 * 1000;
        
        this.syncState.autoSyncInterval = setInterval(async () => {
            console.log('⏰ Auto-sync triggered');
            
            if (this.syncState.activeProvider) {
                const result = await this.sync(
                    this.syncState.activeProvider,
                    'last-write-wins'
                );
                
                if (result.success) {
                    showToast('Auto-sync ολοκληρώθηκε', 'success');
                } else {
                    console.error('Auto-sync failed:', result.error);
                }
            }
        }, intervalMs);
        
        console.log(`⏰ Auto-sync started: ${intervalMinutes} minutes`);
    }

    /**
     * Stop auto-sync
     */
    stopAutoSync() {
        if (this.syncState.autoSyncInterval) {
            clearInterval(this.syncState.autoSyncInterval);
            this.syncState.autoSyncInterval = null;
            console.log('⏸️ Auto-sync stopped');
        }
    }

    /**
     * Check if authenticated
     */
    async checkAuthentication(provider) {
        try {
            const tokens = await storage.getSetting(`cloud_${provider}_tokens`);
            return tokens && tokens.access_token;
        } catch {
            return false;
        }
    }

    /**
     * Get local backup data
     */
    async getLocalBackup() {
        return {
            version: '2.0',
            timestamp: Date.now(),
            entries: STATE.entries,
            sources: STATE.sources,
            insurances: STATE.insurances,
            userLabel: STATE.userLabel
        };
    }

    /**
     * Apply backup data locally
     */
    async applyBackup(data) {
        if (data.entries) STATE.entries = data.entries;
        if (data.sources) STATE.sources = data.sources;
        if (data.insurances) STATE.insurances = data.insurances;
        if (data.userLabel) STATE.userLabel = data.userLabel;
        
        await storage.saveEntries(STATE.entries);
        await storage.saveSetting('sources', STATE.sources);
        await storage.saveSetting('insurances', STATE.insurances);
        await storage.saveSetting('userLabel', STATE.userLabel);
    }

    /**
     * Resolve conflicts: Last Write Wins
     */
    resolveLastWriteWins(localData, remoteData) {
        if (!remoteData || !remoteData.timestamp) {
            return localData;
        }
        
        return localData.timestamp > remoteData.timestamp 
            ? localData 
            : remoteData;
    }

    /**
     * Resolve conflicts: Merge
     */
    resolveMerge(localData, remoteData) {
        if (!remoteData || !remoteData.entries) {
            return localData;
        }
        
        // Merge entries by ID
        const entriesMap = new Map();
        
        // Add local entries
        localData.entries.forEach(entry => {
            entriesMap.set(entry.id, entry);
        });
        
        // Merge remote entries
        let conflicts = 0;
        remoteData.entries.forEach(remoteEntry => {
            const localEntry = entriesMap.get(remoteEntry.id);
            
            if (!localEntry) {
                // New entry from remote
                entriesMap.set(remoteEntry.id, remoteEntry);
            } else {
                // Conflict: keep newer
                const remoteTime = new Date(remoteEntry.timestamp || 0).getTime();
                const localTime = new Date(localEntry.timestamp || 0).getTime();
                
                if (remoteTime > localTime) {
                    entriesMap.set(remoteEntry.id, remoteEntry);
                    conflicts++;
                }
            }
        });
        
        // Merge sources and insurances (union)
        const mergedSources = [...new Set([...localData.sources, ...(remoteData.sources || [])])];
        const mergedInsurances = [...new Set([...localData.insurances, ...(remoteData.insurances || [])])];
        
        return {
            version: '2.0',
            timestamp: Date.now(),
            entries: Array.from(entriesMap.values()),
            sources: mergedSources,
            insurances: mergedInsurances,
            userLabel: localData.userLabel,
            conflicts
        };
    }

    /**
     * Save provider config
     */
    async saveProviderConfig(provider, tokens) {
        await storage.saveSetting(`cloud_${provider}_tokens`, tokens);
        await storage.saveSetting('cloud_active_provider', provider);
    }

    /**
     * Get sync status
     */
    getSyncStatus() {
        return {
            activeProvider: this.syncState.activeProvider,
            lastSync: this.syncState.lastSync,
            isSyncing: this.syncState.isSyncing,
            autoSyncEnabled: this.syncState.autoSyncInterval !== null
        };
    }
}

/**
 * Base Cloud Adapter Class
 */
class CloudAdapter {
    constructor(config) {
        this.config = config;
        this.tokens = null;
    }

    /**
     * Generate PKCE challenge
     */
    async generatePKCE() {
        // Generate random code verifier
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        const codeVerifier = this.base64URLEncode(array);
        
        // Create SHA-256 hash
        const encoder = new TextEncoder();
        const data = encoder.encode(codeVerifier);
        const hash = await crypto.subtle.digest('SHA-256', data);
        
        // Base64 URL encode the hash
        const codeChallenge = this.base64URLEncode(new Uint8Array(hash));
        
        return { codeVerifier, codeChallenge };
    }

    /**
     * Base64 URL encode
     */
    base64URLEncode(buffer) {
        return btoa(String.fromCharCode(...buffer))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    /**
     * Open OAuth2 popup
     */
    openAuthPopup(url) {
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        
        return window.open(
            url,
            'oauth2',
            `width=${width},height=${height},left=${left},top=${top}`
        );
    }

    /**
     * Wait for OAuth2 callback
     */
    waitForCallback(popup) {
        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(() => {
                try {
                    if (popup.closed) {
                        clearInterval(checkInterval);
                        reject(new Error('Παράθυρο έκλεισε'));
                        return;
                    }
                    
                    // Check for callback URL
                    const url = popup.location.href;
                    if (url.includes('code=') || url.includes('error=')) {
                        clearInterval(checkInterval);
                        popup.close();
                        
                        const params = new URLSearchParams(url.split('?')[1]);
                        
                        if (params.has('error')) {
                            reject(new Error(params.get('error')));
                        } else {
                            resolve(params.get('code'));
                        }
                    }
                } catch (e) {
                    // Cross-origin error (expected until redirect)
                }
            }, 100);
            
            // Timeout after 5 minutes
            setTimeout(() => {
                clearInterval(checkInterval);
                if (!popup.closed) {
                    popup.close();
                }
                reject(new Error('Timeout'));
            }, 5 * 60 * 1000);
        });
    }
}

/**
 * Google Drive Adapter
 */
class GoogleDriveAdapter extends CloudAdapter {
    async authenticate() {
        console.log('🔐 Google Drive authentication...');
        
        if (!this.config.clientId) {
            return { 
                success: false, 
                error: 'Client ID δεν έχει ρυθμιστεί. Ρυθμίστε το στις Ρυθμίσεις Cloud.' 
            };
        }
        
        try {
            // Generate PKCE
            const { codeVerifier, codeChallenge } = await this.generatePKCE();
            
            // Store verifier
            sessionStorage.setItem('pkce_verifier', codeVerifier);
            
            // Build auth URL
            const redirectUri = `${window.location.origin}/oauth-callback.html`;
            const state = btoa(JSON.stringify({ provider: 'gdrive', timestamp: Date.now() }));
            
            const authUrl = new URL(this.config.authEndpoint);
            authUrl.searchParams.set('client_id', this.config.clientId);
            authUrl.searchParams.set('redirect_uri', redirectUri);
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('scope', this.config.scopes.join(' '));
            authUrl.searchParams.set('code_challenge', codeChallenge);
            authUrl.searchParams.set('code_challenge_method', 'S256');
            authUrl.searchParams.set('state', state);
            authUrl.searchParams.set('access_type', 'offline');
            authUrl.searchParams.set('prompt', 'consent');
            
            // Open popup
            const popup = this.openAuthPopup(authUrl.toString());
            
            // Wait for code
            const code = await this.waitForCallback(popup);
            
            // Exchange code for tokens
            const tokens = await this.exchangeCode(code, codeVerifier, redirectUri);
            
            this.tokens = tokens;
            
            return { success: true, tokens };
            
        } catch (error) {
            console.error('Google Drive auth error:', error);
            return { success: false, error: error.message };
        }
    }

    async exchangeCode(code, codeVerifier, redirectUri) {
        const response = await fetch(this.config.tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: this.config.clientId,
                code,
                code_verifier: codeVerifier,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            })
        });
        
        if (!response.ok) {
            throw new Error('Token exchange failed');
        }
        
        return response.json();
    }

    async upload(data) {
        // Upload to Google Drive
        const metadata = {
            name: 'revenue_backup.json',
            mimeType: 'application/json'
        };
        
        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }));
        
        const response = await fetch(`${this.config.apiBase}/files?uploadType=multipart`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.tokens.access_token}`
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Upload failed');
        }
        
        return response.json();
    }

    async download() {
        // Search for backup file
        const searchResponse = await fetch(
            `${this.config.apiBase}/files?q=name='revenue_backup.json'`,
            {
                headers: {
                    'Authorization': `Bearer ${this.tokens.access_token}`
                }
            }
        );
        
        if (!searchResponse.ok) {
            throw new Error('Search failed');
        }
        
        const searchData = await searchResponse.json();
        
        if (!searchData.files || searchData.files.length === 0) {
            return null; // No backup found
        }
        
        const fileId = searchData.files[0].id;
        
        // Download file
        const downloadResponse = await fetch(
            `${this.config.apiBase}/files/${fileId}?alt=media`,
            {
                headers: {
                    'Authorization': `Bearer ${this.tokens.access_token}`
                }
            }
        );
        
        if (!downloadResponse.ok) {
            throw new Error('Download failed');
        }
        
        return downloadResponse.json();
    }
}

/**
 * Dropbox Adapter
 */
class DropboxAdapter extends CloudAdapter {
    async authenticate() {
        console.log('🔐 Dropbox authentication...');
        
        if (!this.config.clientId) {
            return { 
                success: false, 
                error: 'Client ID δεν έχει ρυθμιστεί' 
            };
        }
        
        try {
            // Generate PKCE
            const { codeVerifier, codeChallenge } = await this.generatePKCE();
            
            sessionStorage.setItem('pkce_verifier', codeVerifier);
            
            const redirectUri = `${window.location.origin}/oauth-callback.html`;
            const state = btoa(JSON.stringify({ provider: 'dropbox', timestamp: Date.now() }));
            
            const authUrl = new URL(this.config.authEndpoint);
            authUrl.searchParams.set('client_id', this.config.clientId);
            authUrl.searchParams.set('redirect_uri', redirectUri);
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('code_challenge', codeChallenge);
            authUrl.searchParams.set('code_challenge_method', 'S256');
            authUrl.searchParams.set('state', state);
            authUrl.searchParams.set('token_access_type', 'offline');
            
            const popup = this.openAuthPopup(authUrl.toString());
            const code = await this.waitForCallback(popup);
            const tokens = await this.exchangeCode(code, codeVerifier, redirectUri);
            
            this.tokens = tokens;
            return { success: true, tokens };
            
        } catch (error) {
            console.error('Dropbox auth error:', error);
            return { success: false, error: error.message };
        }
    }

    async exchangeCode(code, codeVerifier, redirectUri) {
        const response = await fetch(this.config.tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: this.config.clientId,
                code,
                code_verifier: codeVerifier,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            })
        });
        
        if (!response.ok) {
            throw new Error('Token exchange failed');
        }
        
        return response.json();
    }

    async upload(data) {
        const response = await fetch(`${this.config.apiBase}/files/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.tokens.access_token}`,
                'Content-Type': 'application/octet-stream',
                'Dropbox-API-Arg': JSON.stringify({
                    path: '/revenue_backup.json',
                    mode: 'overwrite'
                })
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error('Upload failed');
        }
        
        return response.json();
    }

    async download() {
        const response = await fetch(`${this.config.apiBase}/files/download`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.tokens.access_token}`,
                'Dropbox-API-Arg': JSON.stringify({
                    path: '/revenue_backup.json'
                })
            }
        });
        
        if (!response.ok) {
            if (response.status === 409) {
                return null; // File not found
            }
            throw new Error('Download failed');
        }
        
        return response.json();
    }
}

/**
 * OneDrive Adapter
 */
class OneDriveAdapter extends CloudAdapter {
    async authenticate() {
        console.log('🔐 OneDrive authentication...');
        
        if (!this.config.clientId) {
            return { 
                success: false, 
                error: 'Client ID δεν έχει ρυθμιστεί' 
            };
        }
        
        try {
            const { codeVerifier, codeChallenge } = await this.generatePKCE();
            
            sessionStorage.setItem('pkce_verifier', codeVerifier);
            
            const redirectUri = `${window.location.origin}/oauth-callback.html`;
            const state = btoa(JSON.stringify({ provider: 'onedrive', timestamp: Date.now() }));
            
            const authUrl = new URL(this.config.authEndpoint);
            authUrl.searchParams.set('client_id', this.config.clientId);
            authUrl.searchParams.set('redirect_uri', redirectUri);
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('scope', this.config.scopes.join(' '));
            authUrl.searchParams.set('code_challenge', codeChallenge);
            authUrl.searchParams.set('code_challenge_method', 'S256');
            authUrl.searchParams.set('state', state);
            
            const popup = this.openAuthPopup(authUrl.toString());
            const code = await this.waitForCallback(popup);
            const tokens = await this.exchangeCode(code, codeVerifier, redirectUri);
            
            this.tokens = tokens;
            return { success: true, tokens };
            
        } catch (error) {
            console.error('OneDrive auth error:', error);
            return { success: false, error: error.message };
        }
    }

    async exchangeCode(code, codeVerifier, redirectUri) {
        const response = await fetch(this.config.tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: this.config.clientId,
                code,
                code_verifier: codeVerifier,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            })
        });
        
        if (!response.ok) {
            throw new Error('Token exchange failed');
        }
        
        return response.json();
    }

    async upload(data) {
        const response = await fetch(`${this.config.apiBase}/me/drive/root:/revenue_backup.json:/content`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${this.tokens.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error('Upload failed');
        }
        
        return response.json();
    }

    async download() {
        const response = await fetch(`${this.config.apiBase}/me/drive/root:/revenue_backup.json:/content`, {
            headers: {
                'Authorization': `Bearer ${this.tokens.access_token}`
            }
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                return null; // File not found
            }
            throw new Error('Download failed');
        }
        
        return response.json();
    }
}

// Create singleton instance
const cloudSyncManager = new CloudSyncManager();

// Export
export default cloudSyncManager;
export { CloudSyncManager, CloudAdapter, GoogleDriveAdapter, DropboxAdapter, OneDriveAdapter };
