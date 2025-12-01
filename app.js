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
    formatMonthYear,
    formatCurrency,
    formatPercent
} from './utils.js';
import reportsManager from './reports.js';
import heatmapManager from './heatmaps.js';
import forecastingManager from './forecasting.js';
import comparisonManager from './comparison.js';

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

    // Start periodic monitoring (disabled for now - causes issues)
    // periodicChecker.start(); // Check every 60s

    // Add listener για state updates (simplified)
    // cdnChecker.addListener((status) => {
    //     STATE.cdnAvailable = Object.values(status).every(s => s.available);
    //     
    //     // Re-render if needed
    //     if (STATE.currentView === 'dashboard' && cdnChecker.isAvailable('chartjs')) {
    //         renderDashboard();
    //     }
    // });

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
        const exportReportPdfBtn = document.getElementById('exportReportPdfBtn');
        if (exportReportPdfBtn) {
            exportReportPdfBtn.addEventListener('click', async () => {
                if (!window.currentReport) {
                    showToast('Δημιουργήστε πρώτα μια αναφορά', 'warning');
                    return;
                }
                
                showToast('Δημιουργία PDF...', 'info');
                
                try {
                    await pdfExportManager.exportReport(window.currentReport);
                    showToast('PDF δημιουργήθηκε επιτυχώς!', 'success');
                } catch (error) {
                    console.error('PDF export error:', error);
                    showToast('Σφάλμα δημιουργίας PDF', 'error');
                }
            });
        }

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

        // Render Charts
        renderReportCharts(report);
    }

            /**
         * Render charts for report
         * @param {Object} report - Report data
         */
        function renderReportCharts(report) {
            if (!STATE.cdnAvailable || !window.Chart) {
                console.warn('[Reports] Chart.js not available');
                return;
            }
            
            // Destroy existing charts
            if (STATE.charts.reportMonthlyChart) {
                STATE.charts.reportMonthlyChart.destroy();
            }
            if (STATE.charts.reportSourceChart) {
                STATE.charts.reportSourceChart.destroy();
            }
            
            // 1️⃣ Monthly Trend Line Chart
            const monthlyCtx = document.getElementById('reportMonthlyChart');
            if (monthlyCtx && report.monthly && report.monthly.length > 0) {
                STATE.charts.reportMonthlyChart = new Chart(monthlyCtx, {
                    type: 'line',
                    data: {
                        labels: report.monthly.map(m => m.date),
                        datasets: [
                            {
                                label: 'Σύνολο',
                                data: report.monthly.map(m => m.total),
                                borderColor: CONFIG.chartColors.primary,
                                backgroundColor: CONFIG.chartColors.primary + '20',
                                borderWidth: 2,
                                tension: 0.4,
                                fill: true
                            },
                            {
                                label: 'ΕΟΠΥΥ',
                                data: report.monthly.map(m => m.eopyyTotal),
                                borderColor: CONFIG.chartColors.info,
                                backgroundColor: 'transparent',
                                borderWidth: 2,
                                tension: 0.4
                            },
                            {
                                label: 'Άλλα',
                                data: report.monthly.map(m => m.nonEopyyTotal),
                                borderColor: CONFIG.chartColors.success,
                                backgroundColor: 'transparent',
                                borderWidth: 2,
                                tension: 0.4
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'bottom'
                            },
                            tooltip: {
                                callbacks: {
                                    label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    callback: value => formatCurrency(value)
                                }
                            }
                        }
                    }
                });
            }
            
            // 2️⃣ Source Breakdown Pie Chart
            const sourceCtx = document.getElementById('reportSourceChart');
            if (sourceCtx && report.bySource && report.bySource.length > 0) {
                // Take top 8 sources
                const topSources = report.bySource.slice(0, 8);
                const otherTotal = report.bySource.slice(8).reduce((sum, s) => sum + s.total, 0);
                
                const labels = [...topSources.map(s => s.source)];
                const data = [...topSources.map(s => s.total)];
                
                if (otherTotal > 0) {
                    labels.push('Άλλα');
                    data.push(otherTotal);
                }
                
                STATE.charts.reportSourceChart = new Chart(sourceCtx, {
                    type: 'pie',
                    data: {
                        labels,
                        datasets: [{
                            data,
                            backgroundColor: [
                                CONFIG.chartColors.primary,
                                CONFIG.chartColors.success,
                                CONFIG.chartColors.warning,
                                CONFIG.chartColors.danger,
                                CONFIG.chartColors.info,
                                CONFIG.chartColors.secondary,
                                '#8b5cf6',
                                '#ec4899',
                                '#94a3b8'
                            ]
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'right',
                                labels: {
                                    font: { size: 11 }
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: (context) => {
                                        const label = context.label || '';
                                        const value = formatCurrency(context.parsed);
                                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                        const percent = ((context.parsed / total) * 100).toFixed(1);
                                        return `${label}: ${value} (${percent}%)`;
                                    }
                                }
                            }
                        }
                    }
                });
            }
        }

    // ========================================
    // Heatmaps View Setup (after reports setup)
    // ========================================
    function setupHeatmapsView() {
        const generateMonthYearBtn = document.getElementById('generateMonthYearHeatmap');
        const generateSourceMonthBtn = document.getElementById('generateSourceMonthHeatmap');
        const heatmapYear = document.getElementById('heatmapYear');
        
        // Populate year dropdown
        const years = reportsManager.getAvailableYears();
        if (heatmapYear && years.length > 0) {
            heatmapYear.innerHTML = years.map(y => 
                `<option value="${y}">${y}</option>`
            ).join('');
        }
        
        // Generate Month × Year heatmap
        if (generateMonthYearBtn) {
            generateMonthYearBtn.addEventListener('click', () => {
                const includeParakratisi = document.getElementById('heatmapIncludeParakratisi')?.checked || false;
                
                const success = heatmapManager.generateMonthYearHeatmap('monthYearCanvas', {
                    includeParakratisi
                });
                
                if (success) {
                    showToast('Heatmap δημιουργήθηκε!', 'success');
                    document.getElementById('monthYearHeatmapCard').style.display = 'block';
                } else {
                    showToast('Δεν υπάρχουν δεδομένα', 'warning');
                }
            });
        }
        
        // Generate Source × Month heatmap
        if (generateSourceMonthBtn) {
            generateSourceMonthBtn.addEventListener('click', () => {
                const year = parseInt(heatmapYear.value);
                const includeParakratisi = document.getElementById('heatmapIncludeParakratisi')?.checked || false;
                
                const success = heatmapManager.generateSourceMonthHeatmap('sourceMonthCanvas', year, {
                    includeParakratisi
                });
                
                if (success) {
                    showToast('Heatmap δημιουργήθηκε!', 'success');
                    document.getElementById('sourceMonthHeatmapCard').style.display = 'block';
                } else {
                    showToast(`Δεν υπάρχουν δεδομένα για το ${year}`, 'warning');
                }
            });
        }
        
        // Export heatmap handlers
        const exportMonthYearPdfBtn = document.getElementById('exportMonthYearPdfBtn');
        const exportSourceMonthPdfBtn = document.getElementById('exportSourceMonthPdfBtn');
        
        if (exportMonthYearPdfBtn) {
            exportMonthYearPdfBtn.addEventListener('click', async () => {
                if (!STATE.cdnAvailable) {
                    showToast('PDF export δεν είναι διαθέσιμο', 'error');
                    return;
                }
                
                try {
                    await pdfExportManager.exportHeatmap('monthYearCanvas', 'Heatmap_MonthYear');
                    showToast('PDF εξήχθη επιτυχώς!', 'success');
                } catch (error) {
                    showToast('Σφάλμα export PDF', 'error');
                }
            });
        }
        
        if (exportSourceMonthPdfBtn) {
            exportSourceMonthPdfBtn.addEventListener('click', async () => {
                if (!STATE.cdnAvailable) {
                    showToast('PDF export δεν είναι διαθέσιμο', 'error');
                    return;
                }
                
                try {
                    await pdfExportManager.exportHeatmap('sourceMonthCanvas', 'Heatmap_SourceMonth');
                    showToast('PDF εξήχθη επιτυχώς!', 'success');
                } catch (error) {
                    showToast('Σφάλμα export PDF', 'error');
                }
            });
        }
    }

    // Call in DOMContentLoaded (after setupReportsView)
    setupHeatmapsView();
    setupForecastingView();
    setupComparisonView();

    // ========================================
    // Comparison View Setup
    // ========================================
    function setupComparisonView() {
        const generateComparisonBtn = document.getElementById('generateComparisonBtn');
        const exportComparisonCsvBtn = document.getElementById('exportComparisonCsvBtn');
        const exportComparisonPdfBtn = document.getElementById('exportComparisonPdfBtn');
        
        // Populate year dropdowns
        const years = reportsManager.getAvailableYears();
        ['comparison1Year', 'comparison2Year'].forEach(id => {
            const select = document.getElementById(id);
            if (select && years.length > 0) {
                select.innerHTML = years.map(y => 
                    `<option value="${y}">${y}</option>`
                ).join('');
            }
        });
        
        // Period type change handlers
        ['comparison1Type', 'comparison2Type'].forEach((typeId, index) => {
            const typeSelect = document.getElementById(typeId);
            if (!typeSelect) return;
            
            const prefix = `comparison${index + 1}`;
            
            typeSelect.addEventListener('change', (e) => {
                const type = e.target.value;
                
                // Hide all option groups
                document.getElementById(`${prefix}Annual`).style.display = 'none';
                document.getElementById(`${prefix}Quarterly`).style.display = 'none';
                document.getElementById(`${prefix}Semiannual`).style.display = 'none';
                document.getElementById(`${prefix}Custom`).style.display = 'none';
                
                // Show relevant options
                if (type === 'annual') {
                    document.getElementById(`${prefix}Annual`).style.display = 'block';
                } else if (type === 'quarterly') {
                    document.getElementById(`${prefix}Annual`).style.display = 'block';
                    document.getElementById(`${prefix}Quarterly`).style.display = 'block';
                } else if (type === 'semiannual') {
                    document.getElementById(`${prefix}Annual`).style.display = 'block';
                    document.getElementById(`${prefix}Semiannual`).style.display = 'block';
                } else if (type === 'custom') {
                    document.getElementById(`${prefix}Custom`).style.display = 'flex';
                }
            });
        });
        
        // Generate comparison
        if (generateComparisonBtn) {
            generateComparisonBtn.addEventListener('click', async () => {
                try {
                    const includeParakratisi = document.getElementById('comparisonIncludeParakratisi')?.checked || false;
                    
                    // Get period 1 configuration
                    const period1 = getPeriodConfig('comparison1');
                    const period2 = getPeriodConfig('comparison2');
                    
                    if (!period1 || !period2) {
                        showToast('Επιλέξτε και τις δύο περιόδους', 'warning');
                        return;
                    }
                    
                    showToast('Δημιουργία σύγκρισης...', 'info');
                    
                    // Import comparison manager (will create stub if needed)
                    const { default: comparisonManager } = await import('./comparison.js');
                    
                    const comparison = comparisonManager.comparePeriods(period1, period2, { includeParakratisi });
                    
                    if (comparison.error) {
                        showToast(comparison.message, 'warning');
                        return;
                    }
                    
                    displayComparison(comparison);
                    showToast('Σύγκριση ολοκληρώθηκε!', 'success');
                    
                } catch (error) {
                    console.error('Comparison error:', error);
                    showToast('Σφάλμα δημιουργίας σύγκρισης', 'error');
                }
            });
        }
        
        // Export CSV
        if (exportComparisonCsvBtn) {
            exportComparisonCsvBtn.addEventListener('click', async () => {
                if (!window.currentComparison) {
                    showToast('Δημιουργήστε πρώτα μια σύγκριση', 'warning');
                    return;
                }
                
                try {
                    const { default: comparisonManager } = await import('./comparison.js');
                    const csv = comparisonManager.exportToCSV(window.currentComparison);
                    
                    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `comparison_${new Date().toISOString().slice(0, 10)}.csv`;
                    link.click();
                    
                    showToast('CSV εξήχθη επιτυχώς', 'success');
                } catch (error) {
                    showToast('Σφάλμα export CSV', 'error');
                }
            });
        }
        
        // Export PDF
        if (exportComparisonPdfBtn) {
            exportComparisonPdfBtn.addEventListener('click', async () => {
                if (!window.currentComparison) {
                    showToast('Δημιουργήστε πρώτα μια σύγκριση', 'warning');
                    return;
                }
                
                if (!STATE.cdnAvailable) {
                    showToast('PDF export δεν είναι διαθέσιμο', 'error');
                    return;
                }
                
                showToast('Δημιουργία PDF...', 'info');
                
                try {
                    await pdfExportManager.exportComparison(window.currentComparison);
                    showToast('PDF εξήχθη επιτυχώς!', 'success');
                } catch (error) {
                    showToast('Σφάλμα export PDF', 'error');
                }
            });
        }
    }

    function getPeriodConfig(prefix) {
        const type = document.getElementById(`${prefix}Type`)?.value;
        const year = parseInt(document.getElementById(`${prefix}Year`)?.value);
        
        if (!type || isNaN(year)) return null;
        
        const config = { type, year };
        
        if (type === 'quarterly') {
            config.quarter = document.getElementById(`${prefix}Quarter`)?.value;
        } else if (type === 'semiannual') {
            config.semester = document.getElementById(`${prefix}Semester`)?.value;
        } else if (type === 'custom') {
            config.startDate = document.getElementById(`${prefix}From`)?.value;
            config.endDate = document.getElementById(`${prefix}To`)?.value;
            
            if (!config.startDate || !config.endDate) {
                return null;
            }
        }
        
        return config;
    }

    function displayComparison(comparison) {
        // Store globally for export
        window.currentComparison = comparison;
        
        // Show results, hide empty state
        document.getElementById('comparisonResults').style.display = 'block';
        document.getElementById('comparisonEmptyState').style.display = 'none';
        
        // Update headers
        document.getElementById('comparisonPeriod1Header').textContent = comparison.period1.label;
        document.getElementById('comparisonPeriod2Header').textContent = comparison.period2.label;
        
        // Summary table
        const summaryBody = document.getElementById('comparisonSummaryBody');
        summaryBody.innerHTML = Object.entries(comparison.summary).map(([key, data]) => {
            const changeClass = data.change > 0 ? 'trend-positive' : data.change < 0 ? 'trend-negative' : 'trend-neutral';
            const trendIcon = data.change > 0 ? '▲' : data.change < 0 ? '▼' : '━';
            
            return `
                <tr>
                    <td>${escapeHtml(data.label)}</td>
                    <td class="text-right">${formatCurrency(data.period1)}</td>
                    <td class="text-right">${formatCurrency(data.period2)}</td>
                    <td class="text-right ${changeClass}">${formatCurrency(data.change)}</td>
                    <td class="text-right ${changeClass}">${formatPercent(data.changePercent)}</td>
                    <td class="text-center"><span class="trend-badge ${changeClass.replace('trend-', '')}">${trendIcon}</span></td>
                </tr>
            `;
        }).join('');
        
        // Sources comparison
        const sourcesBody = document.getElementById('comparisonSourcesBody');
        sourcesBody.innerHTML = comparison.bySource.map(s => {
            const changeClass = s.change > 0 ? 'trend-positive' : s.change < 0 ? 'trend-negative' : 'trend-neutral';
            const trendIcon = s.change > 0 ? '▲' : s.change < 0 ? '▼' : '━';
            
            return `
                <tr>
                    <td>${escapeHtml(s.source)}</td>
                    <td class="text-right">${formatCurrency(s.period1)}</td>
                    <td class="text-right">${formatCurrency(s.period2)}</td>
                    <td class="text-right ${changeClass}">${formatCurrency(s.change)}</td>
                    <td class="text-right ${changeClass}">${formatPercent(s.changePercent)}</td>
                    <td class="text-center"><span class="trend-badge ${changeClass.replace('trend-', '')}">${trendIcon}</span></td>
                </tr>
            `;
        }).join('');
        
        // Insurances comparison
        const insurancesBody = document.getElementById('comparisonInsurancesBody');
        insurancesBody.innerHTML = comparison.byInsurance.map(i => {
            const changeClass = i.change > 0 ? 'trend-positive' : i.change < 0 ? 'trend-negative' : 'trend-neutral';
            const trendIcon = i.change > 0 ? '▲' : i.change < 0 ? '▼' : '━';
            
            return `
                <tr>
                    <td>${escapeHtml(i.insurance)}</td>
                    <td class="text-right">${formatCurrency(i.period1)}</td>
                    <td class="text-right">${formatCurrency(i.period2)}</td>
                    <td class="text-right ${changeClass}">${formatCurrency(i.change)}</td>
                    <td class="text-right ${changeClass}">${formatPercent(i.changePercent)}</td>
                    <td class="text-center"><span class="trend-badge ${changeClass.replace('trend-', '')}">${trendIcon}</span></td>
                </tr>
            `;
        }).join('');
        
        // Trends analysis
        const trendsBody = document.getElementById('comparisonTrendsBody');
        if (comparison.trends && comparison.trends.length > 0) {
            trendsBody.innerHTML = `
                <ul style="line-height: 1.8;">
                    ${comparison.trends.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
                </ul>
            `;
        } else {
            trendsBody.innerHTML = '<p style="color: var(--text-secondary);">Δεν υπάρχουν σημαντικές τάσεις</p>';
        }
    }

    // ========================================
    // Forecasting View Setup (after heatmaps setup)
    // ========================================
    function setupForecastingView() {
        const generateForecastBtn = document.getElementById('generateForecastBtn');
        const exportForecastCsvBtn = document.getElementById('exportForecastCsvBtn');
        
        if (generateForecastBtn) {
            generateForecastBtn.addEventListener('click', () => {
                const method = document.getElementById('forecastMethod').value;
                const periods = parseInt(document.getElementById('forecastPeriods').value);
                const includeParakratisi = document.getElementById('forecastIncludeParakratisi').checked;
                
                showToast('Δημιουργία πρόβλεψης...', 'info');
                
                try {
                    const forecast = forecastingManager.generateForecast({
                        method,
                        periods,
                        includeParakratisi
                    });
                    
                    if (forecast.error) {
                        showToast(forecast.message, 'warning');
                        return;
                    }
                    
                    displayForecast(forecast);
                    showToast('Πρόβλεψη ολοκληρώθηκε!', 'success');
                    
                } catch (error) {
                    console.error('Forecast error:', error);
                    showToast('Σφάλμα δημιουργίας πρόβλεψης', 'error');
                }
            });
        }
        
        if (exportForecastCsvBtn) {
            exportForecastCsvBtn.addEventListener('click', () => {
                const forecast = forecastingManager.getLastForecast();
                if (!forecast) {
                    showToast('Δημιουργήστε πρώτα μια πρόβλεψη', 'warning');
                    return;
                }
                
                const csv = forecastingManager.exportToCSV(forecast);
                const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `forecast_${new Date().toISOString().slice(0, 10)}.csv`;
                link.click();
                
                showToast('CSV εξήχθη επιτυχώς', 'success');
            });
        }
    }

    function displayForecast(forecast) {
        // Show results, hide empty state
        document.getElementById('forecastResults').style.display = 'block';
        document.getElementById('forecastEmptyState').style.display = 'none';
        
        // Summary
        const summaryEl = document.getElementById('forecastSummary');
        const avgHistorical = forecast.historical.reduce((sum, h) => sum + h.value, 0) / forecast.historical.length;
        const avgForecast = forecast.predictions.reduce((sum, p) => sum + p.value, 0) / forecast.predictions.length;
        const change = ((avgForecast - avgHistorical) / avgHistorical) * 100;
        
        summaryEl.innerHTML = `
            <div class="kpi-grid kpi-grid-compact">
                <div class="kpi-card kpi-card-compact">
                    <div class="kpi-label">Μέθοδος</div>
                    <div class="kpi-value kpi-value-compact" style="font-size: 1rem;">${escapeHtml(forecast.methodName)}</div>
                </div>
                <div class="kpi-card kpi-card-compact">
                    <div class="kpi-label">Ιστορικά Δεδομένα</div>
                    <div class="kpi-value kpi-value-compact">${forecast.metadata.dataPoints} μήνες</div>
                </div>
                <div class="kpi-card kpi-card-compact">
                    <div class="kpi-label">Μέσος Όρος (Ιστορικό)</div>
                    <div class="kpi-value kpi-value-compact">${formatCurrency(avgHistorical)}</div>
                </div>
                <div class="kpi-card kpi-card-compact">
                    <div class="kpi-label">Μέσος Όρος (Πρόβλεψη)</div>
                    <div class="kpi-value kpi-value-compact">${formatCurrency(avgForecast)}</div>
                </div>
                <div class="kpi-card kpi-card-compact" style="background: ${change >= 0 ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #ef4444, #dc2626)'};">
                    <div class="kpi-label">Αναμενόμενη Μεταβολή</div>
                    <div class="kpi-value kpi-value-compact">${change >= 0 ? '+' : ''}${formatPercent(change)}</div>
                </div>
            </div>
        `;
        
        // Chart
        renderForecastChart(forecast);
        
        // Table
        const tableBody = document.getElementById('forecastTableBody');
        tableBody.innerHTML = forecast.predictions.map(p => `
            <tr>
                <td>${escapeHtml(p.date)}</td>
                <td class="text-right"><strong>${formatCurrency(p.value)}</strong></td>
                <td class="text-right">${formatCurrency(p.lower)}</td>
                <td class="text-right">${formatCurrency(p.upper)}</td>
            </tr>
        `).join('');
        
        // Accuracy
        if (forecast.accuracy) {
            const accuracyEl = document.getElementById('forecastAccuracy');
            accuracyEl.innerHTML = `
                <div class="kpi-grid kpi-grid-compact">
                    <div class="kpi-card kpi-card-compact">
                        <div class="kpi-label">MAE</div>
                        <div class="kpi-value kpi-value-compact">${formatCurrency(forecast.accuracy.mae)}</div>
                        <small style="display: block; margin-top: 0.5rem; opacity: 0.8;">Mean Absolute Error</small>
                    </div>
                    <div class="kpi-card kpi-card-compact">
                        <div class="kpi-label">RMSE</div>
                        <div class="kpi-value kpi-value-compact">${formatCurrency(forecast.accuracy.rmse)}</div>
                        <small style="display: block; margin-top: 0.5rem; opacity: 0.8;">Root Mean Squared Error</small>
                    </div>
                    <div class="kpi-card kpi-card-compact">
                        <div class="kpi-label">MAPE</div>
                        <div class="kpi-value kpi-value-compact">${formatPercent(forecast.accuracy.mape)}</div>
                        <small style="display: block; margin-top: 0.5rem; opacity: 0.8;">Mean Absolute % Error</small>
                    </div>
                </div>
                <p style="margin-top: var(--spacing-md); color: var(--text-secondary); font-size: 0.875rem;">
                    <strong>Σημείωση:</strong> Τα μετρικά ακρίβειας υπολογίζονται με βάση το 20% των πιο πρόσφατων ιστορικών δεδομένων.
                </p>
            `;
        }
    }

    function renderForecastChart(forecast) {
        if (!STATE.cdnAvailable || !window.Chart) {
            console.warn('[Forecast] Chart.js not available');
            document.getElementById('forecastChart').parentElement.innerHTML = 
                '<p style="text-align: center; color: var(--text-secondary);">Τα γραφήματα δεν είναι διαθέσιμα (CDN offline)</p>';
            return;
        }
        
        const ctx = document.getElementById('forecastChart');
        
        // Destroy existing chart
        if (STATE.charts.forecastChart) {
            STATE.charts.forecastChart.destroy();
        }
        
        const labels = [
            ...forecast.historical.map(h => h.date),
            ...forecast.predictions.map(p => p.date)
        ];
        
        const historicalData = [
            ...forecast.historical.map(h => h.value),
            ...Array(forecast.predictions.length).fill(null)
        ];
        
        const forecastData = [
            ...Array(forecast.historical.length).fill(null),
            ...forecast.predictions.map(p => p.value)
        ];
        
        const lowerBound = [
            ...Array(forecast.historical.length).fill(null),
            ...forecast.predictions.map(p => p.lower)
        ];
        
        const upperBound = [
            ...Array(forecast.historical.length).fill(null),
            ...forecast.predictions.map(p => p.upper)
        ];
        
        STATE.charts.forecastChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Ιστορικά',
                        data: historicalData,
                        borderColor: CONFIG.chartColors.primary,
                        backgroundColor: CONFIG.chartColors.primary + '20',
                        borderWidth: 2,
                        pointRadius: 3,
                        tension: 0.4
                    },
                    {
                        label: 'Πρόβλεψη',
                        data: forecastData,
                        borderColor: CONFIG.chartColors.success,
                        backgroundColor: CONFIG.chartColors.success + '20',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 3,
                        tension: 0.4
                    },
                    {
                        label: 'Κάτω Όριο (95%)',
                        data: lowerBound,
                        borderColor: CONFIG.chartColors.secondary,
                        backgroundColor: 'transparent',
                        borderWidth: 1,
                        borderDash: [2, 2],
                        pointRadius: 0,
                        fill: false
                    },
                    {
                        label: 'Άνω Όριο (95%)',
                        data: upperBound,
                        borderColor: CONFIG.chartColors.secondary,
                        backgroundColor: CONFIG.chartColors.secondary + '10',
                        borderWidth: 1,
                        borderDash: [2, 2],
                        pointRadius: 0,
                        fill: '-1' // Fill to previous dataset (lowerBound)
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: value => formatCurrency(value)
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 10,
                            font: { size: 11 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.dataset.label || '';
                                const value = formatCurrency(context.parsed.y);
                                return `${label}: ${value}`;
                            }
                        }
                    }
                }
            }
        });
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

        // Store current entry ID
        STATE.editingEntryId = id;

        // Populate modal form
        document.getElementById('entryDate').value = entry.date;
        document.getElementById('entrySource').value = entry.source;
        document.getElementById('entryInsurance').value = entry.insurance;
        document.getElementById('entryType').value = entry.type;
        document.getElementById('entryAmount').value = entry.originalAmount || entry.amount;
        document.getElementById('entryNotes').value = entry.notes || '';

        // Check if ΕΟΠΥΥ entry
        const isEopyy = entry.insurance.toUpperCase().includes('ΕΟΠΥΥ');

        if (isEopyy && entry.deductions) {
            // Show ΕΟΠΥΥ fields
            const eopyyFields = document.getElementById('entryEopyyFields');
            if (eopyyFields) {
                eopyyFields.style.display = 'block';
            }

            // Populate deduction fields
            document.getElementById('entryParakratisi').value = entry.deductions.parakratisi || 0;
            document.getElementById('entryParakratisiPercent').value = entry.deductions.parakratisiPercent || 0;
            document.getElementById('entryMDE').value = entry.deductions.mde || 0;
            document.getElementById('entryMDEPercent').value = entry.deductions.mdePercent || 0;
            document.getElementById('entryRebate').value = entry.deductions.rebate || 0;
            document.getElementById('entryRebatePercent').value = entry.deductions.rebatePercent || 0;
            document.getElementById('entryKrathseisEopyy').value = entry.deductions.krathseis || 0;
            document.getElementById('entryKrathseisEopyyPercent').value = entry.deductions.krathseisPercent || 0;
            document.getElementById('entryClawback').value = entry.deductions.clawback || 0;
            document.getElementById('entryClawbackPercent').value = entry.deductions.clawbackPercent || 0;
            
            const clawbackPeriodEl = document.getElementById('entryClawbackPeriod');
            if (clawbackPeriodEl) {
                clawbackPeriodEl.value = entry.deductions.clawbackPeriod || 'monthly';
            }

            // Hide non-ΕΟΠΥΥ field
            const otherKrathseisField = document.getElementById('entryKrathseisOtherField');
            if (otherKrathseisField) {
                otherKrathseisField.style.display = 'none';
            }
        } else {
            // Show non-ΕΟΠΥΥ field
            const otherKrathseisField = document.getElementById('entryKrathseisOtherField');
            if (otherKrathseisField) {
                otherKrathseisField.style.display = 'block';
                document.getElementById('entryKrathseisOther').value = entry.krathseis || 0;
                document.getElementById('entryKrathseisOtherPercent').value = entry.krathseisPercent || 0;
            }

            // Hide ΕΟΠΥΥ fields
            const eopyyFields = document.getElementById('entryEopyyFields');
            if (eopyyFields) {
                eopyyFields.style.display = 'none';
            }
        }

        // Update modal title
        const modalTitle = document.querySelector('#entryModal h3');
        if (modalTitle) {
            modalTitle.textContent = 'Επεξεργασία Εγγραφής';
        }

        // Show modal
        const modal = document.getElementById('entryModal');
        if (modal) {
            modal.classList.add('active');
        }
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

        // ========================================
        // Cloud Sync View Setup
        // ========================================
        async function setupCloudSyncView() {
            try {
                // Import cloud sync manager
                const { default: cloudSyncManager } = await import('./cloudAdapters.js');
                
                // Provider names
                const providers = ['googledrive', 'dropbox', 'onedrive'];
                
                // Update status for all providers
                function updateAllStatuses() {
                    providers.forEach(provider => {
                        const status = cloudSyncManager.getSyncStatus(provider);
                        const statusEl = document.getElementById(`${provider}Status`);
                        const connectBtn = document.getElementById(`${provider}ConnectBtn`);
                        const syncBtn = document.getElementById(`${provider}SyncBtn`);
                        const disconnectBtn = document.getElementById(`${provider}DisconnectBtn`);
                        const infoEl = document.getElementById(`${provider}Info`);
                        
                        if (status.authenticated) {
                            if (statusEl) statusEl.textContent = `✅ Συνδεδεμένο`;
                            if (statusEl) statusEl.style.color = 'var(--success-color)';
                            if (connectBtn) connectBtn.style.display = 'none';
                            if (syncBtn) syncBtn.style.display = 'inline-flex';
                            if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';
                            if (infoEl) {
                                infoEl.style.display = 'block';
                                infoEl.innerHTML = `<strong>Τελευταίο sync:</strong> ${status.lastSync}`;
                            }
                        } else {
                            if (statusEl) statusEl.textContent = 'Μη συνδεδεμένο';
                            if (statusEl) statusEl.style.color = 'var(--text-secondary)';
                            if (connectBtn) connectBtn.style.display = 'inline-flex';
                            if (syncBtn) syncBtn.style.display = 'none';
                            if (disconnectBtn) disconnectBtn.style.display = 'none';
                            if (infoEl) infoEl.style.display = 'none';
                        }
                    });
                }
                
                // Connect buttons
                providers.forEach(provider => {
                    const connectBtn = document.getElementById(`${provider}ConnectBtn`);
                    if (connectBtn) {
                        connectBtn.addEventListener('click', async () => {
                            try {
                                showToast('Άνοιγμα παραθύρου εξουσιοδότησης...', 'info');
                                
                                const adapter = cloudSyncManager.getAdapter(provider);
                                await adapter.authenticate();
                                
                                updateAllStatuses();
                                showToast(`Επιτυχής σύνδεση με ${adapter.config.name}!`, 'success');
                                
                            } catch (error) {
                                console.error(`${provider} auth error:`, error);
                                showToast(`Σφάλμα σύνδεσης: ${error.message}`, 'error');
                            }
                        });
                    }
                });
                
                // Sync buttons
                providers.forEach(provider => {
                    const syncBtn = document.getElementById(`${provider}SyncBtn`);
                    if (syncBtn) {
                        syncBtn.addEventListener('click', async () => {
                            try {
                                showToast('Αποστολή backup στο cloud...', 'info');
                                
                                const result = await cloudSyncManager.syncToCloud(provider);
                                
                                if (result.success) {
                                    updateAllStatuses();
                                    showToast(`✅ Backup αποθηκεύτηκε: ${result.filename}`, 'success');
                                    
                                    // Refresh backups list
                                    await refreshCloudBackups(provider);
                                }
                                
                            } catch (error) {
                                console.error(`${provider} sync error:`, error);
                                showToast(`Σφάλμα sync: ${error.message}`, 'error');
                            }
                        });
                    }
                });
                
                // Disconnect buttons
                providers.forEach(provider => {
                    const disconnectBtn = document.getElementById(`${provider}DisconnectBtn`);
                    if (disconnectBtn) {
                        disconnectBtn.addEventListener('click', async () => {
                            if (!confirm(`Αποσύνδεση από ${provider}?`)) return;
                            
                            try {
                                const adapter = cloudSyncManager.getAdapter(provider);
                                await adapter.logout();
                                
                                updateAllStatuses();
                                showToast('Αποσυνδέθηκε επιτυχώς', 'success');
                                
                            } catch (error) {
                                console.error(`${provider} disconnect error:`, error);
                                showToast('Σφάλμα αποσύνδεσης', 'error');
                            }
                        });
                    }
                });
                
                // Auto-sync toggle
                const autoSyncEnabled = document.getElementById('autoSyncEnabled');
                const autoSyncProviderSelect = document.getElementById('autoSyncProviderSelect');
                const autoSyncProvider = document.getElementById('autoSyncProvider');
                
                if (autoSyncEnabled) {
                    // Load saved preference
                    const savedAutoSync = localStorage.getItem('autoSyncEnabled') === 'true';
                    const savedProvider = localStorage.getItem('autoSyncProvider');
                    
                    autoSyncEnabled.checked = savedAutoSync;
                    if (savedAutoSync && autoSyncProviderSelect) {
                        autoSyncProviderSelect.style.display = 'block';
                    }
                    if (savedProvider && autoSyncProvider) {
                        autoSyncProvider.value = savedProvider;
                    }
                    
                    autoSyncEnabled.addEventListener('change', (e) => {
                        const enabled = e.target.checked;
                        localStorage.setItem('autoSyncEnabled', enabled ? 'true' : 'false');
                        
                        if (autoSyncProviderSelect) {
                            autoSyncProviderSelect.style.display = enabled ? 'block' : 'none';
                        }
                        
                        if (enabled && autoSyncProvider && autoSyncProvider.value) {
                            cloudSyncManager.enableAutoSync(
                                autoSyncProvider.value,
                                15 * 60 * 1000 // 15 minutes
                            );
                            showToast('Auto-sync ενεργοποιήθηκε', 'success');
                        } else {
                            cloudSyncManager.disableAutoSync();
                            showToast('Auto-sync απενεργοποιήθηκε', 'info');
                        }
                    });
                }
                
                if (autoSyncProvider) {
                    autoSyncProvider.addEventListener('change', (e) => {
                        const provider = e.target.value;
                        localStorage.setItem('autoSyncProvider', provider);
                        
                        if (autoSyncEnabled && autoSyncEnabled.checked && provider) {
                            cloudSyncManager.disableAutoSync();
                            cloudSyncManager.enableAutoSync(provider, 15 * 60 * 1000);
                            showToast(`Auto-sync ρυθμίστηκε για ${provider}`, 'success');
                        }
                    });
                }
                
                // Refresh backups button
                const refreshBackupsBtn = document.getElementById('refreshBackupsBtn');
                if (refreshBackupsBtn) {
                    refreshBackupsBtn.addEventListener('click', async () => {
                        // Find first authenticated provider
                        const authenticatedProvider = providers.find(p => {
                            const adapter = cloudSyncManager.getAdapter(p);
                            return adapter.isAuthenticated;
                        });
                        
                        if (authenticatedProvider) {
                            await refreshCloudBackups(authenticatedProvider);
                        } else {
                            showToast('Συνδεθείτε σε cloud provider', 'warning');
                        }
                    });
                }
                
                // Helper: Refresh cloud backups list
                async function refreshCloudBackups(provider) {
                    const listEl = document.getElementById('cloudBackupsList');
                    if (!listEl) return;
                    
                    try {
                        listEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Φόρτωση...</p>';
                        
                        const backups = await cloudSyncManager.listBackups(provider);
                        
                        if (backups.length === 0) {
                            listEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Δεν υπάρχουν backups</p>';
                            return;
                        }
                        
                        listEl.innerHTML = `
                            <div class="table-responsive">
                                <table class="data-table data-table-compact">
                                    <thead>
                                        <tr>
                                            <th>Όνομα</th>
                                            <th>Ημερομηνία</th>
                                            <th>Μέγεθος</th>
                                            <th class="text-center">Ενέργειες</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${backups.map(backup => `
                                            <tr>
                                                <td>${escapeHtml(backup.name || backup.path_display || 'backup')}</td>
                                                <td>${new Date(backup.modifiedTime || backup.client_modified || backup.lastModifiedDateTime).toLocaleString('el-GR')}</td>
                                                <td>${formatFileSize(backup.size)}</td>
                                                <td class="text-center">
                                                    <button class="btn-primary btn-compact btn-sm" onclick="restoreCloudBackup('${provider}', '${backup.id || backup.path_display || backup.id}')">
                                                        📥 Restore
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `;
                        
                    } catch (error) {
                        console.error('Refresh backups error:', error);
                        listEl.innerHTML = '<p style="text-align: center; color: var(--danger-color);">Σφάλμα φόρτωσης backups</p>';
                    }
                }
                
                // Helper: Format file size
                function formatFileSize(bytes) {
                    if (!bytes) return 'N/A';
                    if (bytes < 1024) return bytes + ' B';
                    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
                    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
                }
                
                // Initial status update
                updateAllStatuses();
                
            } catch (error) {
                console.error('Cloud sync setup error:', error);
            }
        }

        // Global function for restore button
        window.restoreCloudBackup = async function(provider, fileId) {
            if (!confirm('Restore αυτό το backup? Τα τρέχοντα δεδομένα θα αντικατασταθούν!')) {
                return;
            }
            
            try {
                showToast('Ανάκτηση backup από cloud...', 'info');
                
                const { default: cloudSyncManager } = await import('./cloudAdapters.js');
                const report = await cloudSyncManager.restoreFromCloud(provider, fileId);
                
                if (report.success) {
                    showToast(`✅ Επιτυχής ανάκτηση! Εισήχθησαν ${report.inserted} εγγραφές`, 'success');
                    
                    // Reload app data
                    await loadData();
                    renderSourcesAndInsurances();
                    renderDashboard();
                    renderEntriesTable();
                } else {
                    showToast('Σφάλμα ανάκτησης', 'error');
                }
                
            } catch (error) {
                console.error('Restore error:', error);
                showToast('Σφάλμα ανάκτησης: ' + error.message, 'error');
            }
        };

    // ========================================
    // Service Worker Registration (PWA)
    // ========================================
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', async () => {
            try {
                const registration = await navigator.serviceWorker.register('./service-worker.js');
                console.log('✅ Service Worker registered:', registration.scope);
                
                // ❌ DISABLE PERIODIC UPDATES (causes issues)
                // setInterval(() => {
                //     registration.update();
                // }, 60 * 60 * 1000);
                
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
        });
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
});

    // ========================================
    // Export for Debugging
    // ========================================
    export {
        loadData,
        saveData,
        addEntry,
        deleteEntry
    };