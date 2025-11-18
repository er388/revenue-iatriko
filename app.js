/**
 * app.js - Main Application Orchestrator (v4 - Refactored)
 * ΕΟΠΥΥ: 5 deductions, Others: 1 deduction
 */

import { STATE, CONFIG } from './state.js';
import storage from './storage.js';
import eopyyDeductionsManager from './eopyyClawback.js';
import { loadData, saveData, addEntry, deleteEntry } from './dataManager.js';
import backupManager, { 
    exportBackup, 
    importBackup, 
    getImportPreview
} from './backup.js';
import pdfExportManager from './pdfExport.js';
import csvValidator from './csvValidator.js';
import { cdnChecker, periodicChecker } from './cdnChecker.js';
import {
    escapeHtml,
    setupDateAutoFormat,
    STRINGS,
    isValidMonthYear
} from './utils.js';
import { 
    showToast,
    renderDashboard, 
    renderEntriesTable,
    renderSourcesAndInsurances 
} from './uiRenderers.js';
import {
    showDeductionFields,
    setupQuickFormPercentages,
    setupModalFormPercentages,
    setupNotesToggle,
    setupFormEventListeners,
    resetQuickForm,
    setupRememberSelections
} from './formHandlers.js';
import { initializeEventHandlers } from './eventHandlers.js';
import { setFilters, clearFilters } from './filters.js';

// ========================================
// Initialization
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing Revenue Management System v4...');

    // Check CDN availability
    const cdnStatus = await cdnChecker.checkAll();
    STATE.cdnAvailable = !cdnStatus.offline;
    
    if (cdnStatus.offline) {
        cdnChecker.showOfflineNotice();
        console.warn('CDN libraries unavailable - some features disabled');
    }

    periodicChecker.start();

    // Initialize storage & load data
    await storage.init();
    await loadData();

    // Render initial UI
    renderSourcesAndInsurances();
    renderDashboard();

    // Setup date auto-format
    setupDateAutoFormat(document.getElementById('quickDate'));
    setupDateAutoFormat(document.getElementById('entryDate'));
    setupDateAutoFormat(document.getElementById('filterDateFrom'));
    setupDateAutoFormat(document.getElementById('filterDateTo'));

    // Setup form handlers
    setupQuickFormPercentages();
    setupModalFormPercentages();
    setupNotesToggle();
    setupFormEventListeners();
    setupRememberSelections();

    // Initialize event handlers
    initializeEventHandlers();

    // ========================================
    // Quick Add Form
    // ========================================
    document.getElementById('quickAddForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const insurance = document.getElementById('quickInsurance').value;
        const isEopyy = insurance.toUpperCase().includes('ΕΟΠΥΥ');
        
        const entry = {
            date: document.getElementById('quickDate').value,
            source: document.getElementById('quickSource').value,
            insurance: insurance,
            type: document.getElementById('quickType').value,
            amount: parseFloat(document.getElementById('quickAmount').value),
            notes: document.getElementById('quickNotes').value
        };

        if (!isValidMonthYear(entry.date)) {
            showToast(STRINGS.errors.invalidDate, 'error');
            return;
        }

        if (isEopyy) {
            entry.deductions = {
                parakratisi: parseFloat(document.getElementById('quickParakratisi').value) || 0,
                mde: parseFloat(document.getElementById('quickMDE').value) || 0,
                rebate: parseFloat(document.getElementById('quickRebate').value) || 0,
                krathseis: parseFloat(document.getElementById('quickKrathseisEopyy').value) || 0,
                clawback: parseFloat(document.getElementById('quickClawback').value) || 0
            };
        } else {
            entry.krathseis = parseFloat(document.getElementById('quickKrathseisOther').value) || 0;
        }

        const success = await addEntry(entry);
        if (success) {
            resetQuickForm();
            showToast(STRINGS.success.entrySaved, 'success');
            renderDashboard();
        }
    });

    // ========================================
    // Filters
    // ========================================
    document.getElementById('applyFiltersBtn')?.addEventListener('click', () => {
        setFilters({
            dateFrom: document.getElementById('filterDateFrom').value,
            dateTo: document.getElementById('filterDateTo').value,
            source: document.getElementById('filterSource').value,
            insurance: document.getElementById('filterInsurance').value,
            type: document.getElementById('filterType').value,
            originalAmountFrom: document.getElementById('filterOriginalAmountFrom').value,
            originalAmountTo: document.getElementById('filterOriginalAmountTo').value,
            finalAmountFrom: document.getElementById('filterFinalAmountFrom').value,
            finalAmountTo: document.getElementById('filterFinalAmountTo').value,
            deductionPercentFrom: document.getElementById('filterDeductionPercentFrom').value,
            deductionPercentTo: document.getElementById('filterDeductionPercentTo').value
        });
        renderEntriesTable();
    });

    document.getElementById('clearFiltersBtn')?.addEventListener('click', () => {
        ['filterDateFrom', 'filterDateTo', 'filterSource', 'filterInsurance', 'filterType',
         'filterOriginalAmountFrom', 'filterOriginalAmountTo', 
         'filterFinalAmountFrom', 'filterFinalAmountTo',
         'filterDeductionPercentFrom', 'filterDeductionPercentTo'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        clearFilters();
        renderEntriesTable();
    });

    // ========================================
    // CSV Export
    // ========================================
    document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
        const { applyFilters } = require('./filters.js');
        const filtered = applyFilters();
        
        const csv = [
            ['Ημερομηνία', 'Διαγνωστικό', 'Ασφάλεια', 'Τύπος', 'Αρχικό Ποσό', 'Παρακράτηση', 'ΜΔΕ', 'Rebate', 'Κρατήσεις', 'Clawback', 'Τελικό Ποσό', 'Σημειώσεις'].join(','),
            ...filtered.map(entry => {
                const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);
                const isEopyy = eopyyDeductionsManager.isEopyyEntry(entry);
                
                return [
                    entry.date,
                    `"${entry.source}"`,
                    `"${entry.insurance}"`,
                    entry.type === 'cash' ? 'Μετρητά' : 'Τιμολόγια',
                    amounts.originalAmount.toFixed(2),
                    isEopyy ? amounts.parakratisi.toFixed(2) : '0',
                    isEopyy ? amounts.mde.toFixed(2) : '0',
                    isEopyy ? amounts.rebate.toFixed(2) : '0',
                    amounts.krathseis.toFixed(2),
                    isEopyy ? amounts.clawback.toFixed(2) : '0',
                    amounts.finalAmount.toFixed(2),
                    `"${(entry.notes || '').replace(/"/g, '""')}"`
                ].join(',');
            })
        ].join('\n');

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `entries_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        
        showToast('CSV εξήχθη επιτυχώς', 'success');
    });

    // ========================================
    // PDF Exports
    // ========================================
    document.getElementById('exportDashboardPdfBtn')?.addEventListener('click', async () => {
        if (!STATE.cdnAvailable) {
            showToast('PDF export δεν είναι διαθέσιμο (CDN offline)', 'error');
            return;
        }

        showToast('Δημιουργία PDF...', 'info');
        
        try {
            await pdfExportManager.exportDashboard({
                kpis: STATE.currentKPIs,
                charts: [
                    { title: 'Έσοδα ανά Τύπο', canvasId: 'typeChart' },
                    { title: 'Μηνιαία Εξέλιξη', canvasId: 'monthlyChart' }
                ]
            });
            
            showToast('PDF δημιουργήθηκε επιτυχώς!', 'success');
        } catch (error) {
            console.error('PDF export error:', error);
            showToast('Σφάλμα δημιουργίας PDF', 'error');
        }
    });

    document.getElementById('exportEntriesPdfBtn')?.addEventListener('click', async () => {
        if (!STATE.cdnAvailable) {
            showToast('PDF export δεν είναι διαθέσιμο (CDN offline)', 'error');
            return;
        }

        showToast('Δημιουργία PDF...', 'info');
        
        try {
            const { applyFilters } = require('./filters.js');
            const filtered = applyFilters();
            await pdfExportManager.exportEntriesList(filtered, STATE.filters);
            showToast('PDF δημιουργήθηκε επιτυχώς!', 'success');
        } catch (error) {
            console.error('PDF export error:', error);
            showToast('Σφάλμα δημιουργίας PDF', 'error');
        }
    });

    // ========================================
    // Backup & Import
    // ========================================
    document.getElementById('importBackupBtn')?.addEventListener('click', () => {
        document.getElementById('backupFileInput').click();
    });

    document.getElementById('backupFileInput')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        document.getElementById('importBackupModal').classList.add('active');

        const mode = document.querySelector('input[name="importMode"]:checked').value;
        const preview = await getImportPreview(file, mode);

        if (preview.valid) {
            const previewEl = document.getElementById('importPreview');
            const backupInfoEl = document.getElementById('backupInfo');
            const impactInfoEl = document.getElementById('impactInfo');

            backupInfoEl.innerHTML = `
                <p><strong>Έκδοση:</strong> ${preview.backupInfo.version}</p>
                <p><strong>Ημερομηνία:</strong> ${new Date(preview.backupInfo.date).toLocaleString('el-GR')}</p>
                <p><strong>Εγγραφές:</strong> ${preview.backupInfo.entriesCount}</p>
            `;

            impactInfoEl.innerHTML = `
                <p><strong>Τρέχουσες εγγραφές:</strong> ${preview.current.entriesCount}</p>
                ${mode === 'overwrite' ? `
                    <p class="report-error"><strong>Θα διαγραφούν:</strong> ${preview.impact.willDelete}</p>
                    <p class="report-success"><strong>Θα προστεθούν:</strong> ${preview.impact.willAdd}</p>
                    <p><strong>Τελικό σύνολο:</strong> ${preview.impact.finalCount}</p>
                ` : `
                    <p class="report-success"><strong>Νέες εγγραφές:</strong> ${preview.impact.willInsert}</p>
                    <p><strong>Ενημερώσεις:</strong> ${preview.impact.willUpdate}</p>
                    <p><strong>Διπλότυπα:</strong> ${preview.impact.duplicates}</p>
                    <p><strong>Τελικό σύνολο:</strong> ${preview.impact.finalCount}</p>
                `}
            `;

            previewEl.style.display = 'block';
            document.getElementById('importReport').style.display = 'none';

            window.pendingImportFile = file;
        } else {
            showToast('Μη έγκυρο αρχείο backup: ' + preview.error, 'error');
            document.getElementById('importBackupModal').classList.remove('active');
        }
    });

    document.getElementById('confirmImportBtn')?.addEventListener('click', async () => {
        if (!window.pendingImportFile) return;

        const mode = document.querySelector('input[name="importMode"]:checked').value;
        
        showToast(STRINGS.info.processing, 'info');

        const report = await importBackup(window.pendingImportFile, mode);

        const reportEl = document.getElementById('importReport');
        const reportContent = reportEl.querySelector('.import-report-content');

        if (report.success) {
            reportContent.innerHTML = `
                <p class="report-success">✅ Import ολοκληρώθηκε επιτυχώς!</p>
                <p><strong>Νέες εγγραφές:</strong> ${report.inserted}</p>
                ${report.updated > 0 ? `<p><strong>Ενημερώσεις:</strong> ${report.updated}</p>` : ''}
                ${report.duplicates > 0 ? `<p><strong>Διπλότυπα (αγνοήθηκαν):</strong> ${report.duplicates}</p>` : ''}
            `;

            await loadData();
            renderSourcesAndInsurances();
            renderDashboard();
            renderEntriesTable();

            showToast(STRINGS.success.importCompleted, 'success');
        } else {
            reportContent.innerHTML = `
                <p class="report-error">❌ Σφάλμα κατά το import</p>
                <p><strong>Σφάλματα:</strong> ${report.errors}</p>
                <ul>
                    ${report.errorMessages.map(msg => `<li>${escapeHtml(msg)}</li>`).join('')}
                </ul>
            `;

            showToast(STRINGS.errors.importFailed, 'error');
        }

        document.getElementById('importPreview').style.display = 'none';
        reportEl.style.display = 'block';
        document.getElementById('confirmImportBtn').disabled = true;

        window.pendingImportFile = null;
    });

    document.getElementById('exportBackupBtn')?.addEventListener('click', async () => {
        try {
            await exportBackup();
            showToast(STRINGS.success.backupCreated, 'success');
        } catch (error) {
            showToast('Σφάλμα κατά τη δημιουργία backup', 'error');
        }
    });

    // ========================================
    // Autosave
    // ========================================
    const autosaveCheckbox = document.getElementById('autosaveEnabled');
    if (autosaveCheckbox) {
        const savedAutosave = localStorage.getItem('autosaveEnabled') === 'true';
        autosaveCheckbox.checked = savedAutosave;

        autosaveCheckbox.addEventListener('change', (e) => {
            localStorage.setItem('autosaveEnabled', e.target.checked ? 'true' : 'false');
            showToast(e.target.checked ? 'Autosave ενεργοποιήθηκε' : 'Autosave απενεργοποιήθηκε', 'info');
        });
    }

    // ========================================
    // Clear Cache
    // ========================================
    document.getElementById('clearCacheBtn')?.addEventListener('click', async () => {
        const confirmed = confirm('⚠️ ΠΡΟΣΟΧΗ: Θα διαγραφούν ΟΛΟΙ οι τομείς αποθήκευσης!\n\n' +
            '- Όλες οι εγγραφές\n' +
            '- Διαγνωστικά και Ασφάλειες\n' +
            '- Ρυθμίσεις\n' +
            '- Cache\n\n' +
            'Η ενέργεια είναι ΜΟΝΙΜΗ και ΔΕΝ μπορεί να ανακληθεί!\n\n' +
            'Θέλετε σίγουρα να συνεχίσετε;');
        
        if (!confirmed) return;

        const doubleConfirm = confirm('ΤΕΛΙΚΗ ΕΠΙΒΕΒΑΙΩΣΗ:\n\nΠατήστε OK για να διαγράψετε ΟΛΑ τα δεδομένα.');
        if (!doubleConfirm) return;
        
        const report = await storage.clearAllStorage();
        
        const reportEl = document.getElementById('clearCacheReport');
        reportEl.innerHTML = `
            <h5>Αποτελέσματα Καθαρισμού:</h5>
            <p>✅ Entries: ${report.entries ? 'Καθαρίστηκαν' : 'Αποτυχία'}</p>
            <p>✅ Settings: ${report.settings ? 'Καθαρίστηκαν' : 'Αποτυχία'}</p>
            <p>✅ Undo: ${report.undo ? 'Καθαρίστηκαν' : 'Αποτυχία'}</p>
            <p>✅ Cache: ${report.cache ? 'Καθαρίστηκαν' : 'Αποτυχία'}</p>
            <p>✅ LocalStorage: ${report.localStorage ? 'Καθαρίστηκε' : 'Αποτυχία'}</p>
            ${report.errors.length > 0 ? `
                <p class="report-error"><strong>Σφάλματα:</strong></p>
                <ul>
                    ${report.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}
                </ul>
            ` : ''}
            <p><em>Ανανεώστε τη σελίδα για να ξεκινήσετε από την αρχή.</em></p>
        `;

        showToast(STRINGS.success.cacheCleared, 'success');
    });

    // ========================================
    // Add New Source
    // ========================================
    document.getElementById('addNewSourceBtn')?.addEventListener('click', async () => {
        const input = document.getElementById('newSourceInput');
        const newSource = input.value.trim();
        
        if (!newSource) {
            showToast('Εισάγετε όνομα διαγνωστικού', 'warning');
            return;
        }

        if (STATE.sources.includes(newSource)) {
            showToast('Το διαγνωστικό υπάρχει ήδη', 'warning');
            return;
        }

        STATE.sources.push(newSource);
        await storage.saveSetting('sources', STATE.sources);
        renderSourcesAndInsurances();
        input.value = '';
        showToast('Το διαγνωστικό προστέθηκε', 'success');
    });

    // ========================================
    // Add New Insurance
    // ========================================
    document.getElementById('addNewInsuranceBtn')?.addEventListener('click', async () => {
        const input = document.getElementById('newInsuranceInput');
        const newInsurance = input.value.trim();
        
        if (!newInsurance) {
            showToast('Εισάγετε όνομα ασφάλειας', 'warning');
            return;
        }

        if (STATE.insurances.includes(newInsurance)) {
            showToast('Η ασφάλεια υπάρχει ήδη', 'warning');
            return;
        }

        STATE.insurances.push(newInsurance);
        await storage.saveSetting('insurances', STATE.insurances);
        renderSourcesAndInsurances();
        input.value = '';
        showToast('Η ασφάλεια προστέθηκε', 'success');
    });

    // ========================================
    // CSV Import
    // ========================================
    document.getElementById('importCsvBtn')?.addEventListener('click', () => {
        document.getElementById('csvFileInput').click();
    });

    document.getElementById('csvFileInput')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showToast('Φόρτωση CSV...', 'info');

        try {
            if (!window.Papa) {
                showToast('PapaParse library δεν είναι διαθέσιμη', 'error');
                return;
            }

            const text = await file.text();
            const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });

            if (parsed.errors.length > 0) {
                console.warn('CSV parsing warnings:', parsed.errors);
            }

            let imported = 0;
            for (const row of parsed.data) {
                const entry = {
                    date: row['Ημερομηνία'] || row.date,
                    source: row['Διαγνωστικό'] || row.source,
                    insurance: row['Ασφάλεια'] || row.insurance,
                    type: (row['Τύπος'] || row.type || '').toLowerCase().includes('μετρητ') ? 'cash' : 'invoice',
                    amount: parseFloat(row['Αρχικό Ποσό'] || row.amount || 0),
                    notes: row['Σημειώσεις'] || row.notes || ''
                };

                if (entry.date && entry.source && entry.insurance && entry.amount > 0) {
                    const success = await addEntry(entry);
                    if (success) imported++;
                }
            }

            showToast(`Εισήχθησαν ${imported} εγγραφές`, 'success');
            renderEntriesTable();
            if (STATE.currentView === 'dashboard') renderDashboard();
        } catch (error) {
            console.error('CSV import error:', error);
            showToast('Σφάλμα εισαγωγής CSV', 'error');
        }

        e.target.value = '';
    });

    // ========================================
    // Backup Button (Header)
    // ========================================
    document.getElementById('backupBtn')?.addEventListener('click', async () => {
        try {
            await exportBackup();
            showToast('Backup δημιουργήθηκε!', 'success');
        } catch (error) {
            showToast('Σφάλμα backup', 'error');
        }
    });

    console.log('Revenue Management System v4 initialized successfully!');
    console.log('CDN Status:', STATE.cdnAvailable ? 'Online' : 'Offline');
    console.log('Modules loaded:', {
        state: '✓',
        dataManager: '✓',
        uiRenderers: '✓',
        formHandlers: '✓',
        eventHandlers: '✓',
        filters: '✓'
    });
});