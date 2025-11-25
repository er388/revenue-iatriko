/**
 * cdnChecker.js - CDN Availability Monitor
 * Checks and monitors external library availability
 * Version: 2.0 (Complete)
 */

import { logError } from './utils.js';

// ========================================
// Configuration
// ========================================
const CDN_CONFIG = {
    libraries: {
        chartjs: {
            name: 'Chart.js',
            check: () => typeof window.Chart !== 'undefined',
            url: 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
            critical: true,
            features: ['Dashboard charts', 'Reports visualization']
        },
        papaparse: {
            name: 'PapaParse',
            check: () => typeof window.Papa !== 'undefined',
            url: 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
            critical: false,
            features: ['CSV import']
        },
        jspdf: {
            name: 'jsPDF',
            check: () => typeof window.jspdf !== 'undefined',
            url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
            critical: false,
            features: ['PDF export']
        },
        html2canvas: {
            name: 'html2canvas',
            check: () => typeof window.html2canvas !== 'undefined',
            url: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
            critical: false,
            features: ['PDF chart capture']
        }
    },
    checkInterval: 60000, // 1 minute
    retryDelay: 5000, // 5 seconds
    maxRetries: 3,
    timeout: 10000 // 10 seconds
};

// ========================================
// CDN Checker Class
// ========================================
class CDNChecker {
    constructor() {
        this.status = {};
        this.lastCheck = null;
        this.checkInProgress = false;
        this.retryCount = {};
        this.listeners = [];
    }

    /**
     * Check all CDN libraries
     * @returns {Promise<Object>} Status object
     */
    async checkAll() {
        if (this.checkInProgress) {
            console.log('[CDN] Check already in progress');
            return this.status;
        }

        this.checkInProgress = true;
        const results = {};

        try {
            for (const [key, lib] of Object.entries(CDN_CONFIG.libraries)) {
                results[key] = await this.checkLibrary(key, lib);
            }

            this.status = results;
            this.lastCheck = Date.now();

            // Notify listeners
            this.notifyListeners(results);

            // Show offline notice if critical libraries are missing
            const criticalMissing = this.getCriticalMissing();
            if (criticalMissing.length > 0) {
                this.showOfflineNotice(criticalMissing);
            }

            return {
                status: results,
                offline: criticalMissing.length > 0,
                allAvailable: Object.values(results).every(r => r.available),
                timestamp: this.lastCheck
            };
        } catch (error) {
            logError('CDN check', error);
            return {
                status: results,
                offline: true,
                allAvailable: false,
                error: error.message
            };
        } finally {
            this.checkInProgress = false;
        }
    }

    /**
     * Check single library
     * @param {string} key - Library key
     * @param {Object} lib - Library config
     * @returns {Promise<Object>} Library status
     * @private
     */
    async checkLibrary(key, lib) {
        const result = {
            name: lib.name,
            available: false,
            loaded: false,
            critical: lib.critical,
            features: lib.features,
            error: null,
            lastCheck: Date.now()
        };

        try {
            // Check if already loaded
            if (lib.check()) {
                result.available = true;
                result.loaded = true;
                this.retryCount[key] = 0;
                return result;
            }

            // Try to fetch the library (HEAD request)
            const available = await this.checkUrl(lib.url);
            result.available = available;

            if (!available && lib.critical) {
                // Try to retry critical libraries
                if (!this.retryCount[key]) {
                    this.retryCount[key] = 0;
                }

                if (this.retryCount[key] < CDN_CONFIG.maxRetries) {
                    this.retryCount[key]++;
                    console.log(`[CDN] Retry ${this.retryCount[key]}/${CDN_CONFIG.maxRetries} for ${lib.name}`);
                    
                    // Wait and retry
                    await this.delay(CDN_CONFIG.retryDelay);
                    return await this.checkLibrary(key, lib);
                }
            }

            return result;
        } catch (error) {
            logError(`CDN check ${lib.name}`, error);
            result.error = error.message;
            return result;
        }
    }

    /**
     * Check if URL is accessible (HEAD request)
     * @param {string} url - URL to check
     * @returns {Promise<boolean>} Available or not
     * @private
     */
    async checkUrl(url) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CDN_CONFIG.timeout);

            const response = await fetch(url, {
                method: 'HEAD',
                cache: 'no-cache',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return response.ok;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn(`[CDN] Timeout checking ${url}`);
            }
            return false;
        }
    }

    /**
     * Get list of critical libraries that are missing
     * @returns {Array} Missing critical libraries
     * @private
     */
    getCriticalMissing() {
        return Object.entries(this.status)
            .filter(([key, status]) => status.critical && !status.available)
            .map(([key, status]) => status.name);
    }

    /**
     * Show offline notice to user
     * @param {Array} missingLibs - Missing libraries
     */
    showOfflineNotice(missingLibs) {
        const notice = document.getElementById('cdnOfflineNotice');
        
        if (!notice) {
            // Create notice if doesn't exist
            const div = document.createElement('div');
            div.id = 'cdnOfflineNotice';
            div.className = 'cdn-offline-notice';
            div.innerHTML = `
                <div class="cdn-offline-content">
                    <span class="cdn-offline-icon">⚠️</span>
                    <div class="cdn-offline-text">
                        <strong>Περιορισμένη λειτουργικότητα</strong>
                        <p>Ορισμένες βιβλιοθήκες δεν είναι διαθέσιμες: ${missingLibs.join(', ')}</p>
                        <p class="cdn-offline-hint">Ελέγξτε τη σύνδεσή σας ή δοκιμάστε αργότερα.</p>
                    </div>
                    <button class="cdn-offline-close" onclick="this.parentElement.parentElement.remove()">✕</button>
                </div>
            `;
            document.body.appendChild(div);

            // Auto-hide after 10 seconds
            setTimeout(() => {
                if (div.parentElement) {
                    div.remove();
                }
            }, 10000);
        } else {
            // Update existing notice
            const textEl = notice.querySelector('.cdn-offline-text p');
            if (textEl) {
                textEl.textContent = `Ορισμένες βιβλιοθήκες δεν είναι διαθέσιμες: ${missingLibs.join(', ')}`;
            }
        }

        console.warn('[CDN] Critical libraries missing:', missingLibs);
    }

    /**
     * Add status change listener
     * @param {Function} callback - Callback function
     */
    addListener(callback) {
        this.listeners.push(callback);
    }

    /**
     * Remove status change listener
     * @param {Function} callback - Callback function
     */
    removeListener(callback) {
        this.listeners = this.listeners.filter(cb => cb !== callback);
    }

    /**
     * Notify all listeners
     * @param {Object} status - Current status
     * @private
     */
    notifyListeners(status) {
        this.listeners.forEach(callback => {
            try {
                callback(status);
            } catch (error) {
                logError('CDN listener', error);
            }
        });
    }

    /**
     * Get current status
     * @returns {Object} Status object
     */
    getStatus() {
        return {
            status: this.status,
            lastCheck: this.lastCheck,
            offline: this.getCriticalMissing().length > 0,
            allAvailable: Object.values(this.status).every(r => r.available)
        };
    }

    /**
     * Check if specific library is available
     * @param {string} key - Library key
     * @returns {boolean} Available or not
     */
    isAvailable(key) {
        return this.status[key]?.available || false;
    }

    /**
     * Get missing features
     * @returns {Array} List of unavailable features
     */
    getMissingFeatures() {
        const missing = [];
        
        for (const [key, status] of Object.entries(this.status)) {
            if (!status.available) {
                missing.push(...status.features);
            }
        }
        
        return [...new Set(missing)];
    }

    /**
     * Delay helper
     * @param {number} ms - Milliseconds
     * @returns {Promise} Promise that resolves after delay
     * @private
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ========================================
// Periodic CDN Checker Class
// ========================================
class PeriodicCDNChecker {
    constructor(checker) {
        this.checker = checker;
        this.intervalId = null;
        this.isRunning = false;
    }

    /**
     * Start periodic checking
     * @param {number} interval - Check interval (ms)
     */
    start(interval = CDN_CONFIG.checkInterval) {
        if (this.isRunning) {
            console.log('[CDN] Periodic checker already running');
            return;
        }

        this.isRunning = true;
        
        // Initial check
        this.checker.checkAll();

        // Periodic checks
        this.intervalId = setInterval(() => {
            this.checker.checkAll();
        }, interval);

        console.log(`[CDN] Periodic checker started (interval: ${interval}ms)`);
    }

    /**
     * Stop periodic checking
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('[CDN] Periodic checker stopped');
    }

    /**
     * Restart periodic checking
     * @param {number} interval - Check interval (ms)
     */
    restart(interval) {
        this.stop();
        this.start(interval);
    }
}

// ========================================
// Singleton Instances
// ========================================
const cdnChecker = new CDNChecker();
const periodicChecker = new PeriodicCDNChecker(cdnChecker);

// ========================================
// Export
// ========================================
export { CDNChecker, PeriodicCDNChecker, CDN_CONFIG };
export { cdnChecker, periodicChecker };
export default cdnChecker;
