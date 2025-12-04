/**
 * utils.js - Helper Functions Library
 * Pure utility functions with no side effects
 * Version: 2.0 (Clean Rewrite)
 */

// ========================================
// i18n Strings
// ========================================
export const STRINGS = Object.freeze({
    errors: {
        invalidDate: 'Μη έγκυρη ημερομηνία. Χρησιμοποιήστε μορφή ΜΜ/ΕΕΕΕ',
        duplicateEntry: 'Υπάρχει ήδη εγγραφή για αυτή την ημερομηνία και πηγή!',
        quotaExceeded: 'Ο διαθέσιμος χώρος αποθήκευσης εξαντλήθηκε',
        importFailed: 'Η εισαγωγή απέτυχε',
        networkError: 'Σφάλμα δικτύου',
        cdnUnavailable: 'Οι βιβλιοθήκες CDN δεν είναι διαθέσιμες',
        invalidAmount: 'Μη έγκυρο ποσό',
        invalidPercent: 'Μη έγκυρο ποσοστό (0-100)',
        requiredField: 'Υποχρεωτικό πεδίο'
    },
    success: {
        entrySaved: 'Η εγγραφή αποθηκεύτηκε επιτυχώς',
        entryDeleted: 'Η εγγραφή διαγράφηκε επιτυχώς',
        backupCreated: 'Το backup δημιουργήθηκε επιτυχώς',
        importCompleted: 'Η εισαγωγή ολοκληρώθηκε',
        cacheCleared: 'Η προσωρινή μνήμη καθαρίστηκε'
    },
    info: {
        saving: 'Αποθήκευση...',
        saved: 'Αποθηκεύτηκε',
        loading: 'Φόρτωση...',
        processing: 'Επεξεργασία...'
    }
});

// ========================================
// HTML & Text Utilities
// ========================================

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Sanitize text input (remove special chars, emoji)
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export function sanitizeText(text) {
    if (!text) return '';
    return text.trim().replace(/[^\w\s\-.,;:!?()\u0370-\u03FF\u1F00-\u1FFF€]/g, '');
}

/**
 * Check for invalid characters (emoji, special unicode)
 * @param {string} text - Text to check
 * @returns {boolean} True if invalid chars found
 */
export function hasInvalidCharacters(text) {
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    return emojiRegex.test(text);
}

// ========================================
// Date Functions
// ========================================

/**
 * Parse date string in MM/YYYY format
 * @param {string} dateStr - Date string
 * @returns {{month: number, year: number}|null}
 */
export function parseMonthYear(dateStr) {
    if (!dateStr) return null;
    
    const parts = dateStr.trim().split('/');
    if (parts.length !== 2) return null;
    
    const month = parseInt(parts[0], 10);
    const year = parseInt(parts[1], 10);
    
    if (isNaN(month) || isNaN(year)) return null;
    if (month < 1 || month > 12) return null;
    if (year < 2000 || year > 2100) return null;
    
    return { month, year };
}

/**
 * Format month and year to MM/YYYY
 * @param {number} month - Month (1-12)
 * @param {number} year - Year
 * @returns {string} Formatted date
 */
export function formatMonthYear(month, year) {
    return `${String(month).padStart(2, '0')}/${year}`;
}

/**
 * Validate date in MM/YYYY format
 * @param {string} dateStr - Date string
 * @returns {boolean} Valid or not
 */
export function isValidMonthYear(dateStr) {
    return parseMonthYear(dateStr) !== null;
}

/**
 * Compare two dates in MM/YYYY format
 * @param {string} date1 - First date
 * @param {string} date2 - Second date
 * @returns {number} -1 if date1 < date2, 0 if equal, 1 if date1 > date2
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
 * Generate array of dates between start and end
 * @param {string} startDate - Start date MM/YYYY
 * @param {string} endDate - End date MM/YYYY
 * @returns {string[]} Array of dates
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
 * ✅ FIX 4: Enhanced Date Input UX
 * FEATURES:
 * 1. Auto-complete: "01/25" → "01/2025"
 * 2. Smart backspace handling
 * 3. Natural slash behavior
 * 4. Blur auto-complete
 */

export function setupDateAutoFormat(inputElement) {
    if (!inputElement) return;
    
    let isBackspacing = false;
    let lastValue = '';
    
    // Track backspace key
    inputElement.addEventListener('keydown', (e) => {
        isBackspacing = e.key === 'Backspace';
        lastValue = e.target.value;
    });
    
    inputElement.addEventListener('input', (e) => {
        let value = e.target.value;
        let cursorPos = e.target.selectionStart;
        
        // ✅ FIX 1: Handle backspace naturally
        if (isBackspacing) {
            // If user deleted the slash, also delete the digit before it
            if (lastValue.includes('/') && !value.includes('/') && value.length === 2) {
                e.target.value = value.charAt(0);
                setTimeout(() => e.target.setSelectionRange(1, 1), 0);
                return;
            }
            
            // Allow natural backspace without reformatting
            // Just ensure we don't have invalid characters
            const cleaned = value.replace(/[^\d/]/g, '');
            e.target.value = cleaned;
            return;
        }
        
        // ✅ FIX 2: Remove all non-digits for formatting
        let digits = value.replace(/\D/g, '');
        
        // ✅ FIX 3: Format based on length
        if (digits.length === 0) {
            e.target.value = '';
            return;
        }
        
        if (digits.length <= 2) {
            // Month only: "01" or "1"
            e.target.value = digits;
            
        } else if (digits.length <= 4) {
            // Month + partial year: "01/2" or "01/25"
            const month = digits.substring(0, 2);
            const year = digits.substring(2);
            e.target.value = `${month}/${year}`;
            
        } else {
            // Full date: auto-complete to 4-digit year
            const month = digits.substring(0, 2);
            let year = digits.substring(2, 6);
            
            // ✅ FIX 4: Smart year completion
            if (year.length === 2) {
                year = completeYear(year);
            } else if (year.length === 3) {
                // User is typing 3rd digit - don't complete yet
                year = year;
            } else if (year.length >= 4) {
                // Keep 4 digits max
                year = year.substring(0, 4);
            }
            
            e.target.value = `${month}/${year}`;
        }
        
        // ✅ FIX 5: Smart cursor positioning
        if (digits.length === 2 && !isBackspacing) {
            // After typing month, jump cursor after slash
            setTimeout(() => e.target.setSelectionRange(3, 3), 0);
        }
    });
    
    // ✅ FIX 6: Auto-complete on blur
    inputElement.addEventListener('blur', (e) => {
        const value = e.target.value.replace(/[^\d]/g, '');
        
        if (value.length >= 2 && value.length < 6) {
            const month = value.substring(0, 2);
            let year = value.substring(2);
            
            // Complete partial year
            if (year.length > 0 && year.length < 4) {
                year = completeYear(year.padEnd(2, '0').substring(0, 2));
            }
            
            if (year.length === 4) {
                e.target.value = `${month}/${year}`;
            }
        }
    });
    
    // ✅ FIX 7: Prevent paste of invalid formats
    inputElement.addEventListener('paste', (e) => {
        e.preventDefault();
        
        const pastedText = (e.clipboardData || window.clipboardData).getData('text');
        const digits = pastedText.replace(/\D/g, '');
        
        if (digits.length >= 2) {
            const month = digits.substring(0, 2);
            let year = digits.substring(2, 6);
            
            if (year.length === 2) {
                year = completeYear(year);
            }
            
            e.target.value = year.length >= 4 ? `${month}/${year}` : `${month}/${year}`;
            e.target.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
}

/**
 * ✅ NEW HELPER: Smart year completion
 * Converts 2-digit year to 4-digit year
 * 
 * Logic:
 * - 00-50 → 2000-2050
 * - 51-99 → 1951-1999
 */
function completeYear(twoDigitYear) {
    const year = parseInt(twoDigitYear);
    
    if (isNaN(year)) {
        return new Date().getFullYear().toString();
    }
    
    const currentYear = new Date().getFullYear();
    const currentCentury = Math.floor(currentYear / 100) * 100;
    
    // Smart logic: 
    // If year <= 50, assume 20xx
    // If year > 50, assume 19xx
    if (year <= 50) {
        return (currentCentury + year).toString();
    } else {
        return (currentCentury - 100 + year).toString();
    }
}

// ========================================
// Currency Functions (Greek Format)
// ========================================

/**
 * Format amount as Greek currency (€ 1.234,56)
 * @param {number|string} amount - Amount
 * @returns {string} Formatted currency
 */
export function formatCurrency(amount) {
    const num = parseFloat(amount);
    if (isNaN(num)) return '€ 0,00';
    
    // Format: thousands with '.', decimals with ','
    return '€ ' + num.toFixed(2)
        .replace('.', ',')
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Parse formatted currency string to number
 * @param {string} formattedAmount - Formatted amount
 * @returns {number} Numeric amount
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
 * Format amount for CSV export (numeric string)
 * @param {number} amount - Amount
 * @returns {string} Numeric string
 */
export function formatCurrencyForExport(amount) {
    return parseFloat(amount).toFixed(2);
}

// ========================================
// Number & Percentage Functions
// ========================================

/**
 * Format percentage
 * @param {number} value - Percentage value
 * @param {number} decimals - Decimal places
 * @returns {string} Formatted percentage
 */
export function formatPercent(value, decimals = 2) {
    const num = parseFloat(value);
    if (isNaN(num)) return '0,00%';
    return `${num.toFixed(decimals).replace('.', ',')}%`;
}

/**
 * Calculate percentage (part/total * 100)
 * @param {number} part - Part value
 * @param {number} total - Total value
 * @returns {number} Percentage
 */
export function calculatePercent(part, total) {
    if (total === 0) return 0;
    return (part / total) * 100;
}

/**
 * Calculate percentage change
 * @param {number} oldValue - Old value
 * @param {number} newValue - New value
 * @returns {number} Percentage change
 */
export function calculatePercentChange(oldValue, newValue) {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return ((newValue - oldValue) / oldValue) * 100;
}

// ========================================
// DateTime Functions
// ========================================

/**
 * Format timestamp to Greek datetime
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Formatted datetime
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
 * Format timestamp to Greek date only
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Formatted date
 */
export function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('el-GR');
}

// ========================================
// Validation Functions
// ========================================

/**
 * Validate email format
 * @param {string} email - Email address
 * @returns {boolean} Valid or not
 */
export function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * Validate amount (must be non-negative number)
 * @param {any} amount - Amount to validate
 * @returns {boolean} Valid or not
 */
export function isValidAmount(amount) {
    const num = parseFloat(amount);
    return !isNaN(num) && num >= 0;
}

/**
 * Validate percentage (0-100)
 * @param {any} percent - Percentage to validate
 * @returns {boolean} Valid or not
 */
export function isValidPercent(percent) {
    const num = parseFloat(percent);
    return !isNaN(num) && num >= 0 && num <= 100;
}

// ========================================
// ID Generation
// ========================================

/**
 * Generate unique ID (timestamp + random)
 * @returns {string} Unique ID
 */
export function generateId() {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * Generate UUID v4
 * @returns {string} UUID
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
 * Deep clone an object
 * @param {any} obj - Object to clone
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
 * @param {Array} array - Array to group
 * @param {string|Function} key - Key or function
 * @returns {Object} Grouped object
 */
export function groupBy(array, key) {
    return array.reduce((result, item) => {
        const groupKey = typeof key === 'function' ? key(item) : item[key];
        (result[groupKey] = result[groupKey] || []).push(item);
        return result;
    }, {});
}

/**
 * Sum array values by key
 * @param {Array} array - Array to sum
 * @param {string|Function} key - Key or function
 * @returns {number} Sum
 */
export function sumBy(array, key) {
    return array.reduce((sum, item) => {
        const value = typeof key === 'function' ? key(item) : item[key];
        return sum + (parseFloat(value) || 0);
    }, 0);
}

/**
 * Sort array by key
 * @param {Array} array - Array to sort
 * @param {string|Function} key - Key or function
 * @param {boolean} desc - Descending order
 * @returns {Array} Sorted array
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
// Performance Utilities
// ========================================

/**
 * Debounce function execution
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
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
 * Throttle function execution
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in ms
 * @returns {Function} Throttled function
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

/**
 * Measure function execution time
 * @param {Function} func - Function to measure
 * @param {string} label - Label for console output
 * @returns {any} Function result
 */
export function measurePerformance(func, label = 'Operation') {
    const start = performance.now();
    const result = func();
    const end = performance.now();
    console.log(`[Performance] ${label} took ${(end - start).toFixed(2)}ms`);
    return result;
}

// ========================================
// File Utilities
// ========================================

/**
 * Download blob as file
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
 * @returns {Promise<string>} File content
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
 * @returns {Promise<string>} Data URL
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
 * @returns {Promise<boolean>} Connected or not
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
 * @returns {Promise<boolean>} Available or not
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
 * Safe async operation with error handling
 * @param {Function} asyncFn - Async function
 * @param {any} fallbackValue - Fallback value on error
 * @returns {Promise<any>} Result or fallback
 */
export async function safeAsync(asyncFn, fallbackValue = null) {
    try {
        return await asyncFn();
    } catch (error) {
        console.error('[SafeAsync] Error:', error);
        return fallbackValue;
    }
}

/**
 * Log error with context
 * @param {string} context - Context description
 * @param {Error} error - Error object
 */
export function logError(context, error) {
    console.error(`[Error: ${context}]`, error);
    
    // Could send to error tracking service here
    // if (window.errorTracking) {
    //     window.errorTracking.log(context, error);
    // }
}

// ========================================
// Export All
// ========================================
export default {
    STRINGS,
    escapeHtml,
    sanitizeText,
    hasInvalidCharacters,
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
    isValidPercent,
    generateId,
    generateUUID,
    deepClone,
    groupBy,
    sumBy,
    sortBy,
    debounce,
    throttle,
    measurePerformance,
    downloadBlob,
    readFileAsText,
    readFileAsDataURL,
    checkInternetConnection,
    checkCDNAvailability,
    safeAsync,
    logError
};
