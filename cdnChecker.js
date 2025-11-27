/**
 * cdnChecker.js - CDN Availability Monitor
 * Checks external library availability
 * Version: 2.1 (Simplified)
 */

import { logError } from './utils.js';

// ========================================
// CDN Checker
// ========================================
const cdnChecker = {
    /**
     * Check all CDN libraries
     * @returns {Promise<Object>} Status object
     */
    async checkAll() {
        console.log('🔍 Checking CDN libraries...');
        
        const results = {
            chartjs: this.checkLibrary('Chart.js', () => typeof Chart !== 'undefined'),
            papaparse: this.checkLibrary('PapaParse', () => typeof Papa !== 'undefined'),
            jspdf: this.checkLibrary('jsPDF', () => typeof window.jspdf !== 'undefined'),
            html2canvas: this.checkLibrary('html2canvas', () => typeof html2canvas !== 'undefined')
        };

        const allAvailable = Object.values(results).every(r => r.available);
        const criticalMissing = Object.entries(results)
            .filter(([key, r]) => !r.available && (key === 'chartjs'))
            .map(([key, r]) => r.name);

        if (criticalMissing.length > 0) {
            console.warn('⚠️ Critical libraries missing:', criticalMissing);
            this.showOfflineNotice(criticalMissing);
        } else {
            console.log('✅ All critical libraries loaded');
        }

        return {
            status: results,
            allAvailable,
            offline: criticalMissing.length > 0,
            timestamp: Date.now()
        };
    },

    /**
     * Check single library
     * @param {string} name - Library name
     * @param {Function} testFn - Test function
     * @returns {Object} Status
     * @private
     */
    checkLibrary(name, testFn) {
        try {
            const available = testFn();
            console.log(`${available ? '✅' : '❌'} ${name}: ${available ? 'Loaded' : 'Missing'}`);
            return {
                name,
                available,
                checked: Date.now()
            };
        } catch (error) {
            logError(`CDN check ${name}`, error);
            return {
                name,
                available: false,
                error: error.message
            };
        }
    },

    /**
     * Check if specific library is available
     * @param {string} key - Library key
     * @returns {boolean}
     */
    isAvailable(key) {
        const checks = {
            chartjs: () => typeof Chart !== 'undefined',
            papaparse: () => typeof Papa !== 'undefined',
            jspdf: () => typeof window.jspdf !== 'undefined',
            html2canvas: () => typeof html2canvas !== 'undefined'
        };
        
        return checks[key] ? checks[key]() : false;
    },

    /**
     * Get missing features
     * @returns {Array} List of missing features
     */
    getMissingFeatures() {
        const features = [];
        
        if (!this.isAvailable('chartjs')) {
            features.push('Dashboard charts', 'Reports visualization');
        }
        if (!this.isAvailable('papaparse')) {
            features.push('CSV import');
        }
        if (!this.isAvailable('jspdf')) {
            features.push('PDF export');
        }
        if (!this.isAvailable('html2canvas')) {
            features.push('PDF chart capture');
        }
        
        return features;
    },

    /**
     * Show offline notice
     * @param {Array} missingLibs - Missing libraries
     */
    showOfflineNotice(missingLibs) {
        const existingNotice = document.getElementById('cdnOfflineNotice');
        if (existingNotice) {
            existingNotice.remove();
        }

        const notice = document.createElement('div');
        notice.id = 'cdnOfflineNotice';
        notice.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: linear-gradient(135deg, #f59e0b, #d97706);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 0.75rem;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 10000;
            max-width: 400px;
            animation: slideIn 0.3s ease-out;
        `;
        
        notice.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 1rem;">
                <span style="font-size: 1.5rem;">⚠️</span>
                <div style="flex: 1;">
                    <strong style="display: block; margin-bottom: 0.5rem;">Περιορισμένη λειτουργικότητα</strong>
                    <p style="margin: 0; font-size: 0.9rem; opacity: 0.95;">
                        Ορισμένες βιβλιοθήκες δεν είναι διαθέσιμες: ${missingLibs.join(', ')}
                    </p>
                    <p style="margin: 0.5rem 0 0 0; font-size: 0.85rem; opacity: 0.9;">
                        Ελέγξτε τη σύνδεσή σας ή δοκιμάστε αργότερα.
                    </p>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" style="
                    background: none;
                    border: none;
                    color: white;
                    cursor: pointer;
                    font-size: 1.2rem;
                    padding: 0;
                    line-height: 1;
                ">✕</button>
            </div>
        `;
        
        document.body.appendChild(notice);

        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (notice.parentElement) {
                notice.remove();
            }
        }, 10000);
    },

    /**
     * Add status listener (stub)
     * @param {Function} callback
     */
    addListener(callback) {
        // Simple stub - can be enhanced later
        console.log('CDN listener added');
    }
};

// ========================================
// Periodic Checker (Simplified)
// ========================================
const periodicChecker = {
    intervalId: null,
    checker: cdnChecker,

    start(interval = 60000) {
        if (this.intervalId) {
            console.log('Periodic checker already running');
            return;
        }

        // Initial check
        this.checker.checkAll();

        // Periodic checks
        this.intervalId = setInterval(() => {
            this.checker.checkAll();
        }, interval);

        console.log(`Periodic CDN checker started (${interval}ms)`);
    },

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('Periodic checker stopped');
        }
    }
};

// ========================================
// Export
// ========================================
export { cdnChecker, periodicChecker };
export default cdnChecker;