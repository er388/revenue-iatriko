/**
 * cloudAdapters.js - Cloud Storage Integrations
 * Google Drive, Dropbox, OneDrive Î¼Îµ OAuth2 PKCE
 */

import { logError, generateId, downloadBlob } from './utils.js';
import backupManager from './backup.js';

// ========================================
// Configuration
// ========================================
const CLOUD_CONFIG = {
    googleDrive: {
        clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
        redirectUri: window.location.origin + '/oauth-callback.html',
        scope: 'https://www.googleapis.com/auth/drive.file',
        authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        apiEndpoint: 'https://www.googleapis.com/drive/v3/files'
    },
    dropbox: {
        clientId: 'YOUR_DROPBOX_CLIENT_ID',
        redirectUri: window.location.origin + '/oauth-callback.html',
        authEndpoint: 'https://www.dropbox.com/oauth2/authorize',
        tokenEndpoint: 'https://api.dropboxapi.com/oauth2/token',
        apiEndpoint: 'https://api.dropboxapi.com/2/files'
    },
    oneDrive: {
        clientId: 'YOUR_ONEDRIVE_CLIENT_ID',
        redirectUri: window.location.origin + '/oauth-callback.html',
        scope: 'files.readwrite offline_access',
        authEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        apiEndpoint: 'https://graph.microsoft.com/v1.0/me/drive'
    }
};

// ========================================
// PKCE Helper Functions
// ========================================

/**
 * Generate random string Î³Î¹Î± PKCE
 * @param {number} length - Length
 * @returns {string}
 */
function generateRandomString(length = 128) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(values).map(x => possible[x % possible.length]).join('');
}

/**
 * Generate code challenge Î³Î¹Î± PKCE
 * @param {string} codeVerifier - Code verifier
 * @returns {Promise<string>}
 */
async function generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// ========================================
// Base Cloud Adapter Class
// ========================================
class CloudAdapter {
    constructor(name, config) {
        this.name = name;
        this.config = config;
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiry = null;
        this.isConnected = false;
        
        this.loadTokens();
    }

    /**
     * Load tokens Î±Ï€ÏŒ localStorage
     */
    loadTokens() {
        try {
            const data = localStorage.getItem(`cloud_${this.name}`);
            if (data) {
                const parsed = JSON.parse(data);
                this.accessToken = parsed.accessToken;
                this.refreshToken = parsed.refreshToken;
                this.tokenExpiry = parsed.tokenExpiry;
                this.isConnected = Date.now() < this.tokenExpiry;
            }
        } catch (error) {
            logError(`${this.name} load tokens`, error);
        }
    }

    /**
     * Save tokens ÏƒÎµ localStorage
     */
    saveTokens() {
        try {
            const data = {
                accessToken: this.accessToken,
                refreshToken: this.refreshToken,
                tokenExpiry: this.tokenExpiry
            };
            localStorage.setItem(`cloud_${this.name}`, JSON.stringify(data));
        } catch (error) {
            logError(`${this.name} save tokens`, error);
        }
    }

    /**
     * Clear tokens
     */
    clearTokens() {
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiry = null;
        this.isConnected = false;
        localStorage.removeItem(`cloud_${this.name}`);
    }

    /**
     * Start OAuth flow Î¼Îµ PKCE
     * @returns {Promise<void>}
     */
    async connect() {
        try {
            // Generate PKCE values
            const codeVerifier = generateRandomString(128);
            const codeChallenge = await generateCodeChallenge(codeVerifier);
            const state = generateId();

            // Store Î³Î¹Î± callback
            sessionStorage.setItem('oauth_code_verifier', codeVerifier);
            sessionStorage.setItem('oauth_state', state);
            sessionStorage.setItem('oauth_provider', this.name);

            // Build authorization URL
            const params = new URLSearchParams({
                client_id: this.config.clientId,
                redirect_uri: this.config.redirectUri,
                response_type: 'code',
                scope: this.config.scope,
                state: state,
                code_challenge: codeChallenge,
                code_challenge_method: 'S256'
            });

            // Redirect Î³Î¹Î± authorization
            window.location.href = `${this.config.authEndpoint}?${params.toString()}`;
        } catch (error) {
            logError(`${this.name} connect`, error);
            throw error;
        }
    }

    /**
     * Handle OAuth callback
     * @param {string} code - Authorization code
     * @param {string} state - State parameter
     * @returns {Promise<boolean>}
     */
    async handleCallback(code, state) {
        try {
            // Verify state
            const savedState = sessionStorage.getItem('oauth_state');
            if (state !== savedState) {
                throw new Error('State mismatch - possible CSRF attack');
            }

            // Get code verifier
            const codeVerifier = sessionStorage.getItem('oauth_code_verifier');
            if (!codeVerifier) {
                throw new Error('Code verifier not found');
            }

            // Exchange code for tokens
            const tokens = await this.exchangeCodeForTokens(code, codeVerifier);

            // Save tokens
            this.accessToken = tokens.access_token;
            this.refreshToken = tokens.refresh_token;
            this.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
            this.isConnected = true;
            this.saveTokens();

            // Clear session storage
            sessionStorage.removeItem('oauth_code_verifier');
            sessionStorage.removeItem('oauth_state');
            sessionStorage.removeItem('oauth_provider');

            return true;
        } catch (error) {
            logError(`${this.name} callback`, error);
            return false;
        }
    }

    /**
     * Exchange authorization code Î³Î¹Î± tokens
     * @param {string} code - Authorization code
     * @param {string} codeVerifier - PKCE code verifier
     * @returns {Promise<Object>}
     */
    async exchangeCodeForTokens(code, codeVerifier) {
        const params = new URLSearchParams({
            client_id: this.config.clientId,
            code: code,
            code_verifier: codeVerifier,
            grant_type: 'authorization_code',
            redirect_uri: this.config.redirectUri
        });

        const response = await fetch(this.config.tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        if (!response.ok) {
            throw new Error(`Token exchange failed: ${response.status}`);
        }

        return await response.json();
    }

    /**
     * Refresh access token
     * @returns {Promise<boolean>}
     */
    async refreshAccessToken() {
        if (!this.refreshToken) return false;

        try {
            const params = new URLSearchParams({
                client_id: this.config.clientId,
                refresh_token: this.refreshToken,
                grant_type: 'refresh_token'
            });

            const response = await fetch(this.config.tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params.toString()
            });

            if (!response.ok) return false;

            const tokens = await response.json();
            this.accessToken = tokens.access_token;
            if (tokens.refresh_token) {
                this.refreshToken = tokens.refresh_token;
            }
            this.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
            this.saveTokens();

            return true;
        } catch (error) {
            logError(`${this.name} refresh token`, error);
            return false;
        }
    }

    /**
     * Check Î±Î½ token ÎµÎ¯Î½Î±Î¹ valid, Î±Î»Î»Î¹ÏŽÏ‚ refresh
     * @returns {Promise<boolean>}
     */
    async ensureValidToken() {
        if (!this.accessToken) return false;

        // Check Î±Î½ expired
        if (Date.now() >= this.tokenExpiry - 60000) { // 1 min buffer
            return await this.refreshAccessToken();
        }

        return true;
    }

    /**
     * Disconnect Î±Ï€ÏŒ cloud service
     */
    disconnect() {
        this.clearTokens();
        console.log(`Disconnected from ${this.name}`);
    }

    /**
     * Make authenticated API request
     * @param {string} url - URL
     * @param {Object} options - Fetch options
     * @returns {Promise<Response>}
     */
    async makeRequest(url, options = {}) {
        await this.ensureValidToken();

        const headers = {
            'Authorization': `Bearer ${this.accessToken}`,
            ...options.headers
        };

        const response = await fetch(url, {
            ...options,
            headers
        });

        // Î‘Î½ 401, Î´Î¿ÎºÎ¯Î¼Î±ÏƒÎµ refresh
        if (response.status === 401) {
            const refreshed = await this.refreshAccessToken();
            if (refreshed) {
                // Retry request
                headers.Authorization = `Bearer ${this.accessToken}`;
                return await fetch(url, { ...options, headers });
            }
        }

        return response;
    }

    // Abstract methods - override ÏƒÏ„Î± subclasses
    async upload(filename, data) {
        throw new Error('upload() must be implemented');
    }

    async download(fileId) {
        throw new Error('download() must be implemented');
    }

    async list() {
        throw new Error('list() must be implemented');
    }
}

// ========================================
// Google Drive Adapter
// ========================================
class GoogleDriveAdapter extends CloudAdapter {
    constructor() {
        super('googledrive', CLOUD_CONFIG.googleDrive);
    }

    /**
     * Upload file ÏƒÎµ Google Drive
     * @param {string} filename - Filename
     * @param {string} data - JSON data
     * @param {boolean} overwrite - Overwrite existing
     * @returns {Promise<Object>}
     */
    async upload(filename, data, overwrite = true) {
        try {
            // Check Î±Î½ Ï…Ï€Î¬ÏÏ‡ÎµÎ¹ Î®Î´Î·
            let fileId = null;
            if (overwrite) {
                const existing = await this.findFile(filename);
                if (existing) fileId = existing.id;
            }

            const metadata = {
                name: filename,
                mimeType: 'application/json'
            };

            const blob = new Blob([data], { type: 'application/json' });
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', blob);

            const url = fileId
                ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
                : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

            const method = fileId ? 'PATCH' : 'POST';

            const response = await this.makeRequest(url, {
                method,
                body: form
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            logError('Google Drive upload', error);
            throw error;
        }
    }

    /**
     * Find file by name
     * @param {string} filename - Filename
     * @returns {Promise<Object|null>}
     */
    async findFile(filename) {
        try {
            const query = `name='${filename}' and trashed=false`;
            const url = `${this.config.apiEndpoint}?q=${encodeURIComponent(query)}&fields=files(id,name)`;

            const response = await this.makeRequest(url);
            if (!response.ok) return null;

            const data = await response.json();
            return data.files && data.files.length > 0 ? data.files[0] : null;
        } catch (error) {
            logError('Google Drive find file', error);
            return null;
        }
    }

    /**
     * Download file Î±Ï€ÏŒ Google Drive
     * @param {string} fileId - File ID
     * @returns {Promise<string>}
     */
    async download(fileId) {
        try {
            const url = `${this.config.apiEndpoint}/${fileId}?alt=media`;
            const response = await this.makeRequest(url);

            if (!response.ok) {
                throw new Error(`Download failed: ${response.status}`);
            }

            return await response.text();
        } catch (error) {
            logError('Google Drive download', error);
            throw error;
        }
    }

    /**
     * List files
     * @returns {Promise<Array>}
     */
    async list() {
        try {
            const query = "mimeType='application/json' and trashed=false";
            const url = `${this.config.apiEndpoint}?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime,size)`;

            const response = await this.makeRequest(url);
            if (!response.ok) return [];

            const data = await response.json();
            return data.files || [];
        } catch (error) {
            logError('Google Drive list', error);
            return [];
        }
    }
}

// ========================================
// Dropbox Adapter
// ========================================
class DropboxAdapter extends CloudAdapter {
    constructor() {
        super('dropbox', CLOUD_CONFIG.dropbox);
    }

    async upload(filename, data, overwrite = true) {
        try {
            const path = `/${filename}`;
            const mode = overwrite ? 'overwrite' : 'add';

            const response = await this.makeRequest('https://content.dropboxapi.com/2/files/upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Dropbox-API-Arg': JSON.stringify({
                        path,
                        mode,
                        autorename: !overwrite
                    })
                },
                body: data
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            logError('Dropbox upload', error);
            throw error;
        }
    }

    async download(path) {
        try {
            const response = await this.makeRequest('https://content.dropboxapi.com/2/files/download', {
                method: 'POST',
                headers: {
                    'Dropbox-API-Arg': JSON.stringify({ path })
                }
            });

            if (!response.ok) {
                throw new Error(`Download failed: ${response.status}`);
            }

            return await response.text();
        } catch (error) {
            logError('Dropbox download', error);
            throw error;
        }
    }

    async list() {
        try {
            const response = await this.makeRequest('https://api.dropboxapi.com/2/files/list_folder', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    path: '',
                    recursive: false
                })
            });

            if (!response.ok) return [];

            const data = await response.json();
            return data.entries.filter(e => e['.tag'] === 'file' && e.name.endsWith('.json'));
        } catch (error) {
            logError('Dropbox list', error);
            return [];
        }
    }
}

// ========================================
// OneDrive Adapter
// ========================================
class OneDriveAdapter extends CloudAdapter {
    constructor() {
        super('onedrive', CLOUD_CONFIG.oneDrive);
    }

    async upload(filename, data, overwrite = true) {
        try {
            const path = `/root:/${filename}:/content`;
            const url = `${this.config.apiEndpoint}${path}`;

            const response = await this.makeRequest(url, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: data
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            logError('OneDrive upload', error);
            throw error;
        }
    }

    async download(itemId) {
        try {
            const url = `${this.config.apiEndpoint}/items/${itemId}/content`;
            const response = await this.makeRequest(url);

            if (!response.ok) {
                throw new Error(`Download failed: ${response.status}`);
            }

            return await response.text();
        } catch (error) {
            logError('OneDrive download', error);
            throw error;
        }
    }

    async list() {
        try {
            const url = `${this.config.apiEndpoint}/root/children`;
            const response = await this.makeRequest(url);

            if (!response.ok) return [];

            const data = await response.json();
            return data.value.filter(item => item.file && item.name.endsWith('.json'));
        } catch (error) {
            logError('OneDrive list', error);
            return [];
        }
    }
}

// ========================================
// Cloud Manager
// ========================================
class CloudManager {
    constructor() {
        this.adapters = {
            googledrive: new GoogleDriveAdapter(),
            dropbox: new DropboxAdapter(),
            onedrive: new OneDriveAdapter()
        };
    }

    getAdapter(provider) {
        return this.adapters[provider];
    }

    async connect(provider) {
        const adapter = this.getAdapter(provider);
        if (!adapter) throw new Error('Unknown provider');
        return await adapter.connect();
    }

    async disconnect(provider) {
        const adapter = this.getAdapter(provider);
        if (adapter) adapter.disconnect();
    }

    async uploadBackup(provider, overwrite = true) {
        const adapter = this.getAdapter(provider);
        if (!adapter || !adapter.isConnected) {
            throw new Error('Not connected');
        }

        const backup = await backupManager.createBackup();
        const data = JSON.stringify(backup, null, 2);
        const filename = `backup_${new Date().toISOString().slice(0, 10)}.json`;

        return await adapter.upload(filename, data, overwrite);
    }

    async downloadBackup(provider, fileId) {
        const adapter = this.getAdapter(provider);
        if (!adapter || !adapter.isConnected) {
            throw new Error('Not connected');
        }

        const data = await adapter.download(fileId);
        return JSON.parse(data);
    }

    async listBackups(provider) {
        const adapter = this.getAdapter(provider);
        if (!adapter || !adapter.isConnected) return [];

        return await adapter.list();
    }

    getConnectionStatus() {
        return {
            googledrive: this.adapters.googledrive.isConnected,
            dropbox: this.adapters.dropbox.isConnected,
            onedrive: this.adapters.onedrive.isConnected
        };
    }
}

// ========================================
// Singleton & Exports
// ========================================
const cloudManager = new CloudManager();

export { CloudManager, CLOUD_CONFIG };
export default cloudManager;