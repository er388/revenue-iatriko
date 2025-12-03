/**
 * eventHandlers.js - Event Handlers Module
 * All event listeners, callbacks, and modal management
 * Version: 2.0 (Clean Rewrite)
 */

import { STATE } from './state.js';
import { addEntry, deleteEntry } from './dataManager.js';
import { showToast, renderEntriesTable, renderDashboard, renderSourcesAndInsurances } from './uiRenderers.js';
import { resetModalForm, validateFormData } from './formHandlers.js';
import eopyyDeductionsManager from './eopyyClawback.js';
import pdfExportManager from './pdfExport.js';
import storage from './storage.js';
import { STRINGS, isValidMonthYear } from './utils.js';

// ========================================
// Global Window Handlers (onclick events)
// ========================================

/**
 * Edit entry (opens modal with data)
 * @param {string} id - Entry ID
 */
window.editEntry = function(id) {
    console.log('[Edit] Opening entry:', id);
    
    const entry = STATE.entries.find(e => e.id === id);
    if (!entry) {
        showToast('Η εγγραφή δεν βρέθηκε', 'error');
        console.error('[Edit] Entry not found:', id);
        return;
    }

    console.log('[Edit] Found entry:', entry);

    // Set editing state
    STATE.editingEntry = entry;
    
    // Update modal title
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) {
        modalTitle.textContent = 'Επεξεργασία Εγγραφής';
    }
    
    // Fill basic fields
    const fields = {
        'entryId': entry.id,
        'entryDate': entry.date,
        'entrySource': entry.source,
        'entryInsurance': entry.insurance,
        'entryType': entry.type,
        'entryAmount': entry.originalAmount || entry.amount
    };
    
    for (const [fieldId, value] of Object.entries(fields)) {
        const field = document.getElementById(fieldId);
        if (field) {
            field.value = value;
        } else {
            console.warn(`[Edit] Field not found: ${fieldId}`);
        }
    }
    
    // Fill notes
    const notesField = document.getElementById('entryNotes');
    const notesToggle = document.getElementById('entryNotesToggle');
    if (notesField && notesToggle) {
        if (entry.notes) {
            notesField.value = entry.notes;
            notesToggle.checked = true;
            notesField.style.display = 'block';
        } else {
            notesField.value = '';
            notesToggle.checked = false;
            notesField.style.display = 'none';
        }
    }

    // Check insurance type
    const isEopyy = eopyyDeductionsManager.isEopyyEntry(entry);
    console.log('[Edit] Is ΕΟΠΥΥ:', isEopyy);
    
    // Show/hide deduction fields
    const eopyyFields = document.getElementById('modalEopyyDeductions');
    const nonEopyyFields = document.getElementById('modalNonEopyyDeductions');
    
    if (eopyyFields && nonEopyyFields) {
        if (isEopyy) {
            eopyyFields.style.display = 'block';
            nonEopyyFields.style.display = 'none';
            
            // Fill ΕΟΠΥΥ deductions
            const deduction = eopyyDeductionsManager.getDeductions(entry.id);
            console.log('[Edit] ΕΟΠΥΥ deductions:', deduction);
            
            if (deduction) {
                const eopyyFieldIds = {
                    'entryParakratisi': deduction.deductions.parakratisi || '',
                    'entryMDE': deduction.deductions.mde || '',
                    'entryRebate': deduction.deductions.rebate || '',
                    'entryKrathseisEopyy': deduction.deductions.krathseis || '',
                    'entryClawback': deduction.deductions.clawback || ''
                };
                
                for (const [fieldId, value] of Object.entries(eopyyFieldIds)) {
                    const field = document.getElementById(fieldId);
                    if (field) field.value = value;
                }
                
                if (deduction.percentages) {
                    const percentFields = {
                        'entryParakratisiPercent': deduction.percentages.parakratisiPercent || '',
                        'entryMDEPercent': deduction.percentages.mdePercent || '',
                        'entryRebatePercent': deduction.percentages.rebatePercent || '',
                        'entryKrathseisEopyyPercent': deduction.percentages.krathseisPercent || '',
                        'entryClawbackPercent': deduction.percentages.clawbackPercent || ''
                    };
                    
                    for (const [fieldId, value] of Object.entries(percentFields)) {
                        const field = document.getElementById(fieldId);
                        if (field) field.value = value;
                    }
                }
                
                const clawbackPeriodField = document.getElementById('entryClawbackPeriod');
                if (clawbackPeriodField && deduction.clawbackPeriod) {
                    clawbackPeriodField.value = deduction.clawbackPeriod;
                }
            }
        } else {
            // Non-ΕΟΠΥΥ
            eopyyFields.style.display = 'none';
            nonEopyyFields.style.display = 'block';
            
            const krathseisField = document.getElementById('entryKrathseisOther');
            const krathseisPercentField = document.getElementById('entryKrathseisOtherPercent');
            
            if (krathseisField) krathseisField.value = entry.krathseis || '';
            if (krathseisPercentField) krathseisPercentField.value = entry.krathseisPercent || '';
        }
    } else {
        console.error('[Edit] Deduction fields containers not found!');
    }

    // Open modal
    const modal = document.getElementById('entryModal');
    if (modal) {
        modal.classList.add('active');
        console.log('[Edit] ✅ Modal opened successfully');
    } else {
        console.error('[Edit] ❌ Modal element #entryModal not found!');
    }
};

/**
 * Save entry (from modal)
 */
window.saveEntry = async function() {
    const insurance = document.getElementById('entryInsurance').value;
    const isEopyy = insurance.toUpperCase().includes('ΕΟΠΥΥ');
    
    // Build entry object
    const entry = {
        id: document.getElementById('entryId').value || undefined,
        date: document.getElementById('entryDate').value,
        source: document.getElementById('entrySource').value,
        insurance: insurance,
        type: document.getElementById('entryType').value,
        amount: parseFloat(document.getElementById('entryAmount').value),
        notes: document.getElementById('entryNotes').value
    };

    // Validate date format
    if (!isValidMonthYear(entry.date)) {
        showToast(STRINGS.errors.invalidDate, 'error');
        return;
    }

    // Add deductions
    if (isEopyy) {
        entry.deductions = {
            parakratisi: parseFloat(document.getElementById('entryParakratisi').value) || 0,
            mde: parseFloat(document.getElementById('entryMDE').value) || 0,
            rebate: parseFloat(document.getElementById('entryRebate').value) || 0,
            krathseis: parseFloat(document.getElementById('entryKrathseisEopyy').value) || 0,
            clawback: parseFloat(document.getElementById('entryClawback').value) || 0,
            parakratisiPercent: parseFloat(document.getElementById('entryParakratisiPercent').value) || 0,
            mdePercent: parseFloat(document.getElementById('entryMDEPercent').value) || 0,
            rebatePercent: parseFloat(document.getElementById('entryRebatePercent').value) || 0,
            krathseisPercent: parseFloat(document.getElementById('entryKrathseisEopyyPercent').value) || 0,
            clawbackPercent: parseFloat(document.getElementById('entryClawbackPercent').value) || 0,
            clawbackPeriod: document.getElementById('entryClawbackPeriod').value || 'monthly'
        };
    } else {
        entry.krathseis = parseFloat(document.getElementById('entryKrathseisOther').value) || 0;
        entry.krathseisPercent = parseFloat(document.getElementById('entryKrathseisOtherPercent').value) || 0;
    }

    // Validate entry
    const validation = validateFormData(entry);
    if (!validation.valid) {
        showToast(validation.errors[0], 'error');
        return;
    }

    // Save entry
    try {
        const success = await addEntry(entry);
        if (success) {
            document.getElementById('entryModal').classList.remove('active');
            showToast(STRINGS.success.entrySaved, 'success');
            renderEntriesTable();
            if (STATE.currentView === 'dashboard') renderDashboard();
        }
    } catch (error) {
        showToast(error.message || 'Σφάλμα αποθήκευσης', 'error');
    }
};

/**
 * Delete entry with confirmation
 * @param {string} id - Entry ID
 */
window.confirmDelete = async function(id) {
    if (confirm('Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή την εγγραφή;')) {
        try {
            const success = await deleteEntry(id);
            if (success) {
                showToast(STRINGS.success.entryDeleted, 'success');
                renderEntriesTable();
                if (STATE.currentView === 'dashboard') renderDashboard();
            }
        } catch (error) {
            showToast('Σφάλμα διαγραφής', 'error');
        }
    }
};

/**
 * Change page (pagination)
 * @param {number} page - Page number
 */
window.changePage = function(page) {
    STATE.currentPage = page;
    renderEntriesTable();
};

/**
 * Remove source from settings
 * @param {string} source - Source name
 */
window.removeSource = async function(source) {
    if (confirm(`Διαγραφή του διαγνωστικού "${source}";`)) {
        STATE.sources = STATE.sources.filter(s => s !== source);
        await storage.saveSetting('sources', STATE.sources);
        renderSourcesAndInsurances();
        showToast('Το διαγνωστικό διαγράφηκε', 'success');
    }
};

/**
 * Remove insurance from settings
 * @param {string} insurance - Insurance name
 */
window.removeInsurance = async function(insurance) {
    if (confirm(`Διαγραφή της ασφάλειας "${insurance}";`)) {
        STATE.insurances = STATE.insurances.filter(i => i !== insurance);
        await storage.saveSetting('insurances', STATE.insurances);
        renderSourcesAndInsurances();
        showToast('Η ασφάλεια διαγράφηκε', 'success');
    }
};

/**
 * Export chart to PDF
 * @param {string} canvasId - Canvas ID
 */
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

/**
 * Setup modal open/close handlers
 */
export function setupModalHandlers() {
    // Close modal on X button
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) modal.classList.remove('active');
        });
    });
    
    // Close modal on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
    
    // Add Entry Button
    const addEntryBtn = document.getElementById('addEntryBtn');
    if (addEntryBtn) {
        addEntryBtn.addEventListener('click', () => {
            STATE.editingEntry = null;
            document.getElementById('modalTitle').textContent = 'Νέα Εγγραφή';
            
            // Reset form
            resetModalForm();
            
            // Keep last selections
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

/**
 * Setup navigation tab handlers
 */
export function setupNavigationHandlers() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs and views
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            
            // Add active class to clicked tab
            tab.classList.add('active');
            
            // Show corresponding view
            const viewId = tab.getAttribute('data-view') + 'View';
            const view = document.getElementById(viewId);
            if (view) {
                view.classList.add('active');
            }
            
            // Update state
            STATE.currentView = tab.getAttribute('data-view');

            // Re-render if needed
            if (STATE.currentView === 'entries') {
                renderEntriesTable();
            } else if (STATE.currentView === 'dashboard') {
                renderDashboard();
            }
        });
    });
}

// ========================================
// Dashboard Toggle Handlers
// ========================================

/**
 * Setup dashboard filter handlers
 */
export function setupDashboardHandlers() {
    const dashPeriod = document.getElementById('dashPeriod');
    const dashIncludeParakratisi = document.getElementById('dashIncludeParakratisi');
    
    if (dashPeriod) {
        dashPeriod.addEventListener('change', () => {
            renderDashboard();
        });
    }
    
    if (dashIncludeParakratisi) {
        dashIncludeParakratisi.addEventListener('change', (e) => {
            STATE.includeParakratisi = e.target.checked;
            renderDashboard();
        });
    }
}

// ========================================
// Dark Mode Handler
// ========================================

/**
 * Setup dark mode toggle
 */
export function setupDarkModeHandler() {
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (!darkModeToggle) return;
    
    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    darkModeToggle.checked = savedTheme === 'dark';
    
    // Toggle handler
    darkModeToggle.addEventListener('change', (e) => {
        const theme = e.target.checked ? 'dark' : 'light';
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    });
}

// ========================================
// Keyboard Shortcuts
// ========================================

/**
 * Setup global keyboard shortcuts
 */
export function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Escape: Close active modal
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal.active');
            if (activeModal) {
                activeModal.classList.remove('active');
            }
        }
        
        // Ctrl/Cmd + S: Save entry (if modal is open)
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            const activeModal = document.querySelector('.modal.active');
            if (activeModal && activeModal.id === 'entryModal') {
                e.preventDefault();
                window.saveEntry();
            }
        }
    });
}

// ========================================
// Drag & Drop for Modals
// ========================================

/**
 * Make modals draggable
 */
export function setupDraggableModals() {
    document.querySelectorAll('.modal-content').forEach(modalContent => {
        const header = modalContent.querySelector('.modal-header');
        if (!header) return;
        
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        
        header.style.cursor = 'move';
        
        header.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('modal-close')) return;
            
            isDragging = true;
            initialX = e.clientX - modalContent.offsetLeft;
            initialY = e.clientY - modalContent.offsetTop;
            
            modalContent.style.position = 'fixed';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            
            modalContent.style.left = currentX + 'px';
            modalContent.style.top = currentY + 'px';
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    });
}

// ========================================
// Initialize All Event Handlers
// ========================================

/**
 * Initialize all event handlers
 */
export function initializeEventHandlers() {
    setupModalHandlers();
    setupNavigationHandlers();
    setupDashboardHandlers();
    setupDarkModeHandler();
    setupKeyboardShortcuts();
    setupDraggableModals();
    
    console.log('[EventHandlers] All event handlers initialized');
}

// ========================================
// Export All
// ========================================
export default {
    setupModalHandlers,
    setupNavigationHandlers,
    setupDashboardHandlers,
    setupDarkModeHandler,
    setupKeyboardShortcuts,
    setupDraggableModals,
    initializeEventHandlers
};