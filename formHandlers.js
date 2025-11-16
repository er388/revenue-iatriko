/**
 * formHandlers.js - Form Handling Module
 * Handles form validation, deduction fields, and calculations
 */

import { STATE } from './state.js';
import eopyyDeductionsManager from './eopyyClawback.js';
import { formatCurrency } from './utils.js';

// ========================================
// Deduction Fields Visibility
// ========================================

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
    
    calculateFinalAmount('quick');
}

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
    
    calculateFinalAmount('entry');
}

// ========================================
// Final Amount Calculation
// ========================================

export function calculateFinalAmount(prefix) {
    const amountEl = document.getElementById(`${prefix}Amount`);
    const insuranceEl = document.getElementById(`${prefix}Insurance`);
    
    if (!amountEl || !insuranceEl) return;
    
    const amount = parseFloat(amountEl.value) || 0;
    const insurance = insuranceEl.value;
    const isEopyy = insurance && insurance.toUpperCase().includes('ΕΟΠΥΥ');
    
    let totalDeductions = 0;
    
    if (isEopyy) {
        totalDeductions += parseFloat(document.getElementById(`${prefix}Parakratisi`)?.value) || 0;
        totalDeductions += parseFloat(document.getElementById(`${prefix}MDE`)?.value) || 0;
        totalDeductions += parseFloat(document.getElementById(`${prefix}Rebate`)?.value) || 0;
        totalDeductions += parseFloat(document.getElementById(`${prefix}KrathseisEopyy`)?.value) || 0;
        totalDeductions += parseFloat(document.getElementById(`${prefix}Clawback`)?.value) || 0;
    } else {
        totalDeductions += parseFloat(document.getElementById(`${prefix}KrathseisOther`)?.value) || 0;
    }
    
    const finalAmount = amount - totalDeductions;
    const displayId = prefix === 'quick' ? 'quickFinalAmount' : 'modalFinalAmount';
    const displayEl = document.getElementById(displayId);
    
    if (displayEl) {
        displayEl.textContent = formatCurrency(finalAmount);
    }
}

// ========================================
// Percentage Sync
// ========================================

export function setupPercentageSync(amountId, percentId, baseAmountGetter) {
    const amountInput = document.getElementById(amountId);
    const percentInput = document.getElementById(percentId);
    
    if (!amountInput || !percentInput) return;
    
    // Amount input changes -> update percent
    amountInput.addEventListener('input', () => {
        const baseAmount = baseAmountGetter();
        const amount = parseFloat(amountInput.value) || 0;
        if (baseAmount > 0) {
            percentInput.value = ((amount / baseAmount) * 100).toFixed(2);
        }
        const prefix = amountId.startsWith('quick') ? 'quick' : 'entry';
        calculateFinalAmount(prefix);
    });
    
    // Percent input changes -> update amount
    percentInput.addEventListener('input', () => {
        const baseAmount = baseAmountGetter();
        const percent = parseFloat(percentInput.value) || 0;
        amountInput.value = ((baseAmount * percent) / 100).toFixed(2);
        const prefix = amountId.startsWith('quick') ? 'quick' : 'entry';
        calculateFinalAmount(prefix);
    });
}

// ========================================
// Form Setup Functions
// ========================================

export function setupQuickFormPercentages() {
    const getQuickAmount = () => parseFloat(document.getElementById('quickAmount')?.value) || 0;
    
    setupPercentageSync('quickParakratisi', 'quickParakratisiPercent', getQuickAmount);
    setupPercentageSync('quickMDE', 'quickMDEPercent', getQuickAmount);
    setupPercentageSync('quickRebate', 'quickRebatePercent', getQuickAmount);
    setupPercentageSync('quickKrathseisEopyy', 'quickKrathseisEopyyPercent', getQuickAmount);
    setupPercentageSync('quickClawback', 'quickClawbackPercent', getQuickAmount);
    setupPercentageSync('quickKrathseisOther', 'quickKrathseisOtherPercent', getQuickAmount);
}

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

export function setupNotesToggle() {
    const quickNotesToggle = document.getElementById('quickNotesToggle');
    const quickNotes = document.getElementById('quickNotes');
    
    if (quickNotesToggle && quickNotes) {
        quickNotesToggle.addEventListener('change', (e) => {
            quickNotes.style.display = e.target.checked ? 'block' : 'none';
        });
    }
    
    const entryNotesToggle = document.getElementById('entryNotesToggle');
    const entryNotes = document.getElementById('entryNotes');
    
    if (entryNotesToggle && entryNotes) {
        entryNotesToggle.addEventListener('change', (e) => {
            entryNotes.style.display = e.target.checked ? 'block' : 'none';
        });
    }
}

// ========================================
// Form Event Listeners
// ========================================

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
        quickAmount.addEventListener('input', () => calculateFinalAmount('quick'));
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
        entryAmount.addEventListener('input', () => calculateFinalAmount('entry'));
    }
}

// ========================================
// Form Reset
// ========================================

export function resetQuickForm() {
    // Clear only amount and notes, keep selections
    const amountField = document.getElementById('quickAmount');
    const notesField = document.getElementById('quickNotes');
    const notesToggle = document.getElementById('quickNotesToggle');
    
    if (amountField) amountField.value = '';
    if (notesField) notesField.value = '';
    if (notesToggle) notesToggle.checked = false;
    if (notesField) notesField.style.display = 'none';
    
    // Clear deduction fields
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
    
    // Reset final amount display
    const finalAmountDisplay = document.getElementById('quickFinalAmount');
    if (finalAmountDisplay) {
        finalAmountDisplay.textContent = '€ 0,00';
    }
    
    calculateFinalAmount('quick');
}

export function resetModalForm() {
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
    
    const entryNotesToggle = document.getElementById('entryNotesToggle');
    const entryNotes = document.getElementById('entryNotes');
    
    if (entryNotesToggle) entryNotesToggle.checked = false;
    if (entryNotes) entryNotes.style.display = 'none';
    
    const eopyyDeductions = document.getElementById('modalEopyyDeductions');
    const nonEopyyDeductions = document.getElementById('modalNonEopyyDeductions');
    
    if (eopyyDeductions) eopyyDeductions.style.display = 'none';
    if (nonEopyyDeductions) nonEopyyDeductions.style.display = 'none';
    
    calculateFinalAmount('entry');
}

// ========================================
// Remember Last Selections
// ========================================

export function setupRememberSelections() {
    ['quickSource', 'quickInsurance', 'quickType'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        
        const savedValue = localStorage.getItem(`last_${id}`);
        if (savedValue) el.value = savedValue;
        
        el.addEventListener('change', () => {
            localStorage.setItem(`last_${id}`, el.value);
        });
    });
}

// ========================================
// Exports
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
    setupRememberSelections
};