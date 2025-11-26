/**
 * app.js - Main Application Orchestrator
 * Bootstrap the entire application
 * Version: 2.0 (Clean Rewrite)
 */

import { STATE, CONFIG, getStateSnapshot } from './state.js';
import storage from './storage.js';
import eopyyDeductionsManager from './eopyyClawback.js';
import { loadData, saveData, addEntry, deleteEntry } from './dataManager.js';
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
import { setFilters, clearFilters, applyFilters } from './filters.js';
import backupManager, { exportBackup, importBackup, getImportPreview } from './backup.js';
import pdfExportManager from './pdfExport.js';
import csvValidator from './csvValidator.js';
import { cdnChecker, periodicChecker } from './cdnChecker.js';
import {
    escapeHtml,
    setupDateAutoFormat,
    STRINGS,
    isValidMonthYear,
    formatMonthYear
} from './utils.js';
import reportsManager from './reports.js';

// ========================================
// Initialization
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Revenue Management System v2.0...');

    // Check CDN availability
    console.log('📡 Checking CDN libraries...');
    const cdnStatus = await cdnChecker.checkAll();

    STATE.cdnAvailable = cdnStatus.allAvailable;

    if (!cdnStatus.allAvailable) {
        console.warn('⚠️ Some CDN libraries unavailable:', cdnChecker.getMissingFeatures());
        
        if (cdnStatus.offline) {
            console.error('❌ Critical libraries missing');
        }
    } else {
        console.log('✅ All CDN libraries available');
    }

    // Start periodic monitoring
    periodicChecker.start(); // Check every 60s

    // Add listener για state updates
    cdnChecker.addListener((status) => {
        STATE.cdnAvailable = Object.values(status).every(s => s.available);
        
        // Re-render if needed
        if (STATE.currentView === 'dashboard' && cdnChecker.isAvailable('chartjs')) {
            renderDashboard();
        }
    });

    // Initialize storage & load data
    console.log('💾 Initializing storage...');
    await storage.init();
    
    console.log('📂 Loading data...');
    await loadData();

    // ✅ CRITICAL: Render UI AFTER data is loaded
    console.log('🎨 Rendering UI...');
    renderSourcesAndInsurances();
    
    // Wait a tick to ensure everything is rendered
    setTimeout(() => {
        renderDashboard();
    }, 0);

    // Render initial UI
    console.log('🎨 Rendering UI...');
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

    // Initialize event handlers (modals, navigation, keyboard shortcuts)
    initializeEventHandlers();

    // ========================================
    // Quick Add Form Submit Handler
    // ========================================
    const quickAddForm = document.getElementById('quickAddForm');
    if (quickAddForm) {
        quickAddForm.addEventListener('submit', async (e) => {
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

            // Validate date
            if (!isValidMonthYear(entry.date)) {
                showToast(STRINGS.errors.invalidDate, 'error');
                return;
            }

            // Add ΕΟΠΥΥ deductions
            if (isEopyy) {
                entry.deductions = {
                    parakratisi: parseFloat(document.getElementById('quickParakratisi').value) || 0,
                    mde: parseFloat(document.getElementById('quickMDE').value) || 0,
                    rebate: parseFloat(document.getElementById('quickRebate').value) || 0,
                    krathseis: parseFloat(document.getElementById('quickKrathseisEopyy').value) || 0,
                    clawback: parseFloat(document.getElementById('quickClawback').value) || 0,
                    parakratisiPercent: parseFloat(document.getElementById('quickParakratisiPercent').value) || 0,
                    mdePercent: parseFloat(document.getElementById('quickMDEPercent').value) || 0,
                    rebatePercent: parseFloat(document.getElementById('quickRebatePercent').value) || 0,
                    krathseisPercent: parseFloat(document.getElementById('quickKrathseisEopyyPercent').value) || 0,
                    clawbackPercent: parseFloat(document.getElementById('quickClawbackPercent').value) || 0,
                    clawbackPeriod: document.getElementById('quickClawbackPeriod')?.value || 'monthly'
                };
            } else {
                // Non-ΕΟΠΥΥ: single deduction
                entry.krathseis = parseFloat(document.getElementById('quickKrathseisOther').value) || 0;
                entry.krathseisPercent = parseFloat(document.getElementById('quickKrathseisOtherPercent').value) || 0;
            }

            try {
                const success = await addEntry(entry);
                if (success) {
                    resetQuickForm();
                    showToast(STRINGS.success.entrySaved, 'success');
                    renderDashboard();
                }
            } catch (error) {
                showToast(error.message || 'Σφάλμα αποθήκευσης', 'error');
            }
        });
    }

    // ========================================
    // Filters: Apply & Clear
    // ========================================
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', () => {
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
    }

const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            // Clear all filter inputs
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
    }

    // ========================================
    // ✅ ΝΕΟ: Page Size Selector Handler
    // ========================================
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    if (pageSizeSelect) {
        // Load saved page size preference
        const savedPageSize = localStorage.getItem('pageSize');
        if (savedPageSize && CONFIG.pageSizeOptions.includes(parseInt(savedPageSize))) {
            STATE.pageSize = parseInt(savedPageSize);
            pageSizeSelect.value = savedPageSize;
        } else {
            STATE.pageSize = CONFIG.pageSize; // Default: 25
            pageSizeSelect.value = CONFIG.pageSize.toString();
        }
        
        pageSizeSelect.addEventListener('change', (e) => {
            const newSize = parseInt(e.target.value);
            
            if (CONFIG.pageSizeOptions.includes(newSize)) {
                STATE.pageSize = newSize;
                STATE.currentPage = 1; // Reset to first page
                
                // Save preference
                localStorage.setItem('pageSize', newSize.toString());
                
                // Re-render table
                renderEntriesTable();
                
                showToast(`Εμφάνιση ${newSize} εγγραφών ανά σελίδα`, 'info');
            }
        });
    }

    // ========================================
    // CSV Export
    // ========================================
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => {
            const filtered = applyFilters();
            
            // Build CSV
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

            // Download
            const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `entries_${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
            
            showToast('CSV εξήχθη επιτυχώς', 'success');
        });
    }

    // ========================================
    // PDF Exports
    // ========================================
    const exportDashboardPdfBtn = document.getElementById('exportDashboardPdfBtn');
    if (exportDashboardPdfBtn) {
        exportDashboardPdfBtn.addEventListener('click', async () => {
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
    }

    const exportEntriesPdfBtn = document.getElementById('exportEntriesPdfBtn');
    if (exportEntriesPdfBtn) {
        exportEntriesPdfBtn.addEventListener('click', async () => {
            if (!STATE.cdnAvailable) {
                showToast('PDF export δεν είναι διαθέσιμο (CDN offline)', 'error');
                return;
            }

            showToast('Δημιουργία PDF...', 'info');
            
            try {
                const filtered = applyFilters();
                await pdfExportManager.exportEntriesList(filtered, STATE.filters);
                showToast('PDF δημιουργήθηκε επιτυχώς!', 'success');
            } catch (error) {
                console.error('PDF export error:', error);
                showToast('Σφάλμα δημιουργίας PDF', 'error');
            }
        });
    }

    // ========================================
    // Reports View Setup
    // ========================================
    setupReportsView();

    function setupReportsView() {
        const reportPeriodType = document.getElementById('reportPeriodType');
        const generateReportBtn = document.getElementById('generateReportBtn');
        const exportReportCsvBtn = document.getElementById('exportReportCsvBtn');
        
        // Populate years
        const years = reportsManager.getAvailableYears();
        const reportYearSelect = document.getElementById('reportYear');
        if (reportYearSelect && years.length > 0) {
            reportYearSelect.innerHTML = years.map(y => 
                `<option value="${y}">${y}</option>`
            ).join('');
        }
        
        // Period type change handler
        if (reportPeriodType) {
            reportPeriodType.addEventListener('change', (e) => {
                const type = e.target.value;
                
                // Hide all option groups
                document.getElementById('reportAnnualOptions').style.display = 'none';
                document.getElementById('reportQuarterlyOptions').style.display = 'none';
                document.getElementById('reportSemiannualOptions').style.display = 'none';
                document.getElementById('reportCustomOptions').style.display = 'none';
                
                // Show relevant options
                if (type === 'annual') {
                    document.getElementById('reportAnnualOptions').style.display = 'block';
                } else if (type === 'quarterly') {
                    document.getElementById('reportAnnualOptions').style.display = 'block';
                    document.getElementById('reportQuarterlyOptions').style.display = 'block';
                } else if (type === 'semiannual') {
                    document.getElementById('reportAnnualOptions').style.display = 'block';
                    document.getElementById('reportSemiannualOptions').style.display = 'block';
                } else if (type === 'custom') {
                    document.getElementById('reportCustomOptions').style.display = 'flex';
                    document.getElementById('reportCustomOptions').style.gap = 'var(--spacing-md)';
                }
            });
        }
        
        // Generate report
        if (generateReportBtn) {
            generateReportBtn.addEventListener('click', () => {
                generateAndDisplayReport();
            });
        }
        
        // Export CSV
        if (exportReportCsvBtn) {
            exportReportCsvBtn.addEventListener('click', () => {
                if (window.currentReport) {
                    const csv = reportsManager.exportToCSV(window.currentReport);
                    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `report_${new Date().toISOString().slice(0, 10)}.csv`;
                    link.click();
                    showToast('CSV εξήχθη επιτυχώς', 'success');
                }
            });
        }
    }

    function generateAndDisplayReport() {
        const type = document.getElementById('reportPeriodType').value;
        const includeParakratisi = document.getElementById('reportIncludeParakratisi').checked;
        
        let report;
        
        try {
            if (type === 'annual') {
                const year = parseInt(document.getElementById('reportYear').value);
                report = reportsManager.generateAnnualReport(year, { includeParakratisi });
            } else if (type === 'quarterly') {
                const year = parseInt(document.getElementById('reportYear').value);
                const quarter = document.getElementById('reportQuarter').value;
                report = reportsManager.generateQuarterlyReport(year, quarter, { includeParakratisi });
            } else if (type === 'semiannual') {
                const year = parseInt(document.getElementById('reportYear').value);
                const semester = document.getElementById('reportSemester').value;
                report = reportsManager.generateSemiannualReport(year, semester, { includeParakratisi });
            } else if (type === 'custom') {
                const startDate = document.getElementById('reportDateFrom').value;
                const endDate = document.getElementById('reportDateTo').value;
                
                if (!startDate || !endDate) {
                    showToast('Επιλέξτε ημερομηνίες', 'warning');
                    return;
                }
                
                report = reportsManager.generatePeriodReport(startDate, endDate, { includeParakratisi });
            }
            
            if (report.isEmpty) {
                showToast(report.message, 'warning');
                return;
            }
            
            // Store report globally for export
            window.currentReport = report;
            
            // Display report
            displayReport(report);
            
            showToast('Αναφορά δημιουργήθηκε επιτυχώς', 'success');
        } catch (error) {
            console.error('Report generation error:', error);
            showToast('Σφάλμα δημιουργίας αναφοράς', 'error');
        }
    }

    function displayReport(report) {
        // Show results, hide empty state
        document.getElementById('reportResults').style.display = 'block';
        document.getElementById('reportEmptyState').style.display = 'none';
        
        // Summary
        const summaryEl = document.getElementById('reportSummary');
        summaryEl.innerHTML = `
            <div class="kpi-grid kpi-grid-compact">
                <div class="kpi-card kpi-card-compact">
                    <div class="kpi-label">Συνολικά</div>
                    <div class="kpi-value kpi-value-compact">${formatCurrency(report.summary.kpis.total)}</div>
                </div>
                <div class="kpi-card kpi-card-compact" style="background: linear-gradient(135deg, #3b82f6, #2563eb);">
                    <div class="kpi-label">ΕΟΠΥΥ</div>
                    <div class="kpi-value kpi-value-compact">${formatCurrency(report.summary.kpis.eopyyTotal)}</div>
                </div>
                <div class="kpi-card kpi-card-compact" style="background: linear-gradient(135deg, #10b981, #059669);">
                    <div class="kpi-label">Άλλα</div>
                    <div class="kpi-value kpi-value-compact">${formatCurrency(report.summary.kpis.nonEopyyTotal)}</div>
                </div>
                <div class="kpi-card kpi-card-compact" style="background: linear-gradient(135deg, #ef4444, #dc2626);">
                    <div class="kpi-label">Κρατήσεις</div>
                    <div class="kpi-value kpi-value-compact">${formatCurrency(report.summary.kpis.eopyyTotalDeductions + report.summary.kpis.nonEopyyKrathseis)}</div>
                </div>
            </div>
        `;
        
        // Monthly
        const monthlyBody = document.getElementById('reportMonthlyBody');
        monthlyBody.innerHTML = report.monthly.map(m => `
            <tr>
                <td>${m.date}</td>
                <td class="text-right">${m.count}</td>
                <td class="text-right"><strong>${formatCurrency(m.total)}</strong></td>
                <td class="text-right">${formatCurrency(m.eopyyTotal)}</td>
                <td class="text-right">${formatCurrency(m.nonEopyyTotal)}</td>
                <td class="text-right">${formatCurrency(m.deductions)}</td>
            </tr>
        `).join('');
        
        // Source
        const sourceBody = document.getElementById('reportSourceBody');
        sourceBody.innerHTML = report.bySource.map(s => `
            <tr>
                <td>${escapeHtml(s.source)}</td>
                <td class="text-right">${s.count}</td>
                <td class="text-right"><strong>${formatCurrency(s.total)}</strong></td>
                <td class="text-right">${formatCurrency(s.eopyyTotal)}</td>
                <td class="text-right">${formatCurrency(s.nonEopyyTotal)}</td>
                <td class="text-right">${formatCurrency(s.averagePerEntry)}</td>
            </tr>
        `).join('');
        
        // Insurance
        const insuranceBody = document.getElementById('reportInsuranceBody');
        insuranceBody.innerHTML = report.byInsurance.map(i => `
            <tr>
                <td>${escapeHtml(i.insurance)}</td>
                <td class="text-right">${i.count}</td>
                <td class="text-right"><strong>${formatCurrency(i.total)}</strong></td>
                <td class="text-right">${formatCurrency(i.averagePerEntry)}</td>
            </tr>
        `).join('');
        
        // Deductions (if ΕΟΠΥΥ exists)
        if (report.deductions && report.deductions.hasEopyy) {
            document.getElementById('reportDeductionsCard').style.display = 'block';
            const deductionsBody = document.getElementById('reportDeductionsBody');
            deductionsBody.innerHTML = `
                <div class="kpi-grid kpi-grid-compact">
                    <div class="kpi-card kpi-card-compact" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
                        <div class="kpi-label">Παρακράτηση</div>
                        <div class="kpi-value kpi-value-compact">${formatCurrency(report.deductions.breakdown.parakratisi.amount)}</div>
                        <div class="kpi-percent">${formatPercent(report.deductions.breakdown.parakratisi.percent)}</div>
                    </div>
                    <div class="kpi-card kpi-card-compact" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed);">
                        <div class="kpi-label">ΜΔΕ</div>
                        <div class="kpi-value kpi-value-compact">${formatCurrency(report.deductions.breakdown.mde.amount)}</div>
                        <div class="kpi-percent">${formatPercent(report.deductions.breakdown.mde.percent)}</div>
                    </div>
                    <div class="kpi-card kpi-card-compact" style="background: linear-gradient(135deg, #ec4899, #db2777);">
                        <div class="kpi-label">Rebate</div>
                        <div class="kpi-value kpi-value-compact">${formatCurrency(report.deductions.breakdown.rebate.amount)}</div>
                        <div class="kpi-percent">${formatPercent(report.deductions.breakdown.rebate.percent)}</div>
                    </div>
                    <div class="kpi-card kpi-card-compact" style="background: linear-gradient(135deg, #64748b, #475569);">
                        <div class="kpi-label">Κρατήσεις</div>
                        <div class="kpi-value kpi-value-compact">${formatCurrency(report.deductions.breakdown.krathseis.amount)}</div>
                        <div class="kpi-percent">${formatPercent(report.deductions.breakdown.krathseis.percent)}</div>
                    </div>
                    <div class="kpi-card kpi-card-compact" style="background: linear-gradient(135deg, #ef4444, #dc2626);">
                        <div class="kpi-label">Clawback</div>
                        <div class="kpi-value kpi-value-compact">${formatCurrency(report.deductions.breakdown.clawback.amount)}</div>
                        <div class="kpi-percent">${formatPercent(report.deductions.breakdown.clawback.percent)}</div>
                    </div>
                </div>
            `;
        } else {
            document.getElementById('reportDeductionsCard').style.display = 'none';
        }
    }

    // ========================================
    // Backup & Import
    // ========================================
    const importBackupBtn = document.getElementById('importBackupBtn');
    if (importBackupBtn) {
        importBackupBtn.addEventListener('click', () => {
            document.getElementById('backupFileInput').click();
        });
    }

    const backupFileInput = document.getElementById('backupFileInput');
    if (backupFileInput) {
        backupFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Show import modal
            const importModal = document.getElementById('importBackupModal');
            if (importModal) {
                importModal.classList.add('active');
            }

            // Get selected import mode
            const mode = document.querySelector('input[name="importMode"]:checked')?.value || 'overwrite';
            
            // Get preview
            const preview = await getImportPreview(file, mode);

            if (preview.valid) {
                const previewEl = document.getElementById('importPreview');
                const backupInfoEl = document.getElementById('backupInfo');
                const impactInfoEl = document.getElementById('impactInfo');

                if (backupInfoEl) {
                    backupInfoEl.innerHTML = `
                        <p><strong>Έκδοση:</strong> ${preview.backupInfo.version}</p>
                        <p><strong>Ημερομηνία:</strong> ${new Date(preview.backupInfo.date).toLocaleString('el-GR')}</p>
                        <p><strong>Εγγραφές:</strong> ${preview.backupInfo.entriesCount}</p>
                    `;
                }

                if (impactInfoEl) {
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
                }

                if (previewEl) {
                    previewEl.style.display = 'block';
                }

                const importReport = document.getElementById('importReport');
                if (importReport) {
                    importReport.style.display = 'none';
                }

                // Store file for confirmation
                window.pendingImportFile = file;
            } else {
                showToast('Μη έγκυρο αρχείο backup: ' + preview.error, 'error');
                if (importModal) {
                    importModal.classList.remove('active');
                }
            }
        });
    }

    const confirmImportBtn = document.getElementById('confirmImportBtn');
    if (confirmImportBtn) {
        confirmImportBtn.addEventListener('click', async () => {
            if (!window.pendingImportFile) return;

            const mode = document.querySelector('input[name="importMode"]:checked')?.value || 'overwrite';
            
            showToast(STRINGS.info.processing, 'info');

            const report = await importBackup(window.pendingImportFile, mode);

            const reportEl = document.getElementById('importReport');
            const reportContent = reportEl?.querySelector('.import-report-content');

            if (report.success && reportContent) {
                reportContent.innerHTML = `
                    <p class="report-success">✅ Import ολοκληρώθηκε επιτυχώς!</p>
                    <p><strong>Νέες εγγραφές:</strong> ${report.inserted}</p>
                    ${report.updated > 0 ? `<p><strong>Ενημερώσεις:</strong> ${report.updated}</p>` : ''}
                    ${report.duplicates > 0 ? `<p><strong>Διπλότυπα (αγνοήθηκαν):</strong> ${report.duplicates}</p>` : ''}
                `;

                // Reload data and refresh UI
                await loadData();
                renderSourcesAndInsurances();
                renderDashboard();
                renderEntriesTable();

                showToast(STRINGS.success.importCompleted, 'success');
            } else if (reportContent) {
                reportContent.innerHTML = `
                    <p class="report-error">❌ Σφάλμα κατά το import</p>
                    <p><strong>Σφάλματα:</strong> ${report.errors}</p>
                    <ul>
                        ${report.errorMessages.map(msg => `<li>${escapeHtml(msg)}</li>`).join('')}
                    </ul>
                `;

                showToast(STRINGS.errors.importFailed, 'error');
            }

            // Hide preview, show report
            const previewEl = document.getElementById('importPreview');
            if (previewEl) {
                previewEl.style.display = 'none';
            }
            if (reportEl) {
                reportEl.style.display = 'block';
            }

            // Disable confirm button
            confirmImportBtn.disabled = true;

            // Clear pending file
            window.pendingImportFile = null;
        });
    }

    const exportBackupBtn = document.getElementById('exportBackupBtn');
    if (exportBackupBtn) {
        exportBackupBtn.addEventListener('click', async () => {
            try {
                await exportBackup();
                showToast(STRINGS.success.backupCreated, 'success');
            } catch (error) {
                console.error('Backup export error:', error);
                showToast('Σφάλμα κατά τη δημιουργία backup', 'error');
            }
        });
    }

    // Header backup button (duplicate functionality)
    const headerBackupBtn = document.getElementById('backupBtn');
    if (headerBackupBtn) {
        headerBackupBtn.addEventListener('click', async () => {
            try {
                await exportBackup();
                showToast('Backup δημιουργήθηκε!', 'success');
            } catch (error) {
                console.error('Backup error:', error);
                showToast('Σφάλμα backup', 'error');
            }
        });
    }

    // ========================================
    // Autosave Configuration
    // ========================================
    const autosaveCheckbox = document.getElementById('autosaveEnabled');
    if (autosaveCheckbox) {
        // Load saved preference
        const savedAutosave = localStorage.getItem('autosaveEnabled') === 'true';
        autosaveCheckbox.checked = savedAutosave;

        autosaveCheckbox.addEventListener('change', (e) => {
            localStorage.setItem('autosaveEnabled', e.target.checked ? 'true' : 'false');
            
            if (e.target.checked) {
                showToast('Autosave ενεργοποιήθηκε', 'info');
                // TODO: Implement actual autosave logic in backup.js
            } else {
                showToast('Autosave απενεργοποιήθηκε', 'info');
            }
        });
    }

    const autosaveIntervalSelect = document.getElementById('autosaveInterval');
    if (autosaveIntervalSelect) {
        // Load saved interval
        const savedInterval = localStorage.getItem('autosaveInterval') || '5';
        autosaveIntervalSelect.value = savedInterval;
        
        autosaveIntervalSelect.addEventListener('change', (e) => {
            localStorage.setItem('autosaveInterval', e.target.value);
            showToast(`Autosave ορίστηκε κάθε ${e.target.value} αλλαγές`, 'info');
        });
    }

    // ========================================
    // Clear Cache (Danger Zone)
    // ========================================
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', async () => {
            // First confirmation
            const confirmed = confirm(
                '⚠️ ΠΡΟΣΟΧΗ: Θα διαγραφούν ΟΛΟΙ οι τομείς αποθήκευσης!\n\n' +
                '- Όλες οι εγγραφές\n' +
                '- Διαγνωστικά και Ασφάλειες\n' +
                '- Ρυθμίσεις\n' +
                '- Cache\n\n' +
                'Η ενέργεια είναι ΜΟΝΙΜΗ και ΔΕΝ μπορεί να ανακληθεί!\n\n' +
                'Θέλετε σίγουρα να συνεχίσετε;'
            );
            
            if (!confirmed) return;

            // Double confirmation
            const doubleConfirm = confirm(
                'ΤΕΛΙΚΗ ΕΠΙΒΕΒΑΙΩΣΗ:\n\n' +
                'Πατήστε OK για να διαγράψετε ΟΛΑ τα δεδομένα.'
            );
            
            if (!doubleConfirm) return;
            
            // Perform clear
            const report = await storage.clearAllStorage();
            
            // Show report
            const reportEl = document.getElementById('clearCacheReport');
            if (reportEl) {
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
                reportEl.style.display = 'block';
            }

            showToast(STRINGS.success.cacheCleared, 'success');
        });
    }

    // ========================================
    // Add New Source
    // ========================================
    const addNewSourceBtn = document.getElementById('addNewSourceBtn');
    if (addNewSourceBtn) {
        addNewSourceBtn.addEventListener('click', async () => {
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
    }

    // ========================================
    // Add New Insurance
    // ========================================
    const addNewInsuranceBtn = document.getElementById('addNewInsuranceBtn');
    if (addNewInsuranceBtn) {
        addNewInsuranceBtn.addEventListener('click', async () => {
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
    }

    // ========================================
    // CSV Import
    // ========================================
    const importCsvBtn = document.getElementById('importCsvBtn');
    if (importCsvBtn) {
        importCsvBtn.addEventListener('click', () => {
            document.getElementById('csvFileInput').click();
        });
    }

            const csvFileInput = document.getElementById('csvFileInput');
            if (csvFileInput) {
                csvFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            showToast('Φόρτωση CSV...', 'info');

            try {
                // Check if Papa Parse is available
                if (!window.Papa) {
                    showToast('PapaParse library δεν είναι διαθέσιμη', 'error');
                    return;
                }

                const text = await file.text();
                const parsed = Papa.parse(text, { 
                    header: true, 
                    skipEmptyLines: true 
                });

                if (parsed.errors.length > 0) {
                    console.warn('CSV parsing warnings:', parsed.errors);
                }

                // ✅ VALIDATE CSV DATA
                const validation = csvValidator.validate(parsed.data);
                
                // Show validation errors
                if (!validation.valid) {
                    const errorMessages = validation.errors
                        .slice(0, 5) // First 5 errors
                        .map(e => `• ${e.message}`)
                        .join('\n');
                    
                    showToast(
                        `CSV έχει σφάλματα:\n${errorMessages}\n${validation.errors.length > 5 ? `(+${validation.errors.length - 5} ακόμα)` : ''}`,
                        'error'
                    );
                    console.error('CSV Validation Errors:', validation.errors);
                    e.target.value = ''; // Reset input
                    return;
                }
                
                // Show warnings if any
                if (validation.warnings.length > 0) {
                    console.warn('CSV Validation Warnings:', validation.warnings);
                    showToast(`Προειδοποιήσεις: ${validation.warnings.length}`, 'warning');
                }
                
                // Show auto-fixes if any
                if (validation.autoFixes.length > 0) {
                    console.log('CSV Auto-Fixes Applied:', validation.autoFixes);
                }

                // Import validated rows
                let imported = 0;
                for (const row of validation.rows) {
                    // Row is already validated and normalized
                    const entry = {
                        date: row.date,
                        source: row.source,
                        insurance: row.insurance,
                        type: row.type,
                        amount: row.amount,
                        notes: row.notes || '',
                        krathseis: row.krathseis || 0,
                        krathseisPercent: row.krathseisPercent || 0
                    };

                    try {
                        const success = await addEntry(entry);
                        if (success) imported++;
                    } catch (error) {
                        console.error('Entry import error:', error);
                    }
                }

                // Show summary
                showToast(
                    `✅ Εισήχθησαν ${imported}/${validation.rows.length} εγγραφές\n` +
                    `${validation.autoFixes.length > 0 ? `⚡ Auto-fixes: ${validation.autoFixes.length}` : ''}`,
                    'success'
                );
                
                renderEntriesTable();
                if (STATE.currentView === 'dashboard') {
                    renderDashboard();
                }
            } catch (error) {
                console.error('CSV import error:', error);
                showToast('Σφάλμα εισαγωγής CSV', 'error');
            }

            // Reset file input
            e.target.value = '';
        });
    }
    // ========================================
    // User Label Update
    // ========================================
    const saveUserLabelBtn = document.getElementById('saveUserLabelBtn');
    if (saveUserLabelBtn) {
        saveUserLabelBtn.addEventListener('click', async () => {
            const input = document.getElementById('userLabelInput');
            const newLabel = input.value.trim();
            
            if (!newLabel) {
                showToast('Εισάγετε όνομα χρήστη', 'warning');
                return;
            }

            STATE.userLabel = newLabel;
            await storage.saveSetting('userLabel', newLabel);
            
            // Update header display
            const userLabelDisplay = document.getElementById('userLabel');
            if (userLabelDisplay) {
                userLabelDisplay.textContent = `Χρήστης: ${newLabel}`;
            }
            
            showToast('Το όνομα χρήστη ενημερώθηκε', 'success');
        });
    }

    // Load current user label into input
    const userLabelInput = document.getElementById('userLabelInput');
    if (userLabelInput) {
        userLabelInput.value = STATE.userLabel;
    }

    // ========================================
    // Storage Info Display
    // ========================================
    const storageInfo = document.getElementById('storageInfo');
    if (storageInfo) {
        const info = storage.getStorageInfo();
        const estimate = info.estimate || { usage: 0, quota: 0, percent: 0 };
        
        storageInfo.innerHTML = `
            <p><strong>Στρατηγική:</strong> ${info.strategy === 'indexeddb' ? 'IndexedDB' : 'localStorage'}</p>
            <p><strong>Κατάσταση:</strong> ${info.available ? '✅ Διαθέσιμο' : '❌ Μη διαθέσιμο'}</p>
            ${estimate.quota > 0 ? `
                <p><strong>Χρήση:</strong> ${(estimate.usage / 1024 / 1024).toFixed(2)} MB / ${(estimate.quota / 1024 / 1024).toFixed(2)} MB</p>
                <p><strong>Ποσοστό:</strong> ${estimate.percent.toFixed(2)}%</p>
            ` : ''}
            <p><strong>Εγγραφές:</strong> ${STATE.entries.length}</p>
            <p><strong>Διαγνωστικά:</strong> ${STATE.sources.length}</p>
            <p><strong>Ασφάλειες:</strong> ${STATE.insurances.length}</p>
        `;
    }

    // ========================================
    // Initialize Dashboard Period Filter
    // ========================================
    const dashPeriod = document.getElementById('dashPeriod');
    if (dashPeriod) {
        // Set current month as default
        const now = new Date();
        const currentMonth = formatMonthYear(now.getMonth() + 1, now.getFullYear());
        
        // Add current month option if entries exist for it
        const hasCurrentMonthEntries = STATE.entries.some(e => e.date === currentMonth);
        if (hasCurrentMonthEntries && !dashPeriod.querySelector('option[value="current-month"]')) {
            const option = document.createElement('option');
            option.value = 'current-month';
            option.textContent = `Τρέχων Μήνας (${currentMonth})`;
            dashPeriod.insertBefore(option, dashPeriod.children[1]);
        }
    }

    // ========================================
    // Keyboard Shortcuts Info
    // ========================================
    console.log('⌨️  Keyboard Shortcuts:');
    console.log('  Ctrl/Cmd + N  → New Entry');
    console.log('  Ctrl/Cmd + S  → Save Entry (when modal open)');
    console.log('  Escape        → Close Modal');

    // ========================================
    // Service Worker Registration (PWA)
    // ========================================
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('./service-worker.js');
            console.log('✅ Service Worker registered:', registration.scope);
        } catch (error) {
            console.warn('⚠️ Service Worker registration failed:', error);
        }
    }

    // ========================================
    // Update Check (Periodic)
    // ========================================
    setInterval(() => {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'CHECK_UPDATE'
            });
        }
    }, 60 * 60 * 1000); // Check every hour

    // ========================================
    // Online/Offline Detection
    // ========================================
    window.addEventListener('online', () => {
        showToast('✅ Σύνδεση στο διαδίκτυο αποκαταστάθηκε', 'success');
        STATE.cdnAvailable = true;
    });

    window.addEventListener('offline', () => {
        showToast('⚠️ Χωρίς σύνδεση στο διαδίκτυο', 'warning');
        STATE.cdnAvailable = false;
    });

    // ========================================
    // Visibility Change Handler (Save on hide)
    // ========================================
    document.addEventListener('visibilitychange', async () => {
        if (document.hidden && STATE.changeCounter > 0) {
            console.log('[App] Tab hidden, auto-saving...');
            await saveData();
            STATE.changeCounter = 0;
        }
    });

    // ========================================
    // Before Unload Handler (Warn if unsaved changes)
    // ========================================
    window.addEventListener('beforeunload', (e) => {
        if (STATE.changeCounter > 10) {
            e.preventDefault();
            e.returnValue = 'Έχετε μη αποθηκευμένες αλλαγές. Θέλετε να φύγετε;';
            return e.returnValue;
        }
    });

    // ========================================
    // Performance Monitoring
    // ========================================
    if (window.performance && window.performance.timing) {
        window.addEventListener('load', () => {
            setTimeout(() => {
                const timing = window.performance.timing;
                const loadTime = timing.loadEventEnd - timing.navigationStart;
                const domReady = timing.domContentLoadedEventEnd - timing.navigationStart;
                
                console.log('⚡ Performance:');
                console.log(`  DOM Ready: ${domReady}ms`);
                console.log(`  Load Time: ${loadTime}ms`);
            }, 0);
        });
    }

    // ========================================
    // Error Boundary (Global Error Handler)
    // ========================================
    window.addEventListener('error', (e) => {
        console.error('💥 Global Error:', e.error);
        
        // Show user-friendly message
        if (e.error && e.error.message) {
            showToast(`Σφάλμα: ${e.error.message}`, 'error');
        } else {
            showToast('Παρουσιάστηκε ένα σφάλμα', 'error');
        }
        
        // Save error to storage for debugging
        storage.setCache('last_error', {
            message: e.error?.message || 'Unknown error',
            stack: e.error?.stack || '',
            timestamp: Date.now()
        }, 24 * 60 * 60 * 1000); // Keep for 24h
    });

    // ========================================
    // Unhandled Promise Rejection Handler
    // ========================================
    window.addEventListener('unhandledrejection', (e) => {
        console.error('💥 Unhandled Promise Rejection:', e.reason);
        showToast('Σφάλμα: ' + (e.reason?.message || 'Unhandled rejection'), 'error');
    });

    // ========================================
    // Console Welcome Message
    // ========================================
    console.log('%c🎉 Revenue Management System v2.0', 'font-size: 20px; font-weight: bold; color: #2563eb;');
    console.log('%c✅ Application initialized successfully!', 'color: #10b981;');
    console.log('');
    console.log('📊 Current State:', getStateSnapshot());
    console.log('💾 Storage:', storage.getStorageInfo());
    console.log('📦 Entries:', STATE.entries.length);
    console.log('🏥 Sources:', STATE.sources.length);
    console.log('🏢 Insurances:', STATE.insurances.length);
    console.log('');
    console.log('%cFor debugging, use:', 'font-weight: bold;');
    console.log('  STATE        → View current state');
    console.log('  storage      → Access storage manager');
    console.log('  eopyyDeductionsManager → Deductions manager');
    console.log('');

    // ========================================
    // Expose to Window (for debugging)
    // ========================================
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        window.DEBUG = {
            STATE,
            CONFIG,
            storage,
            eopyyDeductionsManager,
            backupManager,
            cdnChecker,
            getStateSnapshot,
            renderDashboard,
            renderEntriesTable,
            renderSourcesAndInsurances,
            loadData,
            saveData,
            addEntry,
            deleteEntry
        };
        console.log('%c🔧 Debug tools available in window.DEBUG', 'color: #f59e0b;');
    }

    window.editEntry = function(id) {
    const entry = STATE.entries.find(e => e.id === id);
    if (!entry) {
        showToast('Η εγγραφή δεν βρέθηκε', 'error');
        return;
    }
    // ... υπόλοιπος κώδικας από eventHandlers.js
    console.log('Edit entry:', id);
};

window.saveEntry = async function() {
    console.log('Save entry called');
    // ... κώδικας από eventHandlers.js
};

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
    // Final Initialization Complete
    // ========================================
    console.log('✅ App initialization complete!');
    showToast('Το σύστημα είναι έτοιμο!', 'success');

    // Hide loading indicator if exists
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }

    // Show main content
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.style.opacity = '0';
        mainContent.style.display = 'block';
        setTimeout(() => {
            mainContent.style.transition = 'opacity 0.3s';
            mainContent.style.opacity = '1';
        }, 100);
    }
});

// ========================================
// Service Worker Registration (PWA)
// ========================================
if ('serviceWorker' in navigator) {
    try {
        const registration = await navigator.serviceWorker.register('./service-worker.js');
        console.log('✅ Service Worker registered:', registration.scope);
        
        // Check for updates periodically
        setInterval(() => {
            registration.update();
        }, 60 * 60 * 1000); // Check every hour
        
        // Listen for updates
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // New version available
                    showUpdateNotification();
                }
            });
        });
        
    } catch (error) {
        console.warn('⚠️ Service Worker registration failed:', error);
    }
}

/**
 * Show update notification
 */
function showUpdateNotification() {
    const notification = document.createElement('div');
    notification.id = 'updateNotification';
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 0.75rem;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 1rem;
        animation: slideDown 0.3s ease-out;
    `;
    
    notification.innerHTML = `
        <span>📦 Νέα έκδοση διαθέσιμη!</span>
        <button onclick="updateServiceWorker()" style="
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            cursor: pointer;
            font-weight: 600;
        ">Ενημέρωση</button>
        <button onclick="this.parentElement.remove()" style="
            background: none;
            border: none;
            color: white;
            padding: 0.5rem;
            cursor: pointer;
            font-size: 1.2rem;
        ">✕</button>
    `;
    
    document.body.appendChild(notification);
}

/**
 * Update service worker
 */
window.updateServiceWorker = async function() {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration && registration.waiting) {
        // Tell waiting service worker to activate
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        
        // Reload page when new service worker activates
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
        });
    }
};

// ========================================
// Export for Debugging
// ========================================
export {
    loadData,
    saveData,
    addEntry,
    deleteEntry
};