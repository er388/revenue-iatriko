/**
 * eventHandlers.js - Event Handlers Module (COMPLETE FIXED)
 * All window.* event handlers for onclick events
 */

import { STATE } from './state.js';
import { addEntry, deleteEntry } from './dataManager.js';
import { showToast, renderEntriesTable, renderDashboard, renderSourcesAndInsurances } from './uiRenderers.js';
import { showModalDeductionFields, calculateFinalAmount, resetModalForm } from './formHandlers.js';
import eopyyDeductionsManager from './eopyyClawback.js';
import pdfExportManager from './pdfExport.js';
import storage from './storage.js';
import { STRINGS, isValidMonthYear } from './utils.js';

// ========================================
// Entry Modal Handlers
// ========================================

window.editEntry = function(id) {
    const entry = STATE.entries.find(e => e.id === id);
    if (!entry) return;

    STATE.editingEntry = entry;
    document.getElementById('modalTitle').textContent = 'Επεξεργασία Εγγραφής';
    document.getElementById('entryId').value = entry.id;
    document.getElementById('entryDate').value = entry.date;
    document.getElementById('entrySource').value = entry.source;
    document.getElementById('entryInsurance').value = entry.insurance;
    document.getElementById('entryType').value = entry.type;
    document.getElementById('entryAmount').value = entry.originalAmount || entry.amount;
    
    const notesField = document.getElementById('entryNotes');
    const notesToggle = document.getElementById('entryNotesToggle');
    if (entry.notes) {
        notesField.value = entry.notes;
        notesToggle.checked = true;
        notesField.style.display = 'block';
    } else {
        notesField.value = '';
        notesToggle.checked = false;
        notesField.style.display = 'none';
    }

    const isEopyy = eopyyDeductionsManager.isEopyyEntry(entry);
    const deduction = eopyyDeductionsManager.getDeductions(entry.id);
    
    ['entryParakratisi', 'entryParakratisiPercent', 'entryMDE', 'entryMDEPercent',
     'entryRebate', 'entryRebatePercent', 'entryKrathseisEopyy', 'entryKrathseisEopyyPercent',
     'entryClawback', 'entryClawbackPercent', 'entryKrathseisOther', 'entryKrathseisOtherPercent'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    const originalAmount = entry.originalAmount || entry.amount;
    
    if (isEopyy && deduction) {
        const amounts = deduction.deductions;
        document.getElementById('entryParakratisi').value = amounts.parakratisi || '';
        document.getElementById('entryMDE').value = amounts.mde || '';
        document.getElementById('entryRebate').value = amounts.rebate || '';
        document.getElementById('entryKrathseisEopyy').value = amounts.krathseis || '';
        document.getElementById('entryClawback').value = amounts.clawback || '';
        
        if (originalAmount > 0) {
            if (amounts.parakratisi) {
                document.getElementById('entryParakratisiPercent').value = 
                    ((amounts.parakratisi / originalAmount) * 100).toFixed(2);
            }
            if (amounts.mde) {
                document.getElementById('entryMDEPercent').value = 
                    ((amounts.mde / originalAmount) * 100).toFixed(2);
            }
            if (amounts.rebate) {
                document.getElementById('entryRebatePercent').value = 
                    ((amounts.rebate / originalAmount) * 100).toFixed(2);
            }
            if (amounts.krathseis) {
                document.getElementById('entryKrathseisEopyyPercent').value = 
                    ((amounts.krathseis / originalAmount) * 100).toFixed(2);
            }
            if (amounts.clawback) {
                document.getElementById('entryClawbackPercent').value = 
                    ((amounts.clawback / originalAmount) * 100).toFixed(2);
            }
        }
    } else if (!isEopyy) {
        const krathseis = entry.krathseis || 0;
        document.getElementById('entryKrathseisOther').value = krathseis || '';
        if (originalAmount > 0 && krathseis) {
            document.getElementById('entryKrathseisOtherPercent').value = 
                ((krathseis / originalAmount) * 100).toFixed(2);
        }
    }

    showModalDeductionFields();
    calculateFinalAmount('entry');
    document.getElementById('entryModal').classList.add('active');
};

window.saveEntry = async function() {
    const insurance = document.getElementById('entryInsurance').value;
    const isEopyy = insurance.toUpperCase().includes('ΕΟΠΥΥ');
    
    const entry = {
        id: document.getElementById('entryId').value || undefined,
        date: document.getElementById('entryDate').value,
        source: document.getElementById('entrySource').value,
        insurance: insurance,
        type: document.getElementById('entryType').value,
        amount: parseFloat(document.getElementById('entryAmount').value),
        notes: document.getElementById('entryNotes').value
    };

    if (!isValidMonthYear(entry.date)) {
        showToast(STRINGS.errors.invalidDate, 'error');
        return;
    }

    if (isEopyy) {
        entry.deductions = {
            parakratisi: parseFloat(document.getElementById('entryParakratisi').value) || 0,
            mde: parseFloat(document.getElementById('entryMDE').value) || 0,
            rebate: parseFloat(document.getElementById('entryRebate').value) || 0,
            krathseis: parseFloat(document.getElementById('entryKrathseisEopyy').value) || 0,
            clawback: parseFloat(document.getElementById('entryClawback').value) || 0
        };
    } else {
        entry.krathseis = parseFloat(document.getElementById('entryKrathseisOther').value) || 0;
    }

    const success = await addEntry(entry);
    if (success) {
        document.getElementById('entryModal').classList.remove('active');
        showToast(STRINGS.success.entrySaved, 'success');
        renderEntriesTable();
        if (STATE.currentView === 'dashboard') renderDashboard();
    }
};

window.confirmDelete = async function(id) {
    if (confirm('Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή την εγγραφή;')) {
        const success = await deleteEntry(id);
        if (success) {
            showToast(STRINGS.success.entryDeleted, 'success');
            renderEntriesTable();
            if (STATE.currentView === 'dashboard') renderDashboard();
        }
    }
};

window.changePage = function(page) {
    STATE.currentPage = page;
    renderEntriesTable();
};

window.removeSource = async function(source) {
    if (confirm(`Διαγραφή του διαγνωστικού "${source}";`)) {
        STATE.sources = STATE.sources.filter(s => s !== source);
        await storage.saveSetting('sources', STATE.sources);
        renderSourcesAndInsurances();
        showToast('Το διαγνωστικό διαγράφηκε', 'success');
    }
};

window.removeInsurance = async function(insurance) {
    if (confirm(`Διαγραφή της ασφάλειας "${insurance}";`)) {
        STATE.insurances = STATE.insurances.filter(i => i !== insurance);
        await storage.saveSetting('insurances', STATE.insurances);
        renderSourcesAndInsurances();
        showToast('Η ασφάλεια διαγράφηκε', 'success');
    }
};

window.exportChartPDF = async function(canvasId) {
    if (!STATE.cdnAvailable) {
        showToast('PDF export δεν είναι διαθέσιμο', 'error');
        return;
    }
    try {
        await pdfExportManager.exportHeatmap(canvasId, `Chart_${canvasId}`);
        showToast('PDF εξήχθη επιτυχώς', 'success');
    } catch (error) {
        showToast('Σφάλμα export PDF', 'error');
    }
};

// ========================================
// Modal Handlers
// ========================================

export function setupModalHandlers() {
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.classList.remove('active');
        });
    });
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
    
    const addEntryBtn = document.getElementById('addEntryBtn');
    if (addEntryBtn) {
        addEntryBtn.addEventListener('click', () => {
            STATE.editingEntry = null;
            document.getElementById('modalTitle').textContent = 'Νέα Εγγραφή';
            resetModalForm();
            
            const lastSource = localStorage.getItem('last_quickSource');
            const lastInsurance = localStorage.getItem('last_quickInsurance');
            const lastType = localStorage.getItem('last_quickType') || 'cash';
            
            if (lastSource) document.getElementById('entrySource').value = lastSource;
            if (lastInsurance) document.getElementById('entryInsurance').value = lastInsurance;
            document.getElementById('entryType').value = lastType;
            
            document.getElementById('entryModal').classList.add('active');
        });
    }
}

// ========================================
// Navigation Handlers
// ========================================

export function setupNavigationHandlers() {
    console.log('Setting up navigation handlers...');
    
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const viewName = tab.getAttribute('data-view');
            console.log('🔷 Tab clicked:', viewName);
            
            // Remove active from all tabs
            document.querySelectorAll('.nav-tab').forEach(t => {
                t.classList.remove('active');
                console.log('  Removed active from tab:', t.getAttribute('data-view'));
            });
            
            // Remove active from all views
            document.querySelectorAll('.view').forEach(v => {
                v.classList.remove('active');
                console.log('  Removed active from view:', v.id);
            });
            
            // Add active to clicked tab
            tab.classList.add('active');
            console.log('✅ Added active to tab:', viewName);
            
            // Find and show corresponding view
            const viewId = viewName + 'View';
            const view = document.getElementById(viewId);
            
            console.log('🔍 Looking for view:', viewId);
            
            if (view) {
                view.classList.add('active');
                console.log('✅ Added active class to view:', viewId);
                console.log('View classes:', view.className);
                console.log('View display style:', window.getComputedStyle(view).display);
                
                STATE.currentView = viewName;
                
                if (viewName === 'entries') {
                    console.log('📋 Calling renderEntriesTable...');
                    renderEntriesTable();
                } else if (viewName === 'dashboard') {
                    console.log('📊 Calling renderDashboard...');
                    renderDashboard();
                }
            } else {
                console.error('❌ View not found:', viewId);
            }
        });
    });
    
    console.log('Navigation handlers initialized for', document.querySelectorAll('.nav-tab').length, 'tabs');
}

// ========================================
// Dashboard Handlers
// ========================================

export function setupDashboardHandlers() {
    const dashPeriod = document.getElementById('dashPeriod');
    const dashIncludeParakratisi = document.getElementById('dashIncludeParakratisi');
    
    if (dashPeriod) {
        dashPeriod.addEventListener('change', () => renderDashboard());
    }
    
    if (dashIncludeParakratisi) {
        dashIncludeParakratisi.addEventListener('change', () => renderDashboard());
    }
}

// ========================================
// Dark Mode Handler
// ========================================

export function setupDarkModeHandler() {
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (!darkModeToggle) return;
    
    darkModeToggle.addEventListener('change', (e) => {
        document.body.setAttribute('data-theme', e.target.checked ? 'dark' : 'light');
        localStorage.setItem('theme', e.target.checked ? 'dark' : 'light');
    });
    
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    darkModeToggle.checked = savedTheme === 'dark';
}

// ========================================
// Initialize All Event Handlers
// ========================================

export function initializeEventHandlers() {
    setupModalHandlers();
    setupNavigationHandlers();
    setupDashboardHandlers();
    setupDarkModeHandler();
    console.log('✅ All event handlers initialized');
}

export default {
    setupModalHandlers,
    setupNavigationHandlers,
    setupDashboardHandlers,
    setupDarkModeHandler,
    initializeEventHandlers
};