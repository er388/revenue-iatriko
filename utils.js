/**
 * utils.js - Utility Functions
 * Βοηθητικές λειτουργίες για formatting, validation, και γενικές λειτουργίες
 */

// ========================================
// i18n Strings
// ========================================
export const STRINGS = {
    errors: {
        invalidDate: 'Μη έγκυρη ημερομηνία. Χρησιμοποιήστε μορφή ΜΜ/ΕΕΕΕ',
        duplicateEntry: 'Υπάρχει ήδη εγγραφή για αυτή την ημερομηνία και πηγή!',
        quotaExceeded: 'Ο διαθέσιμος χώρος αποθήκευσης εξαντλήθηκε',
        importFailed: 'Η εισαγωγή απέτυχε',
        networkError: 'Σφάλμα δικτύου',
        cdnUnavailable: 'Οι βιβλιοθήκες CDN δεν είναι διαθέσιμες',
    },
    success: {
        entrySaved: 'Η εγγραφή αποθηκεύτηκε επιτυχώς',
        entryDeleted: 'Η εγγραφή διαγράφηκε επιτυχώς',
        backupCreated: 'Το backup δημιουργήθηκε επιτυχώς',
        importCompleted: 'Η εισαγωγή ολοκληρώθηκε',
        cacheCleared: 'Η προσωρινή μνήμη καθαρίστηκε',
    },
    info: {
        saving: 'Αποθήκευση...',
        saved: 'Αποθηκεύτηκε',
        loading: 'Φόρτωση...',
        processing: 'Επεξεργασία...',
    }
};

// ========================================
// HTML Escaping
// ========================================

/**
 * Escape HTML για αποφυγή XSS
 * @param {string} text - Κείμενο προς escape
 * @returns {string} Escaped HTML
 */
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// Date Functions
// ========================================

/**
 * Parse ημερομηνία MM/YYYY
 * @param {string} dateStr - Ημερομηνία σε μορφή MM/YYYY
 * @returns {{month: number, year: number}|null}
 */
export function parseMonthYear(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.trim().split('/');
    if (parts.length !== 2) return null;
    
    const month = parseInt(parts[0], 10);
    const year = parseInt(parts[1], 10);
    
    if (isNaN(month) || isNaN(year) || month < 1 || month > 12 || year < 1900 || year > 2100) {
        return null;
    }
    
    return { month, year };
}

/**
 * Format ημερομηνία σε MM/YYYY
 * @param {number} month - Μήνας (1-12)
 * @param {number} year - Έτος
 * @returns {string} Formatted ημερομηνία
 */
export function formatMonthYear(month, year) {
    return `${String(month).padStart(2, '0')}/${year}`;
}

/**
 * Validate ημερομηνία MM/YYYY format
 * @param {string} dateStr - Ημερομηνία
 * @returns {boolean}
 */
export function isValidMonthYear(dateStr) {
    return parseMonthYear(dateStr) !== null;
}

/**
 * Σύγκριση δύο ημερομηνιών MM/YYYY
 * @param {string} date1 - Πρώτη ημερομηνία
 * @param {string} date2 - Δεύτερη ημερομηνία
 * @returns {number} -1 αν date1 < date2, 0 αν ίσες, 1 αν date1 > date2
 */
export function compareDates(date1, date2) {
    const d1 = parseMonthYear(date1);
    const d2 = parseMonthYear(date2);
    
    if (!d1 || !d2) return 0;
    
    if (d1.year !== d2.year) {
        return d1.year < d2.year ? -1 : 1;
    }
    
    if (d1.month !== d2.month) {
        return d1.month < d2.month ? -1 : 1;
    }
    
    return 0;
}

/**
 * Generate date range
 * @param {string} startDate - Αρχή MM/YYYY
 * @param {string} endDate - Τέλος MM/YYYY
 * @returns {string[]} Array ημερομηνιών
 */
export function generateDateRange(startDate, endDate) {
    const start = parseMonthYear(startDate);
    const end = parseMonthYear(endDate);
    
    if (!start || !end) return [];
    
    const dates = [];
    let current = { ...start };
    
    while (current.year < end.year || (current.year === end.year && current.month <= end.month)) {
        dates.push(formatMonthYear(current.month, current.year));
        
        current.month++;
        if (current.month > 12) {
            current.month = 1;
            current.year++;
        }
    }
    
    return dates;
}

/**
 * Setup date auto-format για input element
 * @param {HTMLInputElement} inputElement - Input element
 */
export function setupDateAutoFormat(inputElement) {
    if (!inputElement) return;
    
    inputElement.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        
        if (value.length >= 2) {
            value = value.slice(0, 2) + '/' + value.slice(2);
        }
        
        if (value.length === 4 && value.includes('/')) {
            const parts = value.split('/');
            if (parts[1] && parts[1].length === 2) {
                const currentYear = new Date().getFullYear();
                const century = Math.floor(currentYear / 100) * 100;
                value = parts[0] + '/' + (century + parseInt(parts[1]));
            }
        }
        
        e.target.value = value.slice(0, 7);
    });
}

// ========================================
// Currency Formatting
// ========================================

/**
 * Format ποσό σε ευρώ (€ xxx.xxx,xx)
 * @param {number|string} amount - Ποσό
 * @returns {string} Formatted ποσό
 */
export function formatCurrency(amount) {
    const num = parseFloat(amount);
    if (isNaN(num)) return '€ 0,00';
    
    // Format: χιλιάδες με τελεία, δεκαδικά με κόμμα
    return '€ ' + num.toFixed(2)
        .replace('.', ',')
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Parse ποσό από formatted string
 * @param {string} formattedAmount - Formatted ποσό (π.χ. "€ 1.234,56")
 * @returns {number} Numeric ποσό
 */
export function parseCurrency(formattedAmount) {
    if (typeof formattedAmount === 'number') return formattedAmount;
    
    const cleaned = String(formattedAmount)
        .replace(/€/g, '')
        .replace(/\s/g, '')
        .replace(/\./g, '') // Remove thousand separators
        .replace(/,/g, '.'); // Replace decimal comma with dot
    
    return parseFloat(cleaned) || 0;
}

/**
 * Format ποσό για CSV export (numeric)
 * @param {number} amount - Ποσό
 * @returns {string} Numeric string
 */
export function formatCurrencyForExport(amount) {
    return parseFloat(amount).toFixed(2);
}

// ========================================
// Number Formatting
// ========================================

/**
 * Format ποσοστό
 * @param {number} value - Τιμή ποσοστού
 * @param {number} decimals - Δεκαδικά ψηφία
 * @returns {string}
 */
export function formatPercent(value, decimals = 2) {
    return `${parseFloat(value).toFixed(decimals)}%`;
}

/**
 * Calculate ποσοστό
 * @param {number} part - Μέρος
 * @param {number} total - Σύνολο
 * @returns {number}
 */
export function calculatePercent(part, total) {
    if (total === 0) return 0;
    return (part / total) * 100;
}

/**
 * Calculate ποσοστιαία αλλαγή
 * @param {number} oldValue - Παλιά τιμή
 * @param {number} newValue - Νέα τιμή
 * @returns {number}
 */
export function calculatePercentChange(oldValue, newValue) {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return ((newValue - oldValue) / oldValue) * 100;
}

// ========================================
// DateTime Functions
// ========================================

/**
 * Format timestamp σε ελληνική μορφή
 * @param {number} timestamp - Unix timestamp
 * @returns {string}
 */
export function formatDateTime(timestamp) {
    return new Date(timestamp).toLocaleString('el-GR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Format date σε ελληνική μορφή (μόνο ημερομηνία)
 * @param {number} timestamp - Unix timestamp
 * @returns {string}
 */
export function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('el-GR');
}

// ========================================
// Validation Functions
// ========================================

/**
 * Validate email format
 * @param {string} email - Email
 * @returns {boolean}
 */
export function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * Validate ποσό
 * @param {any} amount - Ποσό
 * @returns {boolean}
 */
export function isValidAmount(amount) {
    const num = parseFloat(amount);
    return !isNaN(num) && num >= 0;
}

/**
 * Check για μη έγκυρους χαρακτήρες (emoji, special chars)
 * @param {string} text - Κείμενο
 * @returns {boolean}
 */
export function hasInvalidCharacters(text) {
    // Check for emoji and other problematic unicode
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    return emojiRegex.test(text);
}

/**
 * Sanitize text input
 * @param {string} text - Κείμενο
 * @returns {string} Sanitized text
 */
export function sanitizeText(text) {
    if (!text) return '';
    return text.trim().replace(/[^\w\s\-.,;:!?()\u0370-\u03FF\u1F00-\u1FFF€]/g, '');
}

// ========================================
// ID Generation
// ========================================

/**
 * Generate unique ID
 * @returns {string}
 */
export function generateId() {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * Generate UUID v4
 * @returns {string}
 */
export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ========================================
// Array & Object Utilities
// ========================================

/**
 * Deep clone object
 * @param {any} obj - Object
 * @returns {any} Cloned object
 */
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    
    if (obj instanceof Date) return new Date(obj);
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    
    const cloned = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            cloned[key] = deepClone(obj[key]);
        }
    }
    return cloned;
}

/**
 * Group array by key
 * @param {Array} array - Array
 * @param {string|Function} key - Key ή function
 * @returns {Object}
 */
export function groupBy(array, key) {
    return array.reduce((result, item) => {
        const groupKey = typeof key === 'function' ? key(item) : item[key];
        (result[groupKey] = result[groupKey] || []).push(item);
        return result;
    }, {});
}

/**
 * Sum array values
 * @param {Array} array - Array
 * @param {string|Function} key - Key ή function
 * @returns {number}
 */
export function sumBy(array, key) {
    return array.reduce((sum, item) => {
        const value = typeof key === 'function' ? key(item) : item[key];
        return sum + (parseFloat(value) || 0);
    }, 0);
}

/**
 * Sort array by key
 * @param {Array} array - Array
 * @param {string|Function} key - Key ή function
 * @param {boolean} desc - Descending order
 * @returns {Array}
 */
export function sortBy(array, key, desc = false) {
    const sorted = [...array].sort((a, b) => {
        const aVal = typeof key === 'function' ? key(a) : a[key];
        const bVal = typeof key === 'function' ? key(b) : b[key];
        
        if (aVal < bVal) return desc ? 1 : -1;
        if (aVal > bVal) return desc ? -1 : 1;
        return 0;
    });
    
    return sorted;
}

// ========================================
// Debounce & Throttle
// ========================================

/**
 * Debounce function
 * @param {Function} func - Function
 * @param {number} wait - Wait time σε ms
 * @returns {Function}
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function
 * @param {Function} func - Function
 * @param {number} limit - Limit σε ms
 * @returns {Function}
 */
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ========================================
// File Utilities
// ========================================

/**
 * Download file as blob
 * @param {string} filename - Filename
 * @param {Blob} blob - Blob data
 */
export function downloadBlob(filename, blob) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

/**
 * Read file as text
 * @param {File} file - File object
 * @returns {Promise<string>}
 */
export function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}

/**
 * Read file as Data URL
 * @param {File} file - File object
 * @returns {Promise<string>}
 */
export function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

// ========================================
// Network Utilities
// ========================================

/**
 * Check internet connectivity
 * @returns {Promise<boolean>}
 */
export async function checkInternetConnection() {
    try {
        const response = await fetch('https://www.google.com/favicon.ico', {
            method: 'HEAD',
            cache: 'no-cache',
            mode: 'no-cors'
        });
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Check CDN availability
 * @param {string} url - CDN URL
 * @returns {Promise<boolean>}
 */
export async function checkCDNAvailability(url) {
    try {
        const response = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
        return response.ok;
    } catch (error) {
        return false;
    }
}

// ========================================
// Error Handling
// ========================================

/**
 * Safe async operation με error handling
 * @param {Function} asyncFn - Async function
 * @param {any} fallbackValue - Fallback value σε error
 * @returns {Promise<any>}
 */
export async function safeAsync(asyncFn, fallbackValue = null) {
    try {
        return await asyncFn();
    } catch (error) {
        console.error('Async operation error:', error);
        return fallbackValue;
    }
}

/**
 * Log error με context
 * @param {string} context - Context
 * @param {Error} error - Error object
 */
export function logError(context, error) {
    console.error(`[${context}]`, error);
}

/**
 * Measure function execution time
 * @param {Function} func - Function
 * @param {string} label - Label για console
 * @returns {any} Function result
 */
export function measurePerformance(func, label = 'Operation') {
    const start = performance.now();
    const result = func();
    const end = performance.now();
    console.log(`${label} took ${(end - start).toFixed(2)}ms`);
    return result;
}

// ========================================
// Export all utilities
// ========================================

export default {
    STRINGS,
    escapeHtml,
    parseMonthYear,
    formatMonthYear,
    isValidMonthYear,
    compareDates,
    generateDateRange,
    setupDateAutoFormat,
    formatCurrency,
    parseCurrency,
    formatCurrencyForExport,
    formatPercent,
    calculatePercent,
    calculatePercentChange,
    formatDateTime,
    formatDate,
    isValidEmail,
    isValidAmount,
    hasInvalidCharacters,
    sanitizeText,
    generateId,
    generateUUID,
    deepClone,
    groupBy,
    sumBy,
    sortBy,
    debounce,
    throttle,
    downloadBlob,
    readFileAsText,
    readFileAsDataURL,
    checkInternetConnection,
    checkCDNAvailability,
    safeAsync,
    logError,
    measurePerformance
};