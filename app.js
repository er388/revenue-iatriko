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
import forecastingManager from './forecasting.js';
import heatmapManager from './heatmaps.js';
import cloudSyncManager from './cloudAdapters.js';

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
        setupForecastingView();
        setupHeatmapsView();
        setupCloudView();


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

        /**
             * Setup Forecasting View
             */
            function setupForecastingView() {
                console.log('⚙️ Setting up Forecasting view...');
                
                const forecastMethod = document.getElementById('forecastMethod');
                const forecastPeriods = document.getElementById('forecastPeriods');
                const forecastPeriodsLabel = document.getElementById('forecastPeriodsLabel');
                const forecastIncludeParakratisi = document.getElementById('forecastIncludeParakratisi');
                const generateForecastBtn = document.getElementById('generateForecastBtn');
                const resetForecastBtn = document.getElementById('resetForecastBtn');
                const exportForecastCsvBtn = document.getElementById('exportForecastCsvBtn');
                const exportForecastPdfBtn = document.getElementById('exportForecastPdfBtn');
                const fullscreenChartBtn = document.getElementById('fullscreenChartBtn');
                
                // Holt-Winters parameters
                const hwAlpha = document.getElementById('hwAlpha');
                const hwBeta = document.getElementById('hwBeta');
                const hwGamma = document.getElementById('hwGamma');
                const hwAlphaLabel = document.getElementById('hwAlphaLabel');
                const hwBetaLabel = document.getElementById('hwBetaLabel');
                const hwGammaLabel = document.getElementById('hwGammaLabel');
                const hwAdvancedOptions = document.getElementById('hwAdvancedOptions');
                
                let currentForecast = null;
                
                // Update method description
                const methodDescriptions = {
                    linear: 'Γραμμική τάση - Καλύτερη για σταθερά αυξανόμενα/μειούμενα έσοδα',
                    seasonal: 'Εποχικό μοντέλο - Ιδανικό όταν υπάρχει επαναλαμβανόμενο pattern',
                    'holt-winters': 'Προηγμένο μοντέλο - Συνδυάζει τάση και εποχικότητα'
                };
                
                if (forecastMethod) {
                    forecastMethod.addEventListener('change', (e) => {
                        const method = e.target.value;
                        const descEl = document.getElementById('methodDescription');
                        
                        if (descEl) {
                            descEl.textContent = methodDescriptions[method] || '';
                            descEl.className = `help-text method-description ${method}`;
                        }
                        
                        // Show/hide Holt-Winters options
                        if (hwAdvancedOptions) {
                            hwAdvancedOptions.style.display = method === 'holt-winters' ? 'block' : 'none';
                        }
                    });
                }
                
                // Update periods label
                if (forecastPeriods && forecastPeriodsLabel) {
                    forecastPeriods.addEventListener('input', (e) => {
                        const periods = e.target.value;
                        forecastPeriodsLabel.textContent = `${periods} μήνες`;
                    });
                }
                
                // Update HW parameter labels
                if (hwAlpha && hwAlphaLabel) {
                    hwAlpha.addEventListener('input', (e) => {
                        hwAlphaLabel.textContent = parseFloat(e.target.value).toFixed(2);
                    });
                }
                
                if (hwBeta && hwBetaLabel) {
                    hwBeta.addEventListener('input', (e) => {
                        hwBetaLabel.textContent = parseFloat(e.target.value).toFixed(2);
                    });
                }
                
                if (hwGamma && hwGammaLabel) {
                    hwGamma.addEventListener('input', (e) => {
                        hwGammaLabel.textContent = parseFloat(e.target.value).toFixed(2);
                    });
                }
                
                // Generate Forecast Button
                if (generateForecastBtn) {
                    generateForecastBtn.addEventListener('click', async () => {
                        console.log('🔮 Generating forecast...');
                        
                        // Get parameters
                        const method = forecastMethod?.value || 'linear';
                        const periods = parseInt(forecastPeriods?.value || 6);
                        const includeParakratisi = forecastIncludeParakratisi?.checked || false;
                        
                        // HW parameters
                        const hwOptions = method === 'holt-winters' ? {
                            alpha: parseFloat(hwAlpha?.value || 0.2),
                            beta: parseFloat(hwBeta?.value || 0.1),
                            gamma: parseFloat(hwGamma?.value || 0.1)
                        } : {};
                        
                        // Validate data
                        if (STATE.entries.length === 0) {
                            showToast('Δεν υπάρχουν δεδομένα για πρόβλεψη', 'warning');
                            return;
                        }
                        
                        // Show loading
                        showLoadingIndicator(true);
                        
                        try {
                            // Generate forecast
                            const result = await new Promise((resolve) => {
                                setTimeout(() => {
                                    const forecast = forecastingManager.generateForecast(
                                        STATE.entries,
                                        method,
                                        periods,
                                        { includeParakratisi, ...hwOptions }
                                    );
                                    resolve(forecast);
                                }, 500); // Small delay for UX
                            });
                            
                            if (result.success) {
                                currentForecast = result;
                                displayForecastResults(result);
                                showToast('Πρόβλεψη δημιουργήθηκε επιτυχώς', 'success');
                                
                                if (resetForecastBtn) {
                                    resetForecastBtn.style.display = 'inline-flex';
                                }
                            } else {
                                showToast(result.error || 'Σφάλμα δημιουργίας πρόβλεψης', 'error');
                            }
                        } catch (error) {
                            console.error('Forecast error:', error);
                            showToast('Σφάλμα: ' + error.message, 'error');
                        } finally {
                            showLoadingIndicator(false);
                        }
                    });
                }
                
                // Reset Forecast Button
                if (resetForecastBtn) {
                    resetForecastBtn.addEventListener('click', () => {
                        currentForecast = null;
                        document.getElementById('forecastResultsSection').style.display = 'none';
                        document.getElementById('forecastEmptyState').style.display = 'block';
                        resetForecastBtn.style.display = 'none';
                        
                        // Destroy chart
                        if (STATE.charts['forecastChart']) {
                            STATE.charts['forecastChart'].destroy();
                            delete STATE.charts['forecastChart'];
                        }
                        
                        showToast('Πρόβλεψη επαναφέρθηκε', 'info');
                    });
                }
                
                // Export CSV Button
                if (exportForecastCsvBtn) {
                    exportForecastCsvBtn.addEventListener('click', () => {
                        if (!currentForecast) {
                            showToast('Δημιουργήστε πρώτα μια πρόβλεψη', 'warning');
                            return;
                        }
                        
                        forecastingManager.exportForecastCSV(currentForecast);
                    });
                }
                
                // Export PDF Button
                if (exportForecastPdfBtn) {
                    exportForecastPdfBtn.addEventListener('click', async () => {
                        if (!currentForecast) {
                            showToast('Δημιουργήστε πρώτα μια πρόβλεψη', 'warning');
                            return;
                        }
                        
                        if (!STATE.cdnAvailable) {
                            showToast('PDF export δεν είναι διαθέσιμο (CDN offline)', 'error');
                            return;
                        }
                        
                        showToast('Δημιουργία PDF...', 'info');
                        
                        try {
                            await pdfExportManager.exportHeatmap('forecastChart', 'Forecast_Report');
                            showToast('PDF δημιουργήθηκε επιτυχώς', 'success');
                        } catch (error) {
                            console.error('PDF export error:', error);
                            showToast('Σφάλμα δημιουργίας PDF', 'error');
                        }
                    });
                }
                
                // Fullscreen Chart Button
                if (fullscreenChartBtn) {
                    fullscreenChartBtn.addEventListener('click', () => {
                        const canvas = document.getElementById('forecastChart');
                        if (!canvas) return;
                        
                        if (canvas.classList.contains('chart-fullscreen')) {
                            // Exit fullscreen
                            canvas.classList.remove('chart-fullscreen');
                            document.body.style.overflow = '';
                            
                            // Remove overlay
                            const overlay = document.querySelector('.chart-fullscreen-overlay');
                            if (overlay) {
                                overlay.remove();
                            }
                        } else {
                            // Enter fullscreen
                            canvas.classList.add('chart-fullscreen');
                            document.body.style.overflow = 'hidden';
                            
                            // Add overlay
                            const overlay = document.createElement('div');
                            overlay.className = 'chart-fullscreen-overlay';
                            overlay.addEventListener('click', () => {
                                fullscreenChartBtn.click(); // Exit fullscreen
                            });
                            document.body.appendChild(overlay);
                        }
                        
                        // Trigger chart resize
                        if (STATE.charts['forecastChart']) {
                            STATE.charts['forecastChart'].resize();
                        }
                    });
                }
                
                console.log('✅ Forecasting view setup complete');
            }

            /**
         * Setup Heatmaps View
         */
        function setupHeatmapsView() {
            console.log('⚙️ Setting up Heatmaps view...');
            
            const heatmapType = document.getElementById('heatmapType');
            const heatmapMetric = document.getElementById('heatmapMetric');
            const heatmapIncludeParakratisi = document.getElementById('heatmapIncludeParakratisi');
            const generateHeatmapBtn = document.getElementById('generateHeatmapBtn');
            const resetHeatmapBtn = document.getElementById('resetHeatmapBtn');
            const exportHeatmapPngBtn = document.getElementById('exportHeatmapPngBtn');
            const exportHeatmapPdfBtn = document.getElementById('exportHeatmapPdfBtn');
            const zoomInBtn = document.getElementById('zoomInBtn');
            const zoomOutBtn = document.getElementById('zoomOutBtn');
            const fullscreenHeatmapBtn = document.getElementById('fullscreenHeatmapBtn');
            
            let currentHeatmap = null;
            let currentZoom = 100; // Percentage
            
            // Type descriptions
            const typeDescriptions = {
                'month-year': 'Εμφάνιση κατανομής εσόδων ανά μήνα και έτος - ιδανικό για εντοπισμό εποχικών patterns',
                'source-month': 'Δείτε ποια διαγνωστικά κέντρα είχαν έσοδα σε ποιους μήνες',
                'insurance-month': 'Ανάλυση κατανομής ασφαλειών στο χρόνο'
            };
            
            // Update type description
            if (heatmapType) {
                heatmapType.addEventListener('change', (e) => {
                    const descEl = document.getElementById('heatmapTypeDescription');
                    if (descEl) {
                        descEl.textContent = typeDescriptions[e.target.value] || '';
                        descEl.className = `help-text heatmap-type-info ${e.target.value}`;
                    }
                });
            }
            
            // Generate Heatmap Button
            if (generateHeatmapBtn) {
                generateHeatmapBtn.addEventListener('click', async () => {
                    console.log('🌡️ Generating heatmap...');
                    
                    // Get parameters
                    const type = heatmapType?.value || 'month-year';
                    const metric = heatmapMetric?.value || 'revenue';
                    const includeParakratisi = heatmapIncludeParakratisi?.checked || false;
                    
                    // Validate data
                    if (STATE.entries.length === 0) {
                        showToast('Δεν υπάρχουν δεδομένα για heatmap', 'warning');
                        return;
                    }
                    
                    // Show loading
                    showHeatmapLoadingIndicator(true);
                    
                    try {
                        // Generate heatmap data
                        let heatmapData;
                        
                        await new Promise(resolve => setTimeout(resolve, 300)); // UX delay
                        
                        switch (type) {
                            case 'month-year':
                                heatmapData = heatmapManager.generateMonthYearHeatmap(
                                    STATE.entries,
                                    { includeParakratisi, metric }
                                );
                                break;
                            case 'source-month':
                                heatmapData = heatmapManager.generateSourceMonthHeatmap(
                                    STATE.entries,
                                    { includeParakratisi, metric }
                                );
                                break;
                            case 'insurance-month':
                                heatmapData = heatmapManager.generateInsuranceMonthHeatmap(
                                    STATE.entries,
                                    { includeParakratisi, metric }
                                );
                                break;
                            default:
                                throw new Error('Άγνωστος τύπος heatmap');
                        }
                        
                        // Render on canvas
                        const result = heatmapManager.renderCanvas(heatmapData, 'heatmapCanvas');
                        
                        if (result) {
                            currentHeatmap = { data: heatmapData, ...result };
                            displayHeatmapResults(heatmapData);
                            showToast('Heatmap δημιουργήθηκε επιτυχώς', 'success');
                            
                            if (resetHeatmapBtn) {
                                resetHeatmapBtn.style.display = 'inline-flex';
                            }
                        } else {
                            showToast('Σφάλμα rendering heatmap', 'error');
                        }
                        
                    } catch (error) {
                        console.error('Heatmap error:', error);
                        showToast('Σφάλμα: ' + error.message, 'error');
                    } finally {
                        showHeatmapLoadingIndicator(false);
                    }
                });
            }
            
            // Reset Heatmap Button
            if (resetHeatmapBtn) {
                resetHeatmapBtn.addEventListener('click', () => {
                    currentHeatmap = null;
                    currentZoom = 100;
                    
                    document.getElementById('heatmapDisplaySection').style.display = 'none';
                    document.getElementById('heatmapEmptyState').style.display = 'block';
                    resetHeatmapBtn.style.display = 'none';
                    
                    // Clear canvas
                    const canvas = document.getElementById('heatmapCanvas');
                    if (canvas) {
                        const ctx = canvas.getContext('2d');
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                    }
                    
                    // Destroy heatmap
                    heatmapManager.destroy('heatmapCanvas');
                    
                    showToast('Heatmap επαναφέρθηκε', 'info');
                });
            }
            
            // Export PNG Button
            if (exportHeatmapPngBtn) {
                exportHeatmapPngBtn.addEventListener('click', () => {
                    if (!currentHeatmap) {
                        showToast('Δημιουργήστε πρώτα ένα heatmap', 'warning');
                        return;
                    }
                    
                    heatmapManager.exportHeatmapPNG(
                        'heatmapCanvas',
                        `heatmap_${currentHeatmap.data.type}`
                    );
                });
            }
            
            // Export PDF Button
            if (exportHeatmapPdfBtn) {
                exportHeatmapPdfBtn.addEventListener('click', async () => {
                    if (!currentHeatmap) {
                        showToast('Δημιουργήστε πρώτα ένα heatmap', 'warning');
                        return;
                    }
                    
                    if (!STATE.cdnAvailable) {
                        showToast('PDF export δεν είναι διαθέσιμο (CDN offline)', 'error');
                        return;
                    }
                    
                    showToast('Δημιουργία PDF...', 'info');
                    
                    try {
                        await pdfExportManager.exportHeatmap(
                            'heatmapCanvas',
                            `Heatmap_${currentHeatmap.data.type}`
                        );
                        showToast('PDF δημιουργήθηκε επιτυχώς', 'success');
                    } catch (error) {
                        console.error('PDF export error:', error);
                        showToast('Σφάλμα δημιουργίας PDF', 'error');
                    }
                });
            }
            
            // Zoom In Button
            if (zoomInBtn) {
                zoomInBtn.addEventListener('click', () => {
                    if (!currentHeatmap) return;
                    
                    const canvas = document.getElementById('heatmapCanvas');
                    if (canvas) {
                        currentZoom = Math.min(200, currentZoom + 25);
                        canvas.style.transform = `scale(${currentZoom / 100})`;
                        canvas.style.transformOrigin = 'top left';
                        
                        updateZoomDisplay();
                        showToast(`Zoom: ${currentZoom}%`, 'info');
                    }
                });
            }
            
            // Zoom Out Button
            if (zoomOutBtn) {
                zoomOutBtn.addEventListener('click', () => {
                    if (!currentHeatmap) return;
                    
                    const canvas = document.getElementById('heatmapCanvas');
                    if (canvas) {
                        currentZoom = Math.max(50, currentZoom - 25);
                        canvas.style.transform = `scale(${currentZoom / 100})`;
                        canvas.style.transformOrigin = 'top left';
                        
                        updateZoomDisplay();
                        showToast(`Zoom: ${currentZoom}%`, 'info');
                    }
                });
            }
            
            // Fullscreen Button
            if (fullscreenHeatmapBtn) {
                fullscreenHeatmapBtn.addEventListener('click', () => {
                    if (!currentHeatmap) return;
                    
                    const container = document.querySelector('.heatmap-canvas-container');
                    if (!container) return;
                    
                    if (container.classList.contains('heatmap-canvas-fullscreen')) {
                        // Exit fullscreen
                        container.classList.remove('heatmap-canvas-fullscreen');
                        document.body.style.overflow = '';
                        fullscreenHeatmapBtn.textContent = '⛶';
                        
                        // Remove overlay
                        const overlay = document.querySelector('.heatmap-fullscreen-overlay');
                        if (overlay) {
                            overlay.remove();
                        }
                    } else {
                        // Enter fullscreen
                        container.classList.add('heatmap-canvas-fullscreen');
                        document.body.style.overflow = 'hidden';
                        fullscreenHeatmapBtn.textContent = '✕';
                        
                        // Add overlay
                        const overlay = document.createElement('div');
                        overlay.className = 'heatmap-fullscreen-overlay';
                        overlay.style.cssText = `
                            position: fixed;
                            top: 0;
                            left: 0;
                            width: 100%;
                            height: 100%;
                            background: rgba(0, 0, 0, 0.7);
                            z-index: ${parseInt(getComputedStyle(document.documentElement).getPropertyValue('--z-modal')) - 1};
                        `;
                        overlay.addEventListener('click', () => {
                            fullscreenHeatmapBtn.click();
                        });
                        document.body.appendChild(overlay);
                    }
                });
            }
            
            function updateZoomDisplay() {
                const label = document.querySelector('.zoom-level');
                if (label) {
                    label.textContent = `${currentZoom}%`;
                }
            }
            
            console.log('✅ Heatmaps view setup complete');
        }

        /**
         * Setup Cloud Storage View
         */
        function setupCloudView() {
            console.log('⚙️ Setting up Cloud Storage view...');
            
            const autoSyncEnabled = document.getElementById('autoSyncEnabled');
            const autoSyncInterval = document.getElementById('autoSyncInterval');
            const conflictStrategy = document.getElementById('conflictStrategy');
            const manualSyncBtn = document.getElementById('manualSyncBtn');
            
            // Load saved settings
            loadCloudSettings();
            
            // Auto-sync toggle
            if (autoSyncEnabled) {
                autoSyncEnabled.addEventListener('change', async (e) => {
                    const enabled = e.target.checked;
                    
                    if (autoSyncInterval) {
                        autoSyncInterval.disabled = !enabled;
                    }
                    
                    if (enabled) {
                        const interval = parseInt(autoSyncInterval?.value || 15);
                        cloudSyncManager.startAutoSync(interval);
                        showToast('Auto-sync ενεργοποιήθηκε', 'success');
                    } else {
                        cloudSyncManager.stopAutoSync();
                        showToast('Auto-sync απενεργοποιήθηκε', 'info');
                    }
                    
                    await storage.saveSetting('cloud_auto_sync_enabled', enabled);
                });
            }
            
            // Auto-sync interval
            if (autoSyncInterval) {
                autoSyncInterval.addEventListener('change', async (e) => {
                    const interval = parseInt(e.target.value);
                    
                    if (autoSyncEnabled?.checked) {
                        cloudSyncManager.stopAutoSync();
                        
                        if (interval > 0) {
                            cloudSyncManager.startAutoSync(interval);
                            showToast(`Auto-sync: κάθε ${interval} λεπτά`, 'info');
                        }
                    }
                    
                    await storage.saveSetting('cloud_auto_sync_interval', interval);
                });
            }
            
            // Conflict strategy
            if (conflictStrategy) {
                conflictStrategy.addEventListener('change', async (e) => {
                    await storage.saveSetting('cloud_conflict_strategy', e.target.value);
                });
            }
            
            // Manual sync button
            if (manualSyncBtn) {
                manualSyncBtn.addEventListener('click', async () => {
                    const status = cloudSyncManager.getSyncStatus();
                    
                    if (!status.activeProvider) {
                        showToast('Συνδεθείτε πρώτα σε έναν provider', 'warning');
                        return;
                    }
                    
                    if (status.isSyncing) {
                        showToast('Συγχρονισμός σε εξέλιξη...', 'info');
                        return;
                    }
                    
                    const strategy = conflictStrategy?.value || 'last-write-wins';
                    
                    showToast('Έναρξη συγχρονισμού...', 'info');
                    updateSyncStatus('syncing', 'Συγχρονισμός σε εξέλιξη...');
                    
                    const result = await cloudSyncManager.sync(status.activeProvider, strategy);
                    
                    if (result.success) {
                        showToast('Συγχρονισμός ολοκληρώθηκε!', 'success');
                        updateSyncStatus('active', `Τελευταίος: ${new Date(result.timestamp).toLocaleString('el-GR')}`);
                        addSyncHistoryEntry(result);
                    } else {
                        showToast('Σφάλμα συγχρονισμού: ' + result.error, 'error');
                        updateSyncStatus('error', 'Σφάλμα συγχρονισμού');
                    }
                });
            }
            
            // Check initial authentication status
            checkAllProviders();
            
            console.log('✅ Cloud Storage view setup complete');
        }

        /**
         * Connect to provider
         */
        window.connectProvider = async function(provider) {
            console.log('🔗 Connecting to', provider);
            
            const card = document.querySelector(`.provider-card[data-provider="${provider}"]`);
            if (card) {
                card.classList.add('loading');
            }
            
            showToast(`Σύνδεση με ${cloudSyncManager.providers[provider].name}...`, 'info');
            
            try {
                const result = await cloudSyncManager.authenticate(provider);
                
                if (result.success) {
                    showToast('Σύνδεση επιτυχής!', 'success');
                    updateProviderStatus(provider, 'connected');
                    
                    // Enable manual sync
                    const manualSyncBtn = document.getElementById('manualSyncBtn');
                    if (manualSyncBtn) {
                        manualSyncBtn.disabled = false;
                    }
                    
                    // Show status banner
                    showCloudStatusBanner(provider);
                    
                } else {
                    showToast('Σφάλμα σύνδεσης: ' + result.error, 'error');
                    updateProviderStatus(provider, 'error');
                }
            } catch (error) {
                console.error('Connection error:', error);
                showToast('Σφάλμα: ' + error.message, 'error');
                updateProviderStatus(provider, 'error');
            } finally {
                if (card) {
                    card.classList.remove('loading');
                }
            }
        };

        /**
         * Disconnect from provider
         */
        window.disconnectProvider = async function(provider) {
            if (!confirm(`Αποσύνδεση από ${cloudSyncManager.providers[provider].name};\n\nΤα δεδομένα στο cloud δεν θα διαγραφούν.`)) {
                return;
            }
            
            console.log('🔌 Disconnecting from', provider);
            
            try {
                const result = await cloudSyncManager.disconnect(provider);
                
                if (result.success) {
                    showToast('Αποσύνδεση επιτυχής', 'success');
                    updateProviderStatus(provider, 'disconnected');
                    
                    // Hide status banner
                    hideCloudStatusBanner();
                    
                    // Disable manual sync
                    const manualSyncBtn = document.getElementById('manualSyncBtn');
                    if (manualSyncBtn) {
                        manualSyncBtn.disabled = true;
                    }
                } else {
                    showToast('Σφάλμα αποσύνδεσης: ' + result.error, 'error');
                }
            } catch (error) {
                console.error('Disconnect error:', error);
                showToast('Σφάλμα: ' + error.message, 'error');
            }
        };

        /**
         * Save client ID configuration
         */
        window.saveClientId = async function(provider) {
            const input = document.getElementById(`${provider}ClientId`);
            if (!input) return;
            
            const clientId = input.value.trim();
            
            if (!clientId) {
                showToast('Εισάγετε Client ID', 'warning');
                return;
            }
            
            try {
                // Save to provider config
                cloudSyncManager.providers[provider].clientId = clientId;
                
                // Save to storage
                await storage.saveSetting(`cloud_${provider}_client_id`, clientId);
                
                showToast('Client ID αποθηκεύτηκε', 'success');
            } catch (error) {
                console.error('Save client ID error:', error);
                showToast('Σφάλμα αποθήκευσης', 'error');
            }
        };

        /**
         * Update provider status UI
         */
        function updateProviderStatus(provider, status) {
            const statusEl = document.getElementById(`${provider}-status`);
            const card = document.querySelector(`.provider-card[data-provider="${provider}"]`);
            
            if (!statusEl || !card) return;
            
            // Update badge
            const badge = statusEl.querySelector('.status-badge');
            if (badge) {
                badge.className = 'status-badge';
                
                switch (status) {
                    case 'connected':
                        badge.classList.add('status-connected');
                        badge.textContent = 'Συνδεδεμένο ✓';
                        card.classList.add('connected');
                        card.classList.remove('error');
                        break;
                    case 'disconnected':
                        badge.classList.add('status-disconnected');
                        badge.textContent = 'Αποσυνδεδεμένο';
                        card.classList.remove('connected', 'error');
                        break;
                    case 'syncing':
                        badge.classList.add('status-syncing');
                        badge.textContent = 'Συγχρονισμός...';
                        card.classList.add('syncing');
                        break;
                    case 'error':
                        badge.classList.add('status-error');
                        badge.textContent = 'Σφάλμα';
                        card.classList.add('error');
                        card.classList.remove('connected');
                        break;
                }
            }
            
            // Toggle buttons
            const buttons = card.querySelectorAll('button');
            buttons.forEach((btn, idx) => {
                if (status === 'connected') {
                    btn.style.display = idx === 0 ? 'none' : 'inline-flex';
                } else {
                    btn.style.display = idx === 0 ? 'inline-flex' : 'none';
                }
            });
        }

        /**
         * Check all providers authentication status
         */
        async function checkAllProviders() {
            const providers = ['gdrive', 'dropbox', 'onedrive'];
            
            for (const provider of providers) {
                const isAuth = await cloudSyncManager.checkAuthentication(provider);
                
                if (isAuth) {
                    updateProviderStatus(provider, 'connected');
                    cloudSyncManager.syncState.activeProvider = provider;
                    
                    // Enable manual sync
                    const manualSyncBtn = document.getElementById('manualSyncBtn');
                    if (manualSyncBtn) {
                        manualSyncBtn.disabled = false;
                    }
                    
                    // Show status banner
                    showCloudStatusBanner(provider);
                }
                
                // Load client ID
                const clientId = await storage.getSetting(`cloud_${provider}_client_id`);
                if (clientId) {
                    cloudSyncManager.providers[provider].clientId = clientId;
                    const input = document.getElementById(`${provider}ClientId`);
                    if (input) {
                        input.value = clientId;
                    }
                }
            }
        }

        /**
         * Load saved cloud settings
         */
        async function loadCloudSettings() {
            try {
                const autoSyncEnabledSaved = await storage.getSetting('cloud_auto_sync_enabled');
                const autoSyncIntervalSaved = await storage.getSetting('cloud_auto_sync_interval');
                const conflictStrategySaved = await storage.getSetting('cloud_conflict_strategy');
                
                const autoSyncEnabled = document.getElementById('autoSyncEnabled');
                const autoSyncInterval = document.getElementById('autoSyncInterval');
                const conflictStrategy = document.getElementById('conflictStrategy');
                
                if (autoSyncEnabled && autoSyncEnabledSaved !== null) {
                    autoSyncEnabled.checked = autoSyncEnabledSaved;
                }
                
                if (autoSyncInterval && autoSyncIntervalSaved) {
                    autoSyncInterval.value = autoSyncIntervalSaved;
                    autoSyncInterval.disabled = !autoSyncEnabled?.checked;
                }
                
                if (conflictStrategy && conflictStrategySaved) {
                    conflictStrategy.value = conflictStrategySaved;
                }
                
                // Restart auto-sync if enabled
                if (autoSyncEnabled?.checked && autoSyncIntervalSaved > 0) {
                    cloudSyncManager.startAutoSync(autoSyncIntervalSaved);
                }
                
            } catch (error) {
                console.error('Load cloud settings error:', error);
            }
        }

        /**
         * Show cloud status banner
         */
        function showCloudStatusBanner(provider) {
            const banner = document.getElementById('cloudStatusBanner');
            if (!banner) return;
            
            const providerName = cloudSyncManager.providers[provider].name;
            const detailsEl = document.getElementById('cloudStatusDetails');
            
            banner.style.display = 'block';
            
            if (detailsEl) {
                const lastSync = cloudSyncManager.syncState.lastSync;
                detailsEl.textContent = lastSync 
                    ? `Τελευταίος συγχρονισμός: ${new Date(lastSync).toLocaleString('el-GR')}`
                    : `Συνδεδεμένο με ${providerName}`;
            }
        }

        /**
         * Hide cloud status banner
         */
        function hideCloudStatusBanner() {
            const banner = document.getElementById('cloudStatusBanner');
            if (banner) {
                banner.style.display = 'none';
            }
        }

        /**
         * Update sync status indicator
         */
        function updateSyncStatus(status, text) {
            const indicator = document.getElementById('syncStatusIndicator');
            const textEl = document.getElementById('syncStatusText');
            
            if (!indicator || !textEl) return;
            
            indicator.style.display = 'flex';
            indicator.className = 'sync-status-indicator ' + status;
            textEl.textContent = text;
        }

        /**
         * Add entry to sync history
         */
        function addSyncHistoryEntry(result) {
            const container = document.getElementById('syncHistory');
            if (!container) return;
            
            // Remove empty state
            const emptyState = container.querySelector('p');
            if (emptyState) {
                emptyState.remove();
            }
            
            // Create history item
            const item = document.createElement('div');
            item.className = 'sync-history-item';
            
            const icon = result.success ? '✅' : '❌';
            const provider = cloudSyncManager.providers[cloudSyncManager.syncState.activeProvider].name;
            
            item.innerHTML = `
                <div class="sync-history-icon">${icon}</div>
                <div class="sync-history-details">
                    <strong>${provider} - ${result.strategy === 'merge' ? 'Merge' : 'Last Write Wins'}</strong>
                    <small>
                        ${result.conflicts ? `${result.conflicts} συγκρούσεις επιλύθηκαν` : 'Χωρίς συγκρούσεις'}
                    </small>
                </div>
                <div class="sync-history-time">
                    ${new Date(result.timestamp).toLocaleTimeString('el-GR')}
                </div>
            `;
            
            // Prepend (newest first)
            container.insertBefore(item, container.firstChild);
            
            // Limit to 10 entries
            const items = container.querySelectorAll('.sync-history-item');
            if (items.length > 10) {
                items[items.length - 1].remove();
            }
        }

        /**
         * Display heatmap results
         */
        function displayHeatmapResults(heatmapData) {
            // Hide empty state, show results
            document.getElementById('heatmapEmptyState').style.display = 'none';
            document.getElementById('heatmapDisplaySection').style.display = 'block';
            
            // Update title
            const titleEl = document.getElementById('heatmapCanvasTitle');
            if (titleEl) {
                titleEl.textContent = heatmapData.title;
            }
            
            // Display color legend
            displayColorLegend(heatmapData);
            
            // Display statistics
            displayHeatmapStatistics(heatmapData);
            
            // Generate insights
            generateHeatmapInsights(heatmapData);
        }

        /**
         * Display color legend
         */
        function displayColorLegend(heatmapData) {
            const container = document.getElementById('colorLegend');
            if (!container) return;
            
            const colors = heatmapManager.colorSchemes[heatmapData.scheme].colors;
            const colorScale = heatmapManager.calculateColorScale(heatmapData);
            
            // Create gradient
            const gradient = colors.join(', ');
            
            container.innerHTML = `
                <div style="flex: 1;">
                    <div class="legend-gradient" style="background: linear-gradient(90deg, ${gradient});"></div>
                    <div class="legend-labels">
                        <span class="legend-label">
                            ${heatmapData.metric === 'count' ? '0' : formatCurrency(colorScale.min)}
                        </span>
                        <span class="legend-label" style="color: var(--text-tertiary);">
                            ${heatmapManager.colorSchemes[heatmapData.scheme].name}
                        </span>
                        <span class="legend-label">
                            ${heatmapData.metric === 'count' ? colorScale.max : formatCurrency(colorScale.max)}
                        </span>
                    </div>
                </div>
            `;
        }

        /**
         * Display heatmap statistics
         */
        function displayHeatmapStatistics(heatmapData) {
            const container = document.getElementById('heatmapStats');
            if (!container) return;
            
            // Calculate stats
            const allCells = heatmapData.matrix.flatMap(row => row.cells);
            const nonZeroCells = allCells.filter(c => c.value > 0);
            
            const totalValue = allCells.reduce((sum, c) => sum + c.value, 0);
            const avgValue = nonZeroCells.length > 0 
                ? totalValue / nonZeroCells.length 
                : 0;
            
            const maxCell = allCells.reduce((max, c) => c.value > max.value ? c : max, allCells[0]);
            const minNonZeroCell = nonZeroCells.reduce((min, c) => 
                c.value < min.value ? c : min, 
                nonZeroCells[0] || { value: 0 }
            );
            
            const totalCells = allCells.length;
            const activeCells = nonZeroCells.length;
            const emptyRate = ((totalCells - activeCells) / totalCells * 100);
            
            container.innerHTML = `
                <div class="stat-card">
                    <span class="stat-label">Συνολική Αξία</span>
                    <span class="stat-value">${formatCurrency(totalValue)}</span>
                    <span class="stat-description">Άθροισμα όλων των κελιών</span>
                </div>
                
                <div class="stat-card">
                    <span class="stat-label">Μέσος Όρος</span>
                    <span class="stat-value">${formatCurrency(avgValue)}</span>
                    <span class="stat-description">Ανά ενεργό κελί</span>
                </div>
                
                <div class="stat-card">
                    <span class="stat-label">Μέγιστη Τιμή</span>
                    <span class="stat-value">${heatmapData.metric === 'count' ? maxCell.count : formatCurrency(maxCell.value)}</span>
                    <span class="stat-description">${escapeHtml(maxCell.label)}</span>
                </div>
                
                <div class="stat-card">
                    <span class="stat-label">Ελάχιστη Τιμή</span>
                    <span class="stat-value">${heatmapData.metric === 'count' ? minNonZeroCell.count : formatCurrency(minNonZeroCell.value)}</span>
                    <span class="stat-description">${escapeHtml(minNonZeroCell.label || 'N/A')}</span>
                </div>
                
                <div class="stat-card">
                    <span class="stat-label">Ενεργά Κελιά</span>
                    <span class="stat-value">${activeCells} / ${totalCells}</span>
                    <span class="stat-description">${emptyRate.toFixed(1)}% κενά</span>
                </div>
            `;
        }

        /**
         * Generate heatmap insights
         */
        function generateHeatmapInsights(heatmapData) {
            const container = document.getElementById('heatmapInsights');
            if (!container) return;
            
            const insights = [];
            const allCells = heatmapData.matrix.flatMap(row => row.cells);
            const nonZeroCells = allCells.filter(c => c.value > 0);
            
            // Find hotspots
            const sorted = [...nonZeroCells].sort((a, b) => b.value - a.value);
            const top3 = sorted.slice(0, 3);
            
            if (top3.length > 0) {
                insights.push({
                    icon: '🔥',
                    text: `<strong>Top Hotspots:</strong> ${top3.map(c => escapeHtml(c.label)).join(', ')}`
                });
            }
            
            // Check for patterns
            const emptyRate = ((allCells.length - nonZeroCells.length) / allCells.length * 100);
            
            if (emptyRate > 50) {
                insights.push({
                    icon: '⚠️',
                    text: `<strong>Αραιή κατανομή:</strong> ${emptyRate.toFixed(1)}% των κελιών είναι κενά - υπάρχουν πολλές περίοδοι χωρίς δραστηριότητα.`
                });
            } else if (emptyRate < 20) {
                insights.push({
                    icon: '✅',
                    text: `<strong>Πυκνή κατανομή:</strong> Μόνο ${emptyRate.toFixed(1)}% κενά κελιά - συνεχής δραστηριότητα στις περισσότερες περιόδους.`
                });
            }
            
            // Value distribution
            const values = nonZeroCells.map(c => c.value);
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
            const stdDev = Math.sqrt(variance);
            const cv = (stdDev / mean) * 100; // Coefficient of variation
            
            if (cv > 50) {
                insights.push({
                    icon: '📊',
                    text: `<strong>Υψηλή διακύμανση:</strong> Τα έσοδα ποικίλλουν σημαντικά (CV: ${cv.toFixed(1)}%) - υπάρχουν έντονες διαφορές μεταξύ περιόδων.`
                });
            } else if (cv < 20) {
                insights.push({
                    icon: '➡️',
                    text: `<strong>Σταθερότητα:</strong> Τα έσοδα είναι σχετικά σταθερά (CV: ${cv.toFixed(1)}%) - προβλέψιμο pattern.`
                });
            }
            
            // Type-specific insights
            if (heatmapData.type === 'month-year') {
                // Check for seasonality
                const monthTotals = new Array(12).fill(0);
                heatmapData.matrix.forEach((row, idx) => {
                    const monthTotal = row.cells.reduce((sum, c) => sum + c.value, 0);
                    monthTotals[idx] = monthTotal;
                });
                
                const maxMonth = monthTotals.indexOf(Math.max(...monthTotals));
                const minMonth = monthTotals.indexOf(Math.min(...monthTotals.filter(v => v > 0)));
                
                insights.push({
                    icon: '📅',
                    text: `<strong>Εποχικότητα:</strong> Ο καλύτερος μήνας είναι ${heatmapManager.getMonthLabel(maxMonth + 1)}, ο χειρότερος ${heatmapManager.getMonthLabel(minMonth + 1)}.`
                });
            }
            
            // Render insights
            container.innerHTML = insights.map(insight => `
                <div class="heatmap-insight-item">
                    <div class="heatmap-insight-icon">${insight.icon}</div>
                    <div class="heatmap-insight-content">
                        <p>${insight.text}</p>
                    </div>
                </div>
            `).join('');
        }

        /**
         * Show/hide heatmap loading indicator
         */
        function showHeatmapLoadingIndicator(show) {
            const indicator = document.getElementById('heatmapLoadingIndicator');
            if (indicator) {
                indicator.style.display = show ? 'flex' : 'none';
            }
        }

    /**
     * Display forecast results
     */
    function displayForecastResults(result) {
        // Hide empty state, show results
        document.getElementById('forecastEmptyState').style.display = 'none';
        document.getElementById('forecastResultsSection').style.display = 'block';
        
        // Render chart
        forecastingManager.visualizeForecast(result, 'forecastChart');
        
        // Display metrics
        displayForecastMetrics(result.metrics);
        
        // Populate forecast table
        populateForecastTable(result.forecast);
        
        // Generate insights
        generateForecastInsights(result);
    }

    /**
     * Display forecast metrics
     */
    function displayForecastMetrics(metrics) {
        const container = document.getElementById('forecastMetricsDisplay');
        if (!container) return;
        
        if (!metrics.available) {
            container.innerHTML = `
                <div class="metric-card">
                    <span class="metric-label">Μετρικές</span>
                    <span class="metric-value">-</span>
                    <span class="metric-description">${escapeHtml(metrics.message)}</span>
                </div>
            `;
            return;
        }
        
        // Determine accuracy class
        let accuracyClass = 'accuracy-good';
        if (metrics.accuracy < 70) {
            accuracyClass = 'accuracy-poor';
        } else if (metrics.accuracy < 85) {
            accuracyClass = 'accuracy-medium';
        }
        
        container.innerHTML = `
            <div class="metric-card">
                <span class="metric-label">Ακρίβεια</span>
                <span class="metric-value ${accuracyClass}">${metrics.accuracy.toFixed(1)}%</span>
                <span class="metric-description">Συνολική απόδοση μοντέλου</span>
            </div>
            
            <div class="metric-card">
                <span class="metric-label">MAE</span>
                <span class="metric-value">${formatCurrency(metrics.mae)}</span>
                <span class="metric-description">Μέσο απόλυτο σφάλμα</span>
            </div>
            
            <div class="metric-card">
                <span class="metric-label">RMSE</span>
                <span class="metric-value">${formatCurrency(metrics.rmse)}</span>
                <span class="metric-description">Ρίζα μέσου τετραγωνικού σφάλματος</span>
            </div>
            
            <div class="metric-card">
                <span class="metric-label">MAPE</span>
                <span class="metric-value ${accuracyClass}">${metrics.mape.toFixed(2)}%</span>
                <span class="metric-description">Μέσο ποσοστό σφάλματος</span>
            </div>
        `;
    }

    /**
     * Populate forecast table
     */
    function populateForecastTable(forecasts) {
        const tbody = document.getElementById('forecastTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = forecasts.map(f => {
            const range = f.upper && f.lower ? f.upper - f.lower : 0;
            
            return `
                <tr>
                    <td class="forecast-date">${escapeHtml(f.date)}</td>
                    <td class="text-right forecast-value">${formatCurrency(f.value)}</td>
                    <td class="text-right confidence-range">${formatCurrency(f.lower || 0)}</td>
                    <td class="text-right confidence-range">${formatCurrency(f.upper || 0)}</td>
                    <td class="text-right confidence-range">${formatCurrency(range)}</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Generate insights from forecast
     */
    function generateForecastInsights(result) {
        const container = document.getElementById('forecastInsights');
        if (!container) return;
        
        const { historical, forecast, method } = result;
        const insights = [];
        
        // Calculate trend
        const lastHistorical = historical[historical.length - 1].value;
        const avgForecast = forecast.reduce((sum, f) => sum + f.value, 0) / forecast.length;
        const trendPercent = ((avgForecast - lastHistorical) / lastHistorical * 100);
        
        if (trendPercent > 5) {
            insights.push({
                icon: '📈',
                text: `<strong>Ανοδική τάση:</strong> Τα έσοδα αναμένεται να αυξηθούν κατά <strong>${trendPercent.toFixed(1)}%</strong> στους επόμενους μήνες.`
            });
        } else if (trendPercent < -5) {
            insights.push({
                icon: '📉',
                text: `<strong>Καθοδική τάση:</strong> Τα έσοδα αναμένεται να μειωθούν κατά <strong>${Math.abs(trendPercent).toFixed(1)}%</strong> στους επόμενους μήνες.`
            });
        } else {
            insights.push({
                icon: '➡️',
                text: `<strong>Σταθερή τάση:</strong> Τα έσοδα αναμένεται να παραμείνουν σχετικά σταθερά (±${Math.abs(trendPercent).toFixed(1)}%).`
            });
        }
        
        // Best/worst month
        const maxForecast = forecast.reduce((max, f) => f.value > max.value ? f : max, forecast[0]);
        const minForecast = forecast.reduce((min, f) => f.value < min.value ? f : min, forecast[0]);
        
        if (maxForecast !== minForecast) {
            insights.push({
                icon: '🌟',
                text: `<strong>Καλύτερος μήνας:</strong> ${maxForecast.date} με πρόβλεψη ${formatCurrency(maxForecast.value)}`
            });
            
            insights.push({
                icon: '⚠️',
                text: `<strong>Χειρότερος μήνας:</strong> ${minForecast.date} με πρόβλεψη ${formatCurrency(minForecast.value)}`
            });
        }
        
        // Confidence interval width
        if (forecast[0].upper && forecast[0].lower) {
            const avgRange = forecast.reduce((sum, f) => sum + (f.upper - f.lower), 0) / forecast.length;
            const rangePercent = (avgRange / avgForecast * 100);
            
            if (rangePercent < 20) {
                insights.push({
                    icon: '✅',
                    text: `<strong>Υψηλή βεβαιότητα:</strong> Το εύρος πρόβλεψης είναι στενό (±${rangePercent.toFixed(1)}%), υποδεικνύοντας αξιόπιστη πρόβλεψη.`
                });
            } else if (rangePercent > 40) {
                insights.push({
                    icon: '⚡',
                    text: `<strong>Υψηλή αβεβαιότητα:</strong> Το εύρος πρόβλεψης είναι ευρύ (±${rangePercent.toFixed(1)}%). Χρησιμοποιήστε με προσοχή.`
                });
            }
        }
        
        // Method-specific insights
        if (method === 'seasonal') {
            insights.push({
                icon: '🔄',
                text: '<strong>Εποχικό μοντέλο:</strong> Η πρόβλεψη βασίζεται στο επαναλαμβανόμενο pattern των τελευταίων 12 μηνών.'
            });
        } else if (method === 'holt-winters') {
            insights.push({
                icon: '🧮',
                text: '<strong>Holt-Winters:</strong> Προηγμένο μοντέλο που συνδυάζει τάση και εποχικότητα για ακριβέστερες προβλέψεις.'
            });
        }
        
        // Render insights
        container.innerHTML = insights.map(insight => `
            <div class="insight-item">
                <div class="insight-icon">${insight.icon}</div>
                <div class="insight-content">
                    <p>${insight.text}</p>
                </div>
            </div>
        `).join('');
    }

    /**
     * Show/hide loading indicator
     */
    function showLoadingIndicator(show) {
        const indicator = document.getElementById('forecastLoadingIndicator');
        if (indicator) {
            indicator.style.display = show ? 'flex' : 'none';
        }
    }

    function generateAndDisplayReport() {
        const type = document.getElementById('reportPeriodType').value;
        const includeParakratisi = document.getElementById('reportIncludeParakratisi').checked;
        
        let report;
        
        try {
            if (type === 'annual') {
                const year = parseInt(document.getElementById('reportYear').value);
                
                // VALIDATE year
                if (!year || isNaN(year)) {
                    showToast('Επιλέξτε έτος', 'warning');
                    return;
                }
                
                report = reportsManager.generateAnnualReport(year, { includeParakratisi });
            } 
            // ... rest of conditions
            
            if (report.isEmpty) {
                showToast(report.message, 'warning');
                return;
            }
            
            // Store globally
            window.currentReport = report;
            
            // Display
            displayReport(report);
            
            showToast('Αναφορά δημιουργήθηκε επιτυχώς', 'success');
            
        } catch (error) {
            console.error('Report generation error:', error);
            showToast('Σφάλμα: ' + (error.message || 'Άγνωστο σφάλμα'), 'error');
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
            forecastingManager,
            heatmapManager,
            cloudSyncManager,
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