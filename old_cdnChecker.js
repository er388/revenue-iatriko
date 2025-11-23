/**
 * cdnChecker.js - CDN Availability Checker
 * ÎˆÎ»ÎµÎ³Ï‡Î¿Ï‚ Î´Î¹Î±Î¸ÎµÏƒÎ¹Î¼ÏŒÏ„Î·Ï„Î±Ï‚ CDN libraries ÎºÎ±Î¹ fallback management
 */

import { checkCDNAvailability } from './utils.js';

// ========================================
// CDN Configuration
// ========================================
const CDN_LIBRARIES = {
    chartjs: {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
        checkProperty: 'Chart',
        required: true,
        fallback: null
    },
    papaparse: {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
        checkProperty: 'Papa',
        required: true,
        fallback: null
    },
    jspdf: {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
        checkProperty: 'jspdf',
        required: false,
        fallback: null
    }
};

// ========================================
// CDN Checker Class
// ========================================
class CDNChecker {
    constructor() {
        this.status = {};
        this.offline = false;
        this.listeners = [];
    }

    /**
     * Check ÏŒÎ»Î± Ï„Î± CDN libraries
     * @returns {Promise<Object>}
     */
    async checkAll() {
        const results = {};
        
        for (const [name, lib] of Object.entries(CDN_LIBRARIES)) {
            results[name] = await this.checkLibrary(name, lib);
        }

        this.status = results;
        this.offline = Object.values(results).some(r => r.required && !r.available);

        // Notify listeners
        this.notifyListeners();

        return {
            status: results,
            offline: this.offline,
            allAvailable: !this.offline
        };
    }

    /**
     * Check single library
     * @private
     */
    async checkLibrary(name, lib) {
        // First check if already loaded in window
        if (lib.checkProperty && window[lib.checkProperty]) {
            return {
                name,
                available: true,
                source: 'loaded',
                required: lib.required
            };
        }

        // Check CDN availability
        try {
            const available = await checkCDNAvailability(lib.url);
            
            if (!available && lib.fallback) {
                // Try fallback
                const fallbackAvailable = await checkCDNAvailability(lib.fallback);
                return {
                    name,
                    available: fallbackAvailable,
                    source: fallbackAvailable ? 'fallback' : 'unavailable',
                    required: lib.required
                };
            }

            return {
                name,
                available,
                source: available ? 'cdn' : 'unavailable',
                required: lib.required
            };
        } catch (error) {
            return {
                name,
                available: false,
                source: 'error',
                error: error.message,
                required: lib.required
            };
        }
    }

    /**
     * Get status Î³Î¹Î± specific library
     * @param {string} name - Library name
     * @returns {Object|null}
     */
    getLibraryStatus(name) {
        return this.status[name] || null;
    }

    /**
     * Check Î±Î½ ÎµÎ¯Î¼Î±ÏƒÏ„Îµ offline
     * @returns {boolean}
     */
    isOffline() {
        return this.offline;
    }

    /**
     * Subscribe to status changes
     * @param {Function} callback - Callback function
     */
    onStatusChange(callback) {
        this.listeners.push(callback);
    }

    /**
     * Notify all listeners
     * @private
     */
    notifyListeners() {
        this.listeners.forEach(callback => {
            try {
                callback(this.status, this.offline);
            } catch (error) {
                console.error('CDN status listener error:', error);
            }
        });
    }

    /**
     * Show offline notice to user
     */
    showOfflineNotice() {
        const notice = document.createElement('div');
        notice.id = 'cdn-offline-notice';
        notice.className = 'cdn-notice offline';
        notice.innerHTML = `
            <div class="cdn-notice-content">
                <span class="cdn-notice-icon">âš ï¸</span>
                <div class="cdn-notice-text">
                    <strong>Î›ÎµÎ¹Ï„Î¿Ï…ÏÎ³Î¯Î± Offline</strong>
                    <p>Î”ÎµÎ½ Î¼Ï€Î¿ÏÎ¿ÏÎ½ Î½Î± Ï†Î¿ÏÏ„Ï‰Î¸Î¿ÏÎ½ Î¿Î¹ Î²Î¹Î²Î»Î¹Î¿Î¸Î®ÎºÎµÏ‚ CDN. ÎœÎµÏÎ¹ÎºÎ­Ï‚ Î»ÎµÎ¹Ï„Î¿Ï…ÏÎ³Î¯ÎµÏ‚ Î¼Ï€Î¿ÏÎµÎ¯ Î½Î± Î¼Î·Î½ ÎµÎ¯Î½Î±Î¹ Î´Î¹Î±Î¸Î­ÏƒÎ¹Î¼ÎµÏ‚.</p>
                    <small>Î“ÏÎ±Ï†Î®Î¼Î±Ï„Î±, PDF exports ÎºÎ±Î¹ CSV imports Î¼Ï€Î¿ÏÎµÎ¯ Î½Î± Î¼Î·Î½ Î»ÎµÎ¹Ï„Î¿Ï…ÏÎ³Î¿ÏÎ½.</small>
                </div>
                <button class="cdn-notice-close" onclick="this.parentElement.parentElement.remove()">Ã—</button>
            </div>
        `;

        document.body.appendChild(notice);

        // Auto-remove after 30 seconds
        setTimeout(() => {
            if (notice.parentElement) {
                notice.remove();
            }
        }, 30000);
    }

    /**
     * Show online notice
     */
    showOnlineNotice() {
        const notice = document.createElement('div');
        notice.id = 'cdn-online-notice';
        notice.className = 'cdn-notice online';
        notice.innerHTML = `
            <div class="cdn-notice-content">
                <span class="cdn-notice-icon">âœ…</span>
                <div class="cdn-notice-text">
                    <strong>Î£ÏÎ½Î´ÎµÏƒÎ· Î‘Ï€Î¿ÎºÎ±Ï„Î±ÏƒÏ„Î¬Î¸Î·ÎºÎµ</strong>
                    <p>ÎŒÎ»ÎµÏ‚ Î¿Î¹ Î»ÎµÎ¹Ï„Î¿Ï…ÏÎ³Î¯ÎµÏ‚ ÎµÎ¯Î½Î±Î¹ Î´Î¹Î±Î¸Î­ÏƒÎ¹Î¼ÎµÏ‚.</p>
                </div>
                <button class="cdn-notice-close" onclick="this.parentElement.parentElement.remove()">Ã—</button>
            </div>
        `;

        document.body.appendChild(notice);

        setTimeout(() => {
            if (notice.parentElement) {
                notice.remove();
            }
        }, 5000);
    }

    /**
     * Generate status report
     * @returns {string}
     */
    generateStatusReport() {
        let report = 'ðŸ“Š CDN Libraries Status:\n\n';

        Object.entries(this.status).forEach(([name, status]) => {
            const icon = status.available ? 'âœ…' : 'âŒ';
            const required = status.required ? '(Required)' : '(Optional)';
            report += `${icon} ${name} ${required}: ${status.source}\n`;
        });

        if (this.offline) {
            report += '\nâš ï¸ Offline Mode: Some features unavailable';
        } else {
            report += '\nâœ… All systems operational';
        }

        return report;
    }

    /**
     * Attempt to reload failed libraries
     * @returns {Promise<Object>}
     */
    async retryFailedLibraries() {
        const failedLibs = Object.entries(this.status)
            .filter(([, status]) => !status.available)
            .map(([name]) => name);

        if (failedLibs.length === 0) {
            return { success: true, message: 'All libraries already loaded' };
        }

        const results = {};
        for (const name of failedLibs) {
            const lib = CDN_LIBRARIES[name];
            results[name] = await this.checkLibrary(name, lib);
        }

        // Update status
        Object.assign(this.status, results);
        this.offline = Object.values(this.status).some(r => r.required && !r.available);

        this.notifyListeners();

        return {
            success: !this.offline,
            results,
            message: this.offline ? 'Some libraries still unavailable' : 'All libraries loaded successfully'
        };
    }

    /**
     * Get fallback instructions Î³Î¹Î± user
     * @returns {Object}
     */
    getFallbackInstructions() {
        const unavailable = Object.entries(this.status)
            .filter(([, status]) => !status.available && status.required)
            .map(([name]) => name);

        if (unavailable.length === 0) {
            return {
                needed: false,
                message: 'All required libraries available'
            };
        }

        const instructions = {
            needed: true,
            libraries: unavailable,
            steps: []
        };

        if (unavailable.includes('chartjs')) {
            instructions.steps.push({
                library: 'Chart.js',
                impact: 'Î“ÏÎ±Ï†Î®Î¼Î±Ï„Î± Î´ÎµÎ½ Î¸Î± ÎµÎ¼Ï†Î±Î½Î¯Î¶Î¿Î½Ï„Î±Î¹',
                workaround: 'Î§ÏÎ·ÏƒÎ¹Î¼Î¿Ï€Î¿Î¹Î®ÏƒÏ„Îµ Ï„Î± exports CSV Î³Î¹Î± Î±Î½Î¬Î»Ï…ÏƒÎ· ÏƒÎµ Excel'
            });
        }

        if (unavailable.includes('papaparse')) {
            instructions.steps.push({
                library: 'PapaParse',
                impact: 'CSV import Î´ÎµÎ½ Î¸Î± Î»ÎµÎ¹Ï„Î¿Ï…ÏÎ³ÎµÎ¯',
                workaround: 'Î§ÏÎ·ÏƒÎ¹Î¼Î¿Ï€Î¿Î¹Î®ÏƒÏ„Îµ JSON import/export'
            });
        }

        if (unavailable.includes('jspdf')) {
            instructions.steps.push({
                library: 'jsPDF',
                impact: 'PDF export Î´ÎµÎ½ Î¸Î± Î»ÎµÎ¹Ï„Î¿Ï…ÏÎ³ÎµÎ¯',
                workaround: 'Î§ÏÎ·ÏƒÎ¹Î¼Î¿Ï€Î¿Î¹Î®ÏƒÏ„Îµ Print to PDF Ï„Î¿Ï… browser'
            });
        }

        instructions.steps.push({
            library: 'General',
            impact: 'Offline mode',
            workaround: 'Î•Î»Î­Î³Î¾Ï„Îµ Ï„Î· ÏƒÏÎ½Î´ÎµÏƒÎ· internet ÎºÎ±Î¹ Î±Î½Î±Î½ÎµÏŽÏƒÏ„Îµ Ï„Î· ÏƒÎµÎ»Î¯Î´Î±'
        });

        return instructions;
    }
}

// ========================================
// Periodic Checker
// ========================================
class PeriodicCDNChecker {
    constructor(cdnChecker, interval = 60000) { // Default: 1 minute
        this.cdnChecker = cdnChecker;
        this.interval = interval;
        this.timer = null;
        this.running = false;
    }

    /**
     * Start periodic checking
     */
    start() {
        if (this.running) return;

        this.running = true;
        this.check(); // Initial check

        this.timer = setInterval(() => {
            this.check();
        }, this.interval);
    }

    /**
     * Stop periodic checking
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.running = false;
    }

    /**
     * Perform check
     * @private
     */
    async check() {
        const previousOffline = this.cdnChecker.isOffline();
        await this.cdnChecker.checkAll();
        const currentOffline = this.cdnChecker.isOffline();

        // Detect status changes
        if (previousOffline && !currentOffline) {
            console.log('CDN connection restored');
            this.cdnChecker.showOnlineNotice();
        } else if (!previousOffline && currentOffline) {
            console.log('CDN connection lost');
            this.cdnChecker.showOfflineNotice();
        }
    }
}

// ========================================
// Singleton Instances
// ========================================
const cdnChecker = new CDNChecker();
const periodicChecker = new PeriodicCDNChecker(cdnChecker);

// ========================================
// Exports
// ========================================
export { CDNChecker, PeriodicCDNChecker, CDN_LIBRARIES };
export { cdnChecker, periodicChecker };
export default cdnChecker;