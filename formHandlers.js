/**
 * formHandlers.js - Form Handling Module
 * Form validation, auto-calculations, deduction fields management
 * Version: 2.0 (Clean Rewrite)
 */

import { STATE } from './state.js';
import eopyyDeductionsManager from './eopyyClawback.js';
import { formatCurrency, STRINGS } from './utils.js';

// ========================================
// Deduction Fields Visibility
// ========================================

/**
 * Show/hide deduction fields for Quick Add form
 */
export function showDeductionFields() {
    const insurance = document.getElementById('quickInsurance')?.value;
    const type = document.getElementById('quickType')?.value;
    
    const isEopyy = insurance && insurance.toUpperCase().includes('ΕΟΠΥΥ');
    const isInvoice = type === 'invoice';
    
    const eopyyDeductions = document.getElementById('quickEopyyDeductions');
    const nonEopyyDeductions = document.getElementById('quickNonEopyyDeductions');
    
    if (eopyyDeductions) {
        eopyyDeductions.style.display = (isEopyy && isInvoice) ? 'block' : 'none';
    }
    
    if (nonEopyyDeductions) {
        nonEopyyDeductions.style.display = (!isEopyy && isInvoice) ? 'block' : 'none';
    }
    
    // Recalculate final amount
    calculateFinalAmount('quick');
}

/**
 * Show/hide deduction fields for Entry modal
 */
export function showModalDeductionFields() {
    const insurance = document.getElementById('entryInsurance')?.value;
    const type = document.getElementById('entryType')?.value;
    
    const isEopyy = insurance && insurance.toUpperCase().includes('ΕΟΠΥΥ');
    const isInvoice = type === 'invoice';
    
    const eopyyDeductions = document.getElementById('modalEopyyDeductions');
    const nonEopyyDeductions = document.getElementById('modalNonEopyyDeductions');
    
    if (eopyyDeductions) {
        eopyyDeductions.style.display = (isEopyy && isInvoice) ? 'block' : 'none';
    }
    
    if (nonEopyyDeductions) {
        nonEopyyDeductions.style.display = (!isEopyy && isInvoice) ? 'block' : 'none';
    }
    
    // Recalculate final amount
    calculateFinalAmount('entry');
}

// ========================================
// Final Amount Calculation
// ========================================

/**
 * Calculate and display final amount
 * @param {string} prefix - 'quick' or 'entry'
 */
export function calculateFinalAmount(prefix) {
    const amountEl = document.getElementById(`${prefix}Amount`);
    const insuranceEl = document.getElementById(`${prefix}Insurance`);
    const displayEl = document.getElementById(prefix === 'quick' ? 'quickFinalAmount' : 'modalFinalAmount');
    
    if (!amountEl || !insuranceEl || !displayEl) return;
    
    const amount = parseFloat(amountEl.value) || 0;
    const insurance = insuranceEl.value;
    const isEopyy = insurance && insurance.toUpperCase().includes('ΕΟΠΥΥ');
    
    let totalDeductions = 0;
    
    if (isEopyy) {
        // ΕΟΠΥΥ: 5 deductions
        const parakratisi = parseFloat(document.getElementById(`${prefix}Parakratisi`)?.value) || 0;
        const mde = parseFloat(document.getElementById(`${prefix}MDE`)?.value) || 0;
        const rebate = parseFloat(document.getElementById(`${prefix}Rebate`)?.value) || 0;
        const krathseis = parseFloat(document.getElementById(`${prefix}KrathseisEopyy`)?.value) || 0;
        const clawback = parseFloat(document.getElementById(`${prefix}Clawback`)?.value) || 0;
        
        totalDeductions = parakratisi + mde + rebate + krathseis + clawback;
    } else {
        // Non-ΕΟΠΥΥ: 1 deduction
        totalDeductions = parseFloat(document.getElementById(`${prefix}KrathseisOther`)?.value) || 0;
    }
    
    // ✅ ΚΡΙΣΙΜΗ ΛΟΓΙΚΗ: Default χωρίς παρακράτηση
    const finalAmount = amount - totalDeductions;
    
    displayEl.textContent = formatCurrency(finalAmount);
}

// ========================================
// Percentage Sync (Bidirectional)
// ========================================

/**
 * Setup bidirectional sync between amount and percentage fields
 * @param {string} amountId - Amount input ID
 * @param {string} percentId - Percent input ID
 * @param {Function} baseAmountGetter - Function to get base amount
 */
export function setupPercentageSync(amountId, percentId, baseAmountGetter) {
    const amountInput = document.getElementById(amountId);
    const percentInput = document.getElementById(percentId);
    
    if (!amountInput || !percentInput) return;
    
    // Track which field was last changed to prevent infinite loops
    let lastChanged = null;
    
    // Amount input changes → update percent
    amountInput.addEventListener('input', (e) => {
        if (lastChanged === 'percent') {
            lastChanged = null;
            return;
        }
        
        lastChanged = 'amount';
        const baseAmount = baseAmountGetter();
        const amount = parseFloat(amountInput.value) || 0;
        
        if (baseAmount > 0) {
            percentInput.value = ((amount / baseAmount) * 100).toFixed(2);
        } else {
            percentInput.value = '0.00';
        }
        
        // Trigger final amount recalculation
        const prefix = amountId.startsWith('quick') ? 'quick' : 'entry';
        calculateFinalAmount(prefix);
        
        // Reset flag after a short delay
        setTimeout(() => { lastChanged = null; }, 10);
    });
    
    // Percent input changes → update amount
    percentInput.addEventListener('input', (e) => {
        if (lastChanged === 'amount') {
            lastChanged = null;
            return;
        }
        
        lastChanged = 'percent';
        const baseAmount = baseAmountGetter();
        const percent = parseFloat(percentInput.value) || 0;
        
        amountInput.value = ((baseAmount * percent) / 100).toFixed(2);
        
        // Trigger final amount recalculation
        const prefix = amountId.startsWith('quick') ? 'quick' : 'entry';
        calculateFinalAmount(prefix);
        
        // Reset flag after a short delay
        setTimeout(() => { lastChanged = null; }, 10);
    });
}

// ========================================
// Form Setup Functions
// ========================================

/**
 * Setup percentage sync for Quick Add form
 */
export function setupQuickFormPercentages() {
    const getQuickAmount = () => parseFloat(document.getElementById('quickAmount')?.value) || 0;
    
    setupPercentageSync('quickParakratisi', 'quickParakratisiPercent', getQuickAmount);
    setupPercentageSync('quickMDE', 'quickMDEPercent', getQuickAmount);
    setupPercentageSync('quickRebate', 'quickRebatePercent', getQuickAmount);
    setupPercentageSync('quickKrathseisEopyy', 'quickKrathseisEopyyPercent', getQuickAmount);
    setupPercentageSync('quickClawback', 'quickClawbackPercent', getQuickAmount);
    setupPercentageSync('quickKrathseisOther', 'quickKrathseisOtherPercent', getQuickAmount);
}

/**
 * Setup percentage sync for Entry modal
 */
export function setupModalFormPercentages() {
    const getModalAmount = () => parseFloat(document.getElementById('entryAmount')?.value) || 0;
    
    setupPercentageSync('entryParakratisi', 'entryParakratisiPercent', getModalAmount);
    setupPercentageSync('entryMDE', 'entryMDEPercent', getModalAmount);
    setupPercentageSync('entryRebate', 'entryRebatePercent', getModalAmount);
    setupPercentageSync('entryKrathseisEopyy', 'entryKrathseisEopyyPercent', getModalAmount);
    setupPercentageSync('entryClawback', 'entryClawbackPercent', getModalAmount);
    setupPercentageSync('entryKrathseisOther', 'entryKrathseisOtherPercent', getModalAmount);
}

// ========================================
// Notes Toggle
// ========================================

/**
 * Setup notes field toggle (show/hide)
 */
export function setupNotesToggle() {
    // Quick form notes toggle
    const quickNotesToggle = document.getElementById('quickNotesToggle');
    const quickNotes = document.getElementById('quickNotes');
    
    if (quickNotesToggle && quickNotes) {
        quickNotesToggle.addEventListener('change', (e) => {
            quickNotes.style.display = e.target.checked ? 'block' : 'none';
            if (!e.target.checked) {
                quickNotes.value = ''; // Clear notes when hiding
            }
        });
    }
    
    // Modal notes toggle
    const entryNotesToggle = document.getElementById('entryNotesToggle');
    const entryNotes = document.getElementById('entryNotes');
    
    if (entryNotesToggle && entryNotes) {
        entryNotesToggle.addEventListener('change', (e) => {
            entryNotes.style.display = e.target.checked ? 'block' : 'none';
            if (!e.target.checked) {
                entryNotes.value = ''; // Clear notes when hiding
            }
        });
    }
}

// ========================================
// Form Event Listeners
// ========================================

/**
 * Setup all form event listeners
 */
export function setupFormEventListeners() {
    // Quick form listeners
    const quickType = document.getElementById('quickType');
    const quickInsurance = document.getElementById('quickInsurance');
    const quickAmount = document.getElementById('quickAmount');
    
    if (quickType) {
        quickType.addEventListener('change', showDeductionFields);
    }
    
    if (quickInsurance) {
        quickInsurance.addEventListener('change', showDeductionFields);
    }
    
    if (quickAmount) {
        quickAmount.addEventListener('input', () => {
            calculateFinalAmount('quick');
            // Update all percentage fields when base amount changes
            const amount = parseFloat(quickAmount.value) || 0;
            if (amount > 0) {
                updatePercentagesFromAmounts('quick', amount);
            }
        });
    }
    
    // Modal form listeners
    const entryType = document.getElementById('entryType');
    const entryInsurance = document.getElementById('entryInsurance');
    const entryAmount = document.getElementById('entryAmount');
    
    if (entryType) {
        entryType.addEventListener('change', showModalDeductionFields);
    }
    
    if (entryInsurance) {
        entryInsurance.addEventListener('change', showModalDeductionFields);
    }
    
    if (entryAmount) {
        entryAmount.addEventListener('input', () => {
            calculateFinalAmount('entry');
            // Update all percentage fields when base amount changes
            const amount = parseFloat(entryAmount.value) || 0;
            if (amount > 0) {
                updatePercentagesFromAmounts('entry', amount);
            }
        });
    }
}

/**
 * Update all percentage fields when base amount changes
 * @param {string} prefix - 'quick' or 'entry'
 * @param {number} baseAmount - Base amount
 */
function updatePercentagesFromAmounts(prefix, baseAmount) {
    const deductionFields = [
        'Parakratisi',
        'MDE',
        'Rebate',
        'KrathseisEopyy',
        'Clawback',
        'KrathseisOther'
    ];
    
    deductionFields.forEach(field => {
        const amountEl = document.getElementById(`${prefix}${field}`);
        const percentEl = document.getElementById(`${prefix}${field}Percent`);
        
        if (amountEl && percentEl && amountEl.value) {
            const amount = parseFloat(amountEl.value) || 0;
            percentEl.value = ((amount / baseAmount) * 100).toFixed(2);
        }
    });
}

// ========================================
// Form Reset Functions
// ========================================

/**
 * Reset Quick Add form
 */
export function resetQuickForm() {
    // Clear amount and notes
    const amountField = document.getElementById('quickAmount');
    const notesField = document.getElementById('quickNotes');
    const notesToggle = document.getElementById('quickNotesToggle');
    
    if (amountField) amountField.value = '';
    if (notesField) notesField.value = '';
    if (notesToggle) notesToggle.checked = false;
    if (notesField) notesField.style.display = 'none';
    
    // Clear all deduction fields (amounts AND percentages)
    const deductionFields = [
        'quickParakratisi', 'quickParakratisiPercent',
        'quickMDE', 'quickMDEPercent',
        'quickRebate', 'quickRebatePercent',
        'quickKrathseisEopyy', 'quickKrathseisEopyyPercent',
        'quickClawback', 'quickClawbackPercent',
        'quickKrathseisOther', 'quickKrathseisOtherPercent'
    ];
    
    deductionFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    // Reset clawback period to default
    const clawbackPeriod = document.getElementById('quickClawbackPeriod');
    if (clawbackPeriod) clawbackPeriod.value = 'monthly';
    
    // Reset final amount display
    const finalAmountDisplay = document.getElementById('quickFinalAmount');
    if (finalAmountDisplay) {
        finalAmountDisplay.textContent = '€ 0,00';
    }
    
    // Hide deduction fields
    const eopyyDeductions = document.getElementById('quickEopyyDeductions');
    const nonEopyyDeductions = document.getElementById('quickNonEopyyDeductions');
    if (eopyyDeductions) eopyyDeductions.style.display = 'none';
    if (nonEopyyDeductions) nonEopyyDeductions.style.display = 'none';
}

/**
 * Reset Entry modal form
 */
export function resetModalForm() {
    // Clear all fields
    const fields = [
        'entryId', 'entryDate', 'entryAmount',
        'entryParakratisi', 'entryParakratisiPercent',
        'entryMDE', 'entryMDEPercent',
        'entryRebate', 'entryRebatePercent',
        'entryKrathseisEopyy', 'entryKrathseisEopyyPercent',
        'entryClawback', 'entryClawbackPercent',
        'entryKrathseisOther', 'entryKrathseisOtherPercent',
        'entryNotes'
    ];
    
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    // Reset notes toggle
    const entryNotesToggle = document.getElementById('entryNotesToggle');
    const entryNotes = document.getElementById('entryNotes');
    
    if (entryNotesToggle) entryNotesToggle.checked = false;
    if (entryNotes) entryNotes.style.display = 'none';
    
    // Reset clawback period to default
    const clawbackPeriod = document.getElementById('entryClawbackPeriod');
    if (clawbackPeriod) clawbackPeriod.value = 'monthly';
    
    // Reset final amount display
    const finalAmountDisplay = document.getElementById('modalFinalAmount');
    if (finalAmountDisplay) {
        finalAmountDisplay.textContent = '€ 0,00';
    }
    
    // Hide deduction fields
    const eopyyDeductions = document.getElementById('modalEopyyDeductions');
    const nonEopyyDeductions = document.getElementById('modalNonEopyyDeductions');
    if (eopyyDeductions) eopyyDeductions.style.display = 'none';
    if (nonEopyyDeductions) nonEopyyDeductions.style.display = 'none';
    
    // Clear editing state
    STATE.editingEntry = null;
}

// ========================================
// Remember Last Selections
// ========================================

/**
 * Setup "remember last selections" for dropdowns
 */
export function setupRememberSelections() {
    const fieldsToRemember = [
        { id: 'quickSource', storageKey: 'last_quickSource' },
        { id: 'quickInsurance', storageKey: 'last_quickInsurance' },
        { id: 'quickType', storageKey: 'last_quickType' }
    ];
    
    fieldsToRemember.forEach(({ id, storageKey }) => {
        const el = document.getElementById(id);
        if (!el) return;
        
        // Load saved value
        const savedValue = localStorage.getItem(storageKey);
        if (savedValue) {
            el.value = savedValue;
            
            // Trigger change event to show/hide deduction fields
            if (id === 'quickInsurance' || id === 'quickType') {
                showDeductionFields();
            }
        }
        
        // Save on change
        el.addEventListener('change', () => {
            localStorage.setItem(storageKey, el.value);
        });
    });
}

// ========================================
// Validation Helpers
// ========================================

/**
 * Validate form data before submit
 * @param {Object} entry - Entry data
 * @returns {Object} Validation result
 */
export function validateFormData(entry) {
    const errors = [];
    
    // Required fields
    if (!entry.date) errors.push('Η ημερομηνία είναι υποχρεωτική');
    if (!entry.source) errors.push('Η πηγή είναι υποχρεωτική');
    if (!entry.insurance) errors.push('Η ασφάλεια είναι υποχρεωτική');
    if (!entry.type) errors.push('Ο τύπος είναι υποχρεωτικός');
    if (entry.amount === undefined || entry.amount === null) {
        errors.push('Το ποσό είναι υποχρεωτικό');
    }
    
    // Amount validation
    if (entry.amount < 0) errors.push('Το ποσό δεν μπορεί να είναι αρνητικό');
    
    // Date format validation
    if (entry.date && !entry.date.match(/^\d{2}\/\d{4}$/)) {
        errors.push('Η ημερομηνία πρέπει να είναι σε μορφή ΜΜ/ΕΕΕΕ');
    }
    
    // Deductions validation for ΕΟΠΥΥ
    if (entry.insurance && entry.insurance.toUpperCase().includes('ΕΟΠΥΥ') && entry.deductions) {
        const totalDeductions = 
            (entry.deductions.parakratisi || 0) +
            (entry.deductions.mde || 0) +
            (entry.deductions.rebate || 0) +
            (entry.deductions.krathseis || 0) +
            (entry.deductions.clawback || 0);
        
        if (totalDeductions > entry.amount) {
            errors.push('Το σύνολο των κρατήσεων υπερβαίνει το αρχικό ποσό');
        }
        
        // Validate percentages
        const totalPercent = 
            (entry.deductions.parakratisiPercent || 0) +
            (entry.deductions.mdePercent || 0) +
            (entry.deductions.rebatePercent || 0) +
            (entry.deductions.krathseisPercent || 0) +
            (entry.deductions.clawbackPercent || 0);
        
        if (totalPercent > 100) {
            errors.push('Το σύνολο των ποσοστών υπερβαίνει το 100%');
        }
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

// ========================================
// Export All
// ========================================
export default {
    showDeductionFields,
    showModalDeductionFields,
    calculateFinalAmount,
    setupPercentageSync,
    setupQuickFormPercentages,
    setupModalFormPercentages,
    setupNotesToggle,
    setupFormEventListeners,
    resetQuickForm,
    resetModalForm,
    setupRememberSelections,
    validateFormData
};

// ========================================
// Window Bindings for Quick Form
// ========================================

/**
 * Make functions available globally for inline event handlers
 */
if (typeof window !== 'undefined') {
    window.showDeductionFields = showDeductionFields;
    window.calculateFinalAmount = calculateFinalAmount;
}