/**
 * eventHandlers.js - Event Handlers Module
 * All event listeners, callbacks, and modal management
 * Version: 2.0 (Clean Rewrite)
 */

import { STATE } from './state.js';
import { addEntry, deleteEntry } from './dataManager.js';
import { showToast, renderEntriesTable, renderDashboard, renderSourcesAndInsurances } from './uiRenderers.js';
import { showModalDeductionFields, resetModalForm, validateFormData } from './formHandlers.js';
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
    const entry = STATE.entries.find(e => e.id === id);
    if (!entry) {
        showToast('Η εγγραφή δεν βρέθηκε', 'error');
        return;
    }

    // Set editing state
    STATE.editingEntry = entry;
    
    // Update modal title
    document.getElementById('modalTitle').textContent = 'Επεξεργασία Εγγραφής';
    
    // Fill basic fields
    document.getElementById('entryId').value = entry.id;
    document.getElementById('entryDate').value = entry.date;
    document.getElementById('entrySource').value = entry.source;
    document.getElementById('entryInsurance').value = entry.insurance;
    document.getElementById('entryType').value = entry.type;
    document.getElementById('entryAmount').value = entry.originalAmount || entry.amount;
    
    // Fill notes
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

    // Fill deductions based on insurance type
    const isEopyy = eopyyDeductionsManager.isEopyyEntry(entry);
    
    if (isEopyy) {
        const deduction = eopyyDeductionsManager.getDeductions(entry.id);
        
        if (deduction) {
            // Fill amounts
            document.getElementById('entryParakratisi').value = deduction.deductions.parakratisi || '';
            document.getElementById('entryMDE').value = deduction.deductions.mde || '';
            document.getElementById('entryRebate').value = deduction.deductions.rebate || '';
            document.getElementById('entryKrathseisEopyy').value = deduction.deductions.krathseis || '';
            document.getElementById('entryClawback').value = deduction.deductions.clawback || '';
            
            // Fill percentages
            if (deduction.percentages) {
                document.getElementById('entryParakratisiPercent').value = deduction.percentages.parakratisiPercent || '';
                document.getElementById('entryMDEPercent').value = deduction.percentages.mdePercent || '';
                document.getElementById('entryRebatePercent').value = deduction.percentages.rebatePercent || '';
                document.getElementById('entryKrathseisEopyyPercent').value = deduction.percentages.krathseisPercent || '';
                document.getElementById('entryClawbackPercent').value = deduction.percentages.clawbackPercent || '';
            }
            
            // Fill clawback period
            if (deduction.clawbackPeriod) {
                document.getElementById('entryClawbackPeriod').value = deduction.clawbackPeriod;
            }
        }
    } else {
        // Non-ΕΟΠΥΥ
        document.getElementById('entryKrathseisOther').value = entry.krathseis || '';
        document.getElementById('entryKrathseisOtherPercent').value = entry.krathseisPercent || '';
    }

    // Show modal with correct deduction fields
    showModalDeductionFields();
    document.getElementById('entryModal').classList.add('active');
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
        // Ctrl/Cmd + N: New entry
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            document.getElementById('addEntryBtn')?.click();
        }
        
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
 * ✅ FIXED: Make modals draggable with proper positioning
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
        
        // ✅ Set cursor style
        header.style.cursor = 'move';
        header.style.userSelect = 'none';
        
        header.addEventListener('mousedown', (e) => {
            // Ignore if clicking close button
            if (e.target.classList.contains('modal-close') || e.target.closest('.modal-close')) {
                return;
            }
            
            isDragging = true;
            
            // ✅ CRITICAL: Get current position or use center
            const rect = modalContent.getBoundingClientRect();
            initialX = e.clientX - rect.left;
            initialY = e.clientY - rect.top;
            
            // ✅ Convert to fixed positioning
            modalContent.style.position = 'fixed';
            modalContent.style.margin = '0';
            modalContent.style.left = rect.left + 'px';
            modalContent.style.top = rect.top + 'px';
            
            // ✅ Increase z-index during drag
            modalContent.style.zIndex = '9999';
            
            // ✅ Add dragging class for visual feedback
            modalContent.classList.add('dragging');
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            e.preventDefault();
            
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            
            // ✅ Keep modal within viewport
            const maxX = window.innerWidth - modalContent.offsetWidth;
            const maxY = window.innerHeight - modalContent.offsetHeight;
            
            currentX = Math.max(0, Math.min(currentX, maxX));
            currentY = Math.max(0, Math.min(currentY, maxY));
            
            modalContent.style.left = currentX + 'px';
            modalContent.style.top = currentY + 'px';
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                
                // ✅ Reset z-index
                modalContent.style.zIndex = '';
                
                // ✅ Remove dragging class
                modalContent.classList.remove('dragging');
            }
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
