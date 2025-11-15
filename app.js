/**
 * app.js - Main Application File v5
 * Major Updates: Layout customization, improved UX, default filters
 */

import storage from './storage.js';
import eopyyDeductionsManager from './eopyyClawback.js';
import backupManager, { 
    exportBackup, 
    importBackup, 
    getImportPreview,
    enableAutosave,
    disableAutosave,
    markChangesPending,
    getAutosaveStatus
} from './backup.js';
import pdfExportManager from './pdfExport.js';
import csvValidator from './csvValidator.js';
import { cdnChecker, periodicChecker } from './cdnChecker.js';
import ForecastManager from './forecasting.js';
import PeriodComparison from './comparison.js';
import { HeatmapGenerator, HeatmapDataProcessor } from './charts.js';
import {
    escapeHtml,
    formatCurrency,
    formatMonthYear,
    parseMonthYear,
    formatDateTime,
    generateId,
    STRINGS,
    isValidMonthYear,
    compareDates,
    setupDateAutoFormat
} from './utils.js';

// ========================================
// Configuration
// ========================================
const CONFIG = {
    pageSize: 20,
    pageSizeOptions: [25, 50, 75, 100, 150],
    chartColors: {
        primary: '#2563eb',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#3b82f6'
    }
};

// ========================================
// Global State
// ========================================
const STATE = {
    entries: [],
    sources: ['Ταμείο 1', 'Ταμείο 2'],
    insurances: ['ΕΟΠΥΥ', 'Ιδιωτική'],
    currentView: 'dashboard',
    filters: {},
    currentPage: 1,
    pageSize: CONFIG.pageSize,
    sortField: null,
    sortDirection: 'desc',
    editingEntry: null,
    undoStack: [],
    userLabel: 'Admin',
    charts: {},
    cdnAvailable: true,
    currentKPIs: {},
    changeCounter: 0,
    autosaveThreshold: 5,
    hasUnsavedChanges: false,
    dashboardLayout: null, // For drag-drop
    includeParakratisi: false // DEFAULT: false (χωρίς παρακράτηση)
};

// ========================================
// Toast Notifications
// ========================================
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast toast-compact ${type} show`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ========================================
// Unsaved Changes Warning
// ========================================
window.addEventListener('beforeunload', (e) => {
    if (STATE.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'Έχετε μη αποθηκευμένες αλλαγές. Θέλετε να φύγετε;';
        return e.returnValue;
    }
});

// ========================================
// Auto-load Backup on Startup
// ========================================
async function autoLoadBackup() {
    const lastBackup = localStorage.getItem('lastBackupPath');
    if (!lastBackup) {
        // Prompt user to select backup
        setTimeout(() => {
            if (confirm('Θέλετε να φορτώσετε backup;')) {
                document.getElementById('backupFileInput').click();
            }
        }, 1000);
    }
}

// ========================================
// Data Management
// ========================================
async function loadData() {
    try {
        STATE.entries = await storage.loadEntries();
        STATE.sources = (await storage.loadSetting('sources')) || STATE.sources;
        STATE.insurances = (await storage.loadSetting('insurances')) || STATE.insurances;
        STATE.userLabel = (await storage.loadSetting('userLabel')) || STATE.userLabel;
        STATE.undoStack = await storage.loadUndoActions();
        STATE.dashboardLayout = (await storage.loadSetting('dashboardLayout')) || null;
        
        const savedThreshold = await storage.loadSetting('autosaveThreshold');
        if (savedThreshold) {
            STATE.autosaveThreshold = savedThreshold;
            document.getElementById('autosaveThreshold').value = savedThreshold;
        }
        
        document.getElementById('userLabel').textContent = `Χρήστης: ${STATE.userLabel}`;
        
        await eopyyDeductionsManager.loadDeductions();
        
        console.log(`Loaded ${STATE.entries.length} entries`);
    } catch (error) {
        console.error('Load data error:', error);
        showToast('Σφάλμα φόρτωσης δεδομένων', 'error');
    }
}

async function saveData() {
    try {
        await storage.saveEntries(STATE.entries);
        await storage.saveSetting('sources', STATE.sources);
        await storage.saveSetting('insurances', STATE.insurances);
        
        STATE.changeCounter++;
        STATE.hasUnsavedChanges = true;
        
        if (STATE.changeCounter >= STATE.autosaveThreshold) {
            const autosaveEnabled = localStorage.getItem('autosaveEnabled') === 'true';
            if (autosaveEnabled) {
                await exportBackup();
                showToast('Auto-backup δημιουργήθηκε', 'success');
                STATE.changeCounter = 0;
                STATE.hasUnsavedChanges = false;
            }
        }
        
        markChangesPending();
    } catch (error) {
        if (error.message === 'QUOTA_EXCEEDED') {
            showToast(STRINGS.errors.quotaExceeded, 'error');
        } else {
            console.error('Save data error:', error);
            showToast('Σφάλμα αποθήκευσης', 'error');
        }
    }
}

async function addEntry(entry) {
    const duplicate = STATE.entries.find(e => 
        e.date === entry.date && 
        e.source === entry.source &&
        e.id !== entry.id
    );
    
    if (duplicate) {
        showToast(STRINGS.errors.duplicateEntry, 'error');
        return false;
    }

    entry.originalAmount = entry.amount;

    if (!entry.id) {
        entry.id = generateId();
        entry.createdAt = Date.now();
        entry.createdBy = STATE.userLabel;
    }
    
    entry.updatedAt = Date.now();
    entry.updatedBy = STATE.userLabel;

    const existingIndex = STATE.entries.findIndex(e => e.id === entry.id);
    
    if (existingIndex >= 0) {
        await storage.saveUndoAction({
            id: generateId(),
            type: 'update',
            timestamp: Date.now(),
            data: { ...STATE.entries[existingIndex] }
        });
        
        STATE.entries[existingIndex] = entry;
    } else {
        STATE.entries.push(entry);
        
        await storage.saveUndoAction({
            id: generateId(),
            type: 'insert',
            timestamp: Date.now(),
            data: { ...entry }
        });
    }

    const isEopyy = eopyyDeductionsManager.isEopyyEntry(entry);
    
    if (isEopyy && entry.deductions) {
        // Calculate and save percentages
        const originalAmount = entry.amount;
        entry.deductionsPercent = {
            parakratisiPercent: (entry.deductions.parakratisi / originalAmount) * 100,
            mdePercent: (entry.deductions.mde / originalAmount) * 100,
            rebatePercent: (entry.deductions.rebate / originalAmount) * 100,
            krathseisPercent: (entry.deductions.krathseis / originalAmount) * 100,
            clawbackPercent: (entry.deductions.clawback / originalAmount) * 100
        };
        
        await eopyyDeductionsManager.applyDeductions(
            entry.id,
            entry.deductions,
            entry.notes || ''
        );
    } else if (!isEopyy && entry.krathseis) {
        entry.krathseisPercent = (entry.krathseis / entry.amount) * 100;
    }

    await saveData();
    return true;
}

async function deleteEntry(id) {
    const index = STATE.entries.findIndex(e => e.id === id);
    if (index >= 0) {
        await storage.saveUndoAction({
            id: generateId(),
            type: 'delete',
            timestamp: Date.now(),
            data: { ...STATE.entries[index] }
        });
        
        await eopyyDeductionsManager.removeDeductions(id);
        
        STATE.entries.splice(index, 1);
        await saveData();
        return true;
    }
    return false;
}

// ========================================
// Dashboard Rendering
// ========================================
function renderDashboard() {
    const period = document.getElementById('dashPeriod').value;
    const includeParakratisi = document.getElementById('dashIncludeParakratisi').checked;
    STATE.includeParakratisi = includeParakratisi;
    
    const filtered = filterEntriesByPeriod(STATE.entries, period);

    const kpis = eopyyDeductionsManager.calculateKPIs(filtered, { includeParakratisi });
    STATE.currentKPIs = kpis;

    // Calculate percentages
    const total = kpis.total;
    
    document.getElementById('kpiTotal').textContent = formatCurrency(kpis.total);
    document.getElementById('kpiTotalPercent').textContent = '100%';
    
    document.getElementById('kpiEopyy').textContent = formatCurrency(kpis.eopyyTotal);
    document.getElementById('kpiEopyyPercent').textContent = total > 0 ? ((kpis.eopyyTotal / total) * 100).toFixed(2) + '%' : '0%';
    
    document.getElementById('kpiOthers').textContent = formatCurrency(kpis.nonEopyyTotal);
    document.getElementById('kpiOthersPercent').textContent = total > 0 ? ((kpis.nonEopyyTotal / total) * 100).toFixed(2) + '%' : '0%';
    
    document.getElementById('kpiDeductions').textContent = formatCurrency(kpis.eopyyTotalDeductions + kpis.nonEopyyKrathseis);
    document.getElementById('kpiDeductionsPercent').textContent = kpis.eopyyOriginal > 0 ? (((kpis.eopyyTotalDeductions + kpis.nonEopyyKrathseis) / (kpis.eopyyOriginal + kpis.nonEopyyOriginal)) * 100).toFixed(2) + '%' : '0%';

    document.getElementById('kpiParakratisi').textContent = formatCurrency(kpis.eopyyParakratisi);
    document.getElementById('kpiParakratisiPercent').textContent = kpis.eopyyOriginal > 0 ? ((kpis.eopyyParakratisi / kpis.eopyyOriginal) * 100).toFixed(2) + '%' : '0%';
    
    document.getElementById('kpiMDE').textContent = formatCurrency(kpis.eopyyMDE);
    document.getElementById('kpiMDEPercent').textContent = kpis.eopyyOriginal > 0 ? ((kpis.eopyyMDE / kpis.eopyyOriginal) * 100).toFixed(2) + '%' : '0%';
    
    document.getElementById('kpiRebate').textContent = formatCurrency(kpis.eopyyRebate);
    document.getElementById('kpiRebatePercent').textContent = kpis.eopyyOriginal > 0 ? ((kpis.eopyyRebate / kpis.eopyyOriginal) * 100).toFixed(2) + '%' : '0%';
    
    document.getElementById('kpiKrathseis').textContent = formatCurrency(kpis.eopyyKrathseis);
    document.getElementById('kpiKrathseisPercent').textContent = kpis.eopyyOriginal > 0 ? ((kpis.eopyyKrathseis / kpis.eopyyOriginal) * 100).toFixed(2) + '%' : '0%';
    
    document.getElementById('kpiClawback').textContent = formatCurrency(kpis.eopyyClawback);
    document.getElementById('kpiClawbackPercent').textContent = kpis.eopyyOriginal > 0 ? ((kpis.eopyyClawback / kpis.eopyyOriginal) * 100).toFixed(2) + '%' : '0%';

    renderRecentEntries();
    renderCharts(filtered);
}

function renderRecentEntries() {
    const tbody = document.getElementById('recentEntriesBody');
    const recent = STATE.entries.slice(-10).reverse();

    if (recent.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Δεν υπάρχουν εγγραφές</td></tr>';
        return;
    }

    tbody.innerHTML = recent.map(entry => {
        const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);
        const displayAmount = STATE.includeParakratisi ? amounts.finalAmountNoParakratisi : amounts.finalAmount;
        
        return `
            <tr>
                <td>${escapeHtml(entry.date)}</td>
                <td>${escapeHtml(entry.source)}</td>
                <td>${escapeHtml(entry.insurance)}</td>
                <td>${entry.type === 'cash' ? 'Μετρητά' : 'Τιμολόγια'}</td>
                <td class="text-right">${formatCurrency(displayAmount)}</td>
            </tr>
        `;
    }).join('');
}

// Continued in next artifact due to length...
/**
 * app.js Part 2 - Event Handlers & Module Integrations
 * Includes: Charts, Reports, Comparison, Forecasting, Heatmaps, Cloud
 */

// ========================================
// Charts Rendering (with filters)
// ========================================
function renderCharts(entries) {
    if (!STATE.cdnAvailable || !window.Chart) {
        console.warn('Charts disabled - CDN unavailable');
        return;
    }

    // Apply chart filters
    const typeSource = document.getElementById('typeChartSource')?.value;
    const typePeriod = document.getElementById('typeChartPeriod')?.value;
    const typeParakratisi = document.getElementById('typeChartParakratisi')?.checked;
    
    let filteredEntries = [...entries];
    if (typeSource) {
        filteredEntries = filteredEntries.filter(e => e.source === typeSource);
    }
    if (typePeriod && typePeriod !== 'all') {
        filteredEntries = filterEntriesByPeriod(filteredEntries, typePeriod);
    }

    const eopyyTotal = filteredEntries.filter(e => eopyyDeductionsManager.isEopyyEntry(e))
        .reduce((sum, e) => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return sum + (typeParakratisi ? amounts.finalAmountNoParakratisi : amounts.finalAmount);
        }, 0);
    
    const othersTotal = filteredEntries.filter(e => !eopyyDeductionsManager.isEopyyEntry(e))
        .reduce((sum, e) => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return sum + amounts.finalAmount;
        }, 0);

    // Type Chart (Pie)
    const typeCtx = document.getElementById('typeChart');
    if (typeCtx) {
        if (STATE.charts.typeChart) STATE.charts.typeChart.destroy();
        STATE.charts.typeChart = new Chart(typeCtx, {
            type: 'pie',
            data: {
                labels: ['ΕΟΠΥΥ', 'Άλλα Ταμεία'],
                datasets: [{
                    data: [eopyyTotal, othersTotal],
                    backgroundColor: [CONFIG.chartColors.primary, CONFIG.chartColors.success]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.label}: ${formatCurrency(context.parsed)}`
                        }
                    }
                }
            }
        });
    }

    // Monthly Chart with trend line and toggle
    const monthlySource = document.getElementById('monthlyChartSource')?.value;
    const showTrend = document.getElementById('monthlyShowTrend')?.checked;
    const toggleData = document.getElementById('monthlyToggleData')?.checked;
    
    let monthlyFiltered = [...filteredEntries];
    if (monthlySource) {
        monthlyFiltered = monthlyFiltered.filter(e => e.source === monthlySource);
    }

    const monthlyData = {};
    const cashData = {};
    const invoiceData = {};
    
    monthlyFiltered.forEach(entry => {
        if (!monthlyData[entry.date]) {
            monthlyData[entry.date] = 0;
            cashData[entry.date] = 0;
            invoiceData[entry.date] = 0;
        }
        const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);
        const amount = STATE.includeParakratisi ? amounts.finalAmountNoParakratisi : amounts.finalAmount;
        
        monthlyData[entry.date] += amount;
        if (entry.type === 'cash') {
            cashData[entry.date] += amount;
        } else {
            invoiceData[entry.date] += amount;
        }
    });

    const sortedMonths = Object.keys(monthlyData).sort((a, b) => compareDates(a, b));
    const monthlyValues = sortedMonths.map(m => monthlyData[m]);
    const cashValues = sortedMonths.map(m => cashData[m]);
    const invoiceValues = sortedMonths.map(m => invoiceData[m]);

    // Calculate trend line
    let trendData = null;
    if (showTrend && monthlyValues.length > 1) {
        const n = monthlyValues.length;
        const xValues = Array.from({length: n}, (_, i) => i);
        const yValues = monthlyValues;
        
        const xMean = xValues.reduce((a, b) => a + b, 0) / n;
        const yMean = yValues.reduce((a, b) => a + b, 0) / n;
        
        let numerator = 0;
        let denominator = 0;
        for (let i = 0; i < n; i++) {
            numerator += (xValues[i] - xMean) * (yValues[i] - yMean);
            denominator += Math.pow(xValues[i] - xMean, 2);
        }
        
        const slope = denominator !== 0 ? numerator / denominator : 0;
        const intercept = yMean - slope * xMean;
        
        trendData = xValues.map(x => slope * x + intercept);
    }

    const monthlyCtx = document.getElementById('monthlyChart');
    if (monthlyCtx) {
        if (STATE.charts.monthlyChart) STATE.charts.monthlyChart.destroy();
        
        const datasets = [];
        
        if (toggleData) {
            datasets.push({
                label: 'Μετρητά',
                data: cashValues,
                borderColor: CONFIG.chartColors.success,
                backgroundColor: CONFIG.chartColors.success + '20',
                fill: false,
                tension: 0.4
            });
            datasets.push({
                label: 'Τιμολόγια',
                data: invoiceValues,
                borderColor: CONFIG.chartColors.warning,
                backgroundColor: CONFIG.chartColors.warning + '20',
                fill: false,
                tension: 0.4
            });
        } else {
            datasets.push({
                label: 'Έσοδα',
                data: monthlyValues,
                borderColor: CONFIG.chartColors.primary,
                backgroundColor: CONFIG.chartColors.primary + '20',
                fill: true,
                tension: 0.4
            });
        }
        
        if (showTrend && trendData) {
            datasets.push({
                label: 'Τάση',
                data: trendData,
                borderColor: CONFIG.chartColors.danger,
                borderDash: [5, 5],
                borderWidth: 2,
                fill: false,
                pointRadius: 0
            });
        }

        STATE.charts.monthlyChart = new Chart(monthlyCtx, {
            type: 'line',
            data: {
                labels: sortedMonths,
                datasets: datasets
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: value => formatCurrency(value)
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`
                        }
                    }
                }
            }
        });
    }
}

// ========================================
// Entries Table with Sorting
// ========================================
function renderEntriesTable() {
    const tbody = document.getElementById('entriesTableBody');
    const filtered = applyFilters();
    
    // Apply sorting
    if (STATE.sortField) {
        filtered.sort((a, b) => {
            let aVal, bVal;
            
            switch(STATE.sortField) {
                case 'date':
                    return STATE.sortDirection === 'asc' 
                        ? compareDates(a.date, b.date)
                        : compareDates(b.date, a.date);
                case 'amount':
                    aVal = parseFloat(a.amount) || 0;
                    bVal = parseFloat(b.amount) || 0;
                    break;
                case 'finalAmount':
                    const amountsA = eopyyDeductionsManager.getAmountsBreakdown(a);
                    const amountsB = eopyyDeductionsManager.getAmountsBreakdown(b);
                    aVal = amountsA.finalAmount;
                    bVal = amountsB.finalAmount;
                    break;
                default:
                    aVal = a[STATE.sortField];
                    bVal = b[STATE.sortField];
            }
            
            if (STATE.sortDirection === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });
    }
    
    const totalPages = Math.ceil(filtered.length / STATE.pageSize);
    const start = (STATE.currentPage - 1) * STATE.pageSize;
    const end = start + STATE.pageSize;
    const pageEntries = filtered.slice(start, end);

    if (pageEntries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="13" class="text-center">Δεν υπάρχουν εγγραφές</td></tr>';
        renderPagination(0, 0);
        return;
    }

    tbody.innerHTML = pageEntries.map(entry => {
        const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);
        const isEopyy = eopyyDeductionsManager.isEopyyEntry(entry);
        
        return `
            <tr>
                <td>${escapeHtml(entry.date)}</td>
                <td>${escapeHtml(entry.source)}</td>
                <td>${escapeHtml(entry.insurance)}</td>
                <td>${entry.type === 'cash' ? 'Μετρητά' : 'Τιμολόγια'}</td>
                <td class="text-right">${formatCurrency(amounts.originalAmount)}</td>
                <td class="text-right">${isEopyy ? formatCurrency(amounts.parakratisi) : '-'}</td>
                <td class="text-right">${isEopyy ? formatCurrency(amounts.mde) : '-'}</td>
                <td class="text-right">${isEopyy ? formatCurrency(amounts.rebate) : '-'}</td>
                <td class="text-right">${formatCurrency(amounts.krathseis)}</td>
                <td class="text-right">${isEopyy ? formatCurrency(amounts.clawback) : '-'}</td>
                <td class="text-right"><strong>${formatCurrency(amounts.finalAmount)}</strong></td>
                <td>${entry.notes ? escapeHtml(entry.notes.substring(0, 20)) + '...' : '-'}</td>
                <td>
                    <button class="btn-secondary btn-compact btn-sm" onclick="window.editEntry('${entry.id}')">✏️</button>
                    <button class="btn-danger btn-compact btn-sm" onclick="window.confirmDelete('${entry.id}')">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');

    renderPagination(filtered.length, totalPages);
}

// ========================================
// Table Sorting Handler
// ========================================
function setupTableSorting() {
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const field = header.getAttribute('data-sort');
            
            if (STATE.sortField === field) {
                STATE.sortDirection = STATE.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                STATE.sortField = field;
                STATE.sortDirection = 'asc';
            }
            
            // Update UI
            document.querySelectorAll('.sortable').forEach(h => {
                h.classList.remove('sort-asc', 'sort-desc');
            });
            header.classList.add(`sort-${STATE.sortDirection}`);
            
            renderEntriesTable();
        });
    });
}

// ========================================
// Page Size Change Handler
// ========================================
function setupPageSizeSelector() {
    const select = document.getElementById('pageSizeSelect');
    if (select) {
        select.value = STATE.pageSize;
        select.addEventListener('change', (e) => {
            STATE.pageSize = parseInt(e.target.value);
            STATE.currentPage = 1;
            renderEntriesTable();
        });
    }
}

// ========================================
// Drag & Drop for Dashboard Layout
// ========================================
function setupDashboardDragDrop() {
    const dashboard = document.getElementById('dashboardView');
    if (!dashboard || typeof Sortable === 'undefined') return;
    
    new Sortable(dashboard, {
        animation: 150,
        handle: '.block-drag-handle',
        draggable: '.draggable-block',
        ghostClass: 'dragging',
        onEnd: async () => {
            const blocks = [...dashboard.querySelectorAll('.draggable-block')];
            const layout = blocks.map(block => block.getAttribute('data-block'));
            STATE.dashboardLayout = layout;
            await storage.saveSetting('dashboardLayout', layout);
            showToast('Layout αποθηκεύτηκε', 'success');
        }
    });
}

// ========================================
// Drag & Drop for KPI Cards
// ========================================
function setupKPIDragDrop() {
    const kpiGrid = document.querySelector('.kpi-grid');
    if (!kpiGrid || typeof Sortable === 'undefined') return;
    
    new Sortable(kpiGrid, {
        animation: 150,
        handle: '.kpi-handle',
        draggable: '.draggable-kpi',
        ghostClass: 'dragging',
        onEnd: async () => {
            const kpis = [...kpiGrid.querySelectorAll('.draggable-kpi')];
            const layout = kpis.map(kpi => kpi.getAttribute('data-kpi'));
            await storage.saveSetting('kpiLayout', layout);
        }
    });
}

// ========================================
// Modal Draggable & Resizable
// ========================================
function setupModalDragResize() {
    document.querySelectorAll('.modal-draggable').forEach(modal => {
        const content = modal.querySelector('.modal-content');
        const handle = modal.querySelector('.modal-drag-handle');
        
        if (!content || !handle) return;
        
        let isDragging = false;
        let currentX, currentY, initialX, initialY;
        
        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            initialX = e.clientX - content.offsetLeft;
            initialY = e.clientY - content.offsetTop;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            content.style.position = 'absolute';
            content.style.left = currentX + 'px';
            content.style.top = currentY + 'px';
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    });
}

// ========================================
// Reports Generation
// ========================================
async function generateReport() {
    const type = document.getElementById('reportType').value;
    const dateFrom = document.getElementById('reportDateFrom').value;
    const dateTo = document.getElementById('reportDateTo').value;
    
    if (!dateFrom || !dateTo) {
        showToast('Παρακαλώ εισάγετε περίοδο', 'warning');
        return;
    }
    
    const filtered = STATE.entries.filter(e => {
        return compareDates(e.date, dateFrom) >= 0 && compareDates(e.date, dateTo) <= 0;
    });
    
    const kpis = eopyyDeductionsManager.calculateKPIs(filtered, { includeParakratisi: false });
    
    let reportHTML = `<h4>Αναφορά ${type === 'annual' ? 'Ετήσια' : type === 'quarterly' ? 'Τριμηνιαία' : 'Μηνιαία'}</h4>`;
    reportHTML += `<p><strong>Περίοδος:</strong> ${dateFrom} - ${dateTo}</p>`;
    reportHTML += `<p><strong>Συνολικά Έσοδα:</strong> ${formatCurrency(kpis.total)}</p>`;
    reportHTML += `<p><strong>ΕΟΠΥΥ:</strong> ${formatCurrency(kpis.eopyyTotal)}</p>`;
    reportHTML += `<p><strong>Άλλα Ταμεία:</strong> ${formatCurrency(kpis.nonEopyyTotal)}</p>`;
    reportHTML += `<p><strong>Κρατήσεις:</strong> ${formatCurrency(kpis.eopyyTotalDeductions + kpis.nonEopyyKrathseis)}</p>`;
    
    document.getElementById('reportContent').innerHTML = reportHTML;
    document.getElementById('reportOutput').style.display = 'block';
}

// ========================================
// Comparison Generation
// ========================================
async function generateComparison() {
    const p1From = document.getElementById('period1From').value;
    const p1To = document.getElementById('period1To').value;
    const p2From = document.getElementById('period2From').value;
    const p2To = document.getElementById('period2To').value;
    
    if (!p1From || !p1To || !p2From || !p2To) {
        showToast('Παρακαλώ συμπληρώστε όλες τις περιόδους', 'warning');
        return;
    }
    
    const comparison = new PeriodComparison(STATE.entries);
    const result = comparison.comparePeriods(
        { start: p1From, end: p1To, label: `Περίοδος 1` },
        { start: p2From, end: p2To, label: `Περίοδος 2` }
    );
    
    // Render comparison chart
    const ctx = document.getElementById('comparisonChart');
    if (STATE.charts.comparisonChart) STATE.charts.comparisonChart.destroy();
    
    STATE.charts.comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Συνολικά', 'Μετρητά', 'Τιμολόγια', 'Κρατήσεις'],
            datasets: [
                {
                    label: result.period1.label,
                    data: [
                        result.period1.kpis.total,
                        result.period1.kpis.cash,
                        result.period1.kpis.invoices,
                        result.period1.kpis.retentions
                    ],
                    backgroundColor: CONFIG.chartColors.primary
                },
                {
                    label: result.period2.label,
                    data: [
                        result.period2.kpis.total,
                        result.period2.kpis.cash,
                        result.period2.kpis.invoices,
                        result.period2.kpis.retentions
                    ],
                    backgroundColor: CONFIG.chartColors.success
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: v => formatCurrency(v) }
                }
            }
        }
    });
    
    // Render comparison table
    const tableData = comparison.generateComparisonTable(result);
    const tbody = document.getElementById('comparisonTableBody');
    tbody.innerHTML = tableData.map(row => `
        <tr>
            <td>${row.metric}</td>
            <td>${row.period1}</td>
            <td>${row.period2}</td>
            <td>${row.change}</td>
            <td>${row.changePercent}</td>
            <td class="trend-${row.trend}">${row.trend === 'up' ? '↑' : row.trend === 'down' ? '↓' : '→'}</td>
        </tr>
    `).join('');
    
    // Render summary
    document.getElementById('comparisonSummary').textContent = comparison.generateSummary(result);
    
    document.getElementById('comparisonResults').style.display = 'block';
}

// ========================================
// Forecasting Generation
// ========================================
async function generateForecast() {
    const method = document.getElementById('forecastMethod').value;
    const periods = parseInt(document.getElementById('forecastPeriods').value);
    const historyFrom = document.getElementById('forecastHistoryFrom').value;
    
    const manager = new ForecastManager(STATE.entries);
    const result = manager.generateForecast(method, periods, { startDate: historyFrom });
    
    // Render forecast chart
    const ctx = document.getElementById('forecastChart');
    if (STATE.charts.forecastChart) STATE.charts.forecastChart.destroy();
    
    const historicalDates = result.historical.map(d => d.date);
    const historicalValues = result.historical.map(d => d.value);
    const predictionDates = result.predictions.map(p => p.date);
    const predictionValues = result.predictions.map(p => p.value);
    const upperBound = result.predictions.map(p => p.upper);
    const lowerBound = result.predictions.map(p => p.lower);
    
    STATE.charts.forecastChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [...historicalDates, ...predictionDates],
            datasets: [
                {
                    label: 'Ιστορικά',
                    data: [...historicalValues, ...Array(periods).fill(null)],
                    borderColor: CONFIG.chartColors.primary,
                    pointRadius: 3
                },
                {
                    label: 'Πρόβλεψη',
                    data: [...Array(historicalDates.length).fill(null), ...predictionValues],
                    borderColor: CONFIG.chartColors.danger,
                    borderDash: [5, 5],
                    pointRadius: 3
                },
                {
                    label: 'Άνω Όριο',
                    data: [...Array(historicalDates.length).fill(null), ...upperBound],
                    borderColor: CONFIG.chartColors.danger + '40',
                    borderDash: [2, 2],
                    pointRadius: 0,
                    fill: '+1'
                },
                {
                    label: 'Κάτω Όριο',
                    data: [...Array(historicalDates.length).fill(null), ...lowerBound],
                    borderColor: CONFIG.chartColors.danger + '40',
                    borderDash: [2, 2],
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true, ticks: { callback: v => formatCurrency(v) } }
            }
        }
    });
    
    document.getElementById('forecastSummary').textContent = result.summary;
    document.getElementById('methodologyText').innerHTML = `<h4>Μέθοδος: ${method}</h4><p>Confidence Intervals: 95%</p>`;
    document.getElementById('forecastResults').style.display = 'block';
}

// ========================================
// Heatmap Generation
// ========================================
async function generateHeatmap() {
    const type = document.getElementById('heatmapType').value;
    const year = parseInt(document.getElementById('heatmapYear').value);
    const colorScheme = document.getElementById('heatmapColorScheme').value;
    
    const processor = new HeatmapDataProcessor(STATE.entries);
    let data;
    
    switch(type) {
        case 'month-year':
            data = processor.generateMonthYearHeatmap();
            break;
        case 'source-month':
            data = processor.generateSourceMonthHeatmap(year);
            break;
        case 'insurance-month':
            data = processor.generateInsuranceMonthHeatmap(year);
            break;
    }
    
    const heatmap = new HeatmapGenerator('heatmapCanvas', {
        colorScheme: colorScheme,
        title: `Heatmap: ${type}`
    });
    
    heatmap.draw(data);
    document.getElementById('exportHeatmapPdfBtn').style.display = 'inline-block';
}

// Continue to Part 3...
/**
 * app.js Part 3 - Cloud Integration, Bug Fixes & Complete Event Listeners
 */

import cloudManager from './cloudAdapters.js';

// ========================================
// Cloud Integration
// ========================================
async function setupCloudProviders() {
    const providers = ['googledrive', 'dropbox', 'onedrive'];
    
    providers.forEach(provider => {
        const providerName = provider.replace('drive', 'Drive').replace('box', 'box').replace('drive', 'Drive');
        
        // Connect button
        document.getElementById(`${provider}Connect`)?.addEventListener('click', async () => {
            try {
                await cloudManager.connect(provider);
                showToast(`Συνδέθηκε με ${providerName}`, 'success');
                updateCloudStatus(provider);
            } catch (error) {
                showToast(`Σφάλμα σύνδεσης: ${error.message}`, 'error');
            }
        });
        
        // Disconnect button
        document.getElementById(`${provider}Disconnect`)?.addEventListener('click', async () => {
            await cloudManager.disconnect(provider);
            showToast(`Αποσυνδέθηκε από ${providerName}`, 'info');
            updateCloudStatus(provider);
        });
        
        // Upload button
        document.getElementById(`${provider}Upload`)?.addEventListener('click', async () => {
            try {
                await cloudManager.uploadBackup(provider);
                showToast('Backup ανέβηκε επιτυχώς', 'success');
                await loadCloudFiles(provider);
            } catch (error) {
                showToast(`Σφάλμα upload: ${error.message}`, 'error');
            }
        });
    });
    
    // Initial status check
    updateAllCloudStatus();
}

async function updateCloudStatus(provider) {
    const status = cloudManager.getConnectionStatus();
    const isConnected = status[provider];
    
    const statusEl = document.getElementById(`${provider}Status`);
    const connectBtn = document.getElementById(`${provider}Connect`);
    const disconnectBtn = document.getElementById(`${provider}Disconnect`);
    const uploadBtn = document.getElementById(`${provider}Upload`);
    const filesDiv = document.getElementById(`${provider}Files`);
    
    if (statusEl) {
        statusEl.textContent = isConnected ? 'Συνδεδεμένο' : 'Αποσυνδεδεμένο';
        statusEl.className = 'cloud-status' + (isConnected ? ' connected' : '');
    }
    
    if (connectBtn) connectBtn.style.display = isConnected ? 'none' : 'inline-block';
    if (disconnectBtn) disconnectBtn.style.display = isConnected ? 'inline-block' : 'none';
    if (uploadBtn) uploadBtn.style.display = isConnected ? 'inline-block' : 'none';
    if (filesDiv) filesDiv.style.display = isConnected ? 'block' : 'none';
    
    if (isConnected) {
        await loadCloudFiles(provider);
    }
}

async function updateAllCloudStatus() {
    const providers = ['googledrive', 'dropbox', 'onedrive'];
    for (const provider of providers) {
        await updateCloudStatus(provider);
    }
}

async function loadCloudFiles(provider) {
    try {
        const files = await cloudManager.listBackups(provider);
        const listEl = document.getElementById(`${provider}FilesList`);
        
        if (!listEl) return;
        
        if (files.length === 0) {
            listEl.innerHTML = '<p>Δεν υπάρχουν αρχεία</p>';
            return;
        }
        
        listEl.innerHTML = files.map(file => `
            <div class="cloud-file-item">
                <span>${escapeHtml(file.name)}</span>
                <button class="btn-secondary btn-compact btn-sm" onclick="window.downloadCloudBackup('${provider}', '${file.id}')">📥</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Load cloud files error:', error);
    }
}

window.downloadCloudBackup = async function(provider, fileId) {
    try {
        showToast('Λήψη backup...', 'info');
        const data = await cloudManager.downloadBackup(provider, fileId);
        
        // Import the backup
        const report = await importBackup(new File([JSON.stringify(data)], 'backup.json'), 'merge');
        
        if (report.success) {
            showToast('Backup φορτώθηκε επιτυχώς', 'success');
            await loadData();
            renderDashboard();
            renderEntriesTable();
        } else {
            showToast('Σφάλμα κατά τη φόρτωση', 'error');
        }
    } catch (error) {
        showToast(`Σφάλμα: ${error.message}`, 'error');
    }
};

// ========================================
// Edit Entry with Percentages (BUG FIX)
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
    
    // Clear all deduction fields first (BUG FIX)
    ['entryParakratisi', 'entryParakratisiPercent', 'entryMDE', 'entryMDEPercent',
     'entryRebate', 'entryRebatePercent', 'entryKrathseisEopyy', 'entryKrathseisEopyyPercent',
     'entryClawback', 'entryClawbackPercent', 'entryKrathseisOther', 'entryKrathseisOtherPercent'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    if (isEopyy && deduction) {
        // Load SAVED percentages (BUG FIX)
        const originalAmount = entry.originalAmount || entry.amount;
        
        document.getElementById('entryParakratisi').value = deduction.deductions.parakratisi || '';
        document.getElementById('entryParakratisiPercent').value = entry.deductionsPercent?.parakratisiPercent?.toFixed(2) || 
            (deduction.deductions.parakratisi ? ((deduction.deductions.parakratisi / originalAmount) * 100).toFixed(2) : '');
        
        document.getElementById('entryMDE').value = deduction.deductions.mde || '';
        document.getElementById('entryMDEPercent').value = entry.deductionsPercent?.mdePercent?.toFixed(2) || 
            (deduction.deductions.mde ? ((deduction.deductions.mde / originalAmount) * 100).toFixed(2) : '');
        
        document.getElementById('entryRebate').value = deduction.deductions.rebate || '';
        document.getElementById('entryRebatePercent').value = entry.deductionsPercent?.rebatePercent?.toFixed(2) || 
            (deduction.deductions.rebate ? ((deduction.deductions.rebate / originalAmount) * 100).toFixed(2) : '');
        
        document.getElementById('entryKrathseisEopyy').value = deduction.deductions.krathseis || '';
        document.getElementById('entryKrathseisEopyyPercent').value = entry.deductionsPercent?.krathseisPercent?.toFixed(2) || 
            (deduction.deductions.krathseis ? ((deduction.deductions.krathseis / originalAmount) * 100).toFixed(2) : '');
        
        document.getElementById('entryClawback').value = deduction.deductions.clawback || '';
        document.getElementById('entryClawbackPercent').value = entry.deductionsPercent?.clawbackPercent?.toFixed(2) || 
            (deduction.deductions.clawback ? ((deduction.deductions.clawback / originalAmount) * 100).toFixed(2) : '');
            
        // Clawback period
        if (document.getElementById('entryClawbackPeriod')) {
            document.getElementById('entryClawbackPeriod').value = entry.clawbackPeriod || 'monthly';
        }
    } else if (!isEopyy && entry.krathseis) {
        document.getElementById('entryKrathseisOther').value = entry.krathseis || '';
        document.getElementById('entryKrathseisOtherPercent').value = entry.krathseisPercent?.toFixed(2) || 
            (entry.krathseis ? ((entry.krathseis / (entry.originalAmount || entry.amount)) * 100).toFixed(2) : '');
    }

    showModalDeductionFields();
    calculateFinalAmount('entry');
    document.getElementById('entryModal').classList.add('active');
};

// ========================================
// Form Handlers (Enhanced)
// ========================================
function showDeductionFields() {
    const insurance = document.getElementById('quickInsurance').value;
    const type = document.getElementById('quickType').value;
    const isEopyy = insurance.toUpperCase().includes('ΕΟΠΥΥ');
    const isInvoice = type === 'invoice';
    
    document.getElementById('quickEopyyDeductions').style.display = (isEopyy && isInvoice) ? 'block' : 'none';
    document.getElementById('quickNonEopyyDeductions').style.display = (!isEopyy && isInvoice) ? 'block' : 'none';
    
    calculateFinalAmount('quick');
}

function showModalDeductionFields() {
    const insurance = document.getElementById('entryInsurance').value;
    const type = document.getElementById('entryType').value;
    const isEopyy = insurance.toUpperCase().includes('ΕΟΠΥΥ');
    const isInvoice = type === 'invoice';
    
    document.getElementById('modalEopyyDeductions').style.display = (isEopyy && isInvoice) ? 'block' : 'none';
    document.getElementById('modalNonEopyyDeductions').style.display = (!isEopyy && isInvoice) ? 'block' : 'none';
    
    calculateFinalAmount('entry');
}

function calculateFinalAmount(prefix) {
    const amountEl = document.getElementById(`${prefix}Amount`);
    const insuranceEl = document.getElementById(`${prefix}Insurance`);
    
    if (!amountEl || !insuranceEl) return;
    
    const amount = parseFloat(amountEl.value) || 0;
    const insurance = insuranceEl.value;
    const isEopyy = insurance.toUpperCase().includes('ΕΟΠΥΥ');
    
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

function setupPercentageSync(amountId, percentId, baseAmountGetter) {
    const amountInput = document.getElementById(amountId);
    const percentInput = document.getElementById(percentId);
    
    if (!amountInput || !percentInput) return;
    
    amountInput.addEventListener('input', () => {
        const baseAmount = baseAmountGetter();
        const amount = parseFloat(amountInput.value) || 0;
        if (baseAmount > 0) {
            percentInput.value = ((amount / baseAmount) * 100).toFixed(2);
        }
        const prefix = amountId.startsWith('quick') ? 'quick' : 'entry';
        calculateFinalAmount(prefix);
    });
    
    percentInput.addEventListener('input', () => {
        const baseAmount = baseAmountGetter();
        const percent = parseFloat(percentInput.value) || 0;
        amountInput.value = ((baseAmount * percent) / 100).toFixed(2);
        const prefix = amountId.startsWith('quick') ? 'quick' : 'entry';
        calculateFinalAmount(prefix);
    });
}

// ========================================
// Helper Functions
// ========================================
function filterEntriesByPeriod(entries, period) {
    const now = new Date();
    let filtered = [...entries];

    if (period === 'month') {
        const thisMonth = formatMonthYear(now.getMonth() + 1, now.getFullYear());
        filtered = filtered.filter(e => e.date === thisMonth);
    } else if (period === 'year') {
        const thisYear = now.getFullYear();
        filtered = filtered.filter(e => e.date.endsWith(`/${thisYear}`));
    }

    return filtered;
}

function applyFilters() {
    let filtered = [...STATE.entries];

    if (STATE.filters.dateFrom) {
        filtered = filtered.filter(e => compareDates(e.date, STATE.filters.dateFrom) >= 0);
    }
    if (STATE.filters.dateTo) {
        filtered = filtered.filter(e => compareDates(e.date, STATE.filters.dateTo) <= 0);
    }
    if (STATE.filters.source) {
        filtered = filtered.filter(e => e.source === STATE.filters.source);
    }
    if (STATE.filters.insurance) {
        filtered = filtered.filter(e => e.insurance === STATE.filters.insurance);
    }
    if (STATE.filters.type) {
        filtered = filtered.filter(e => e.type === STATE.filters.type);
    }
    if (STATE.filters.amountFrom) {
        filtered = filtered.filter(e => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return amounts.originalAmount >= parseFloat(STATE.filters.amountFrom);
        });
    }
    if (STATE.filters.amountTo) {
        filtered = filtered.filter(e => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return amounts.originalAmount <= parseFloat(STATE.filters.amountTo);
        });
    }
    if (STATE.filters.deductionPercentFrom) {
        filtered = filtered.filter(e => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            const percent = amounts.originalAmount > 0 ? (amounts.totalDeductions / amounts.originalAmount) * 100 : 0;
            return percent >= parseFloat(STATE.filters.deductionPercentFrom);
        });
    }
    if (STATE.filters.deductionPercentTo) {
        filtered = filtered.filter(e => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            const percent = amounts.originalAmount > 0 ? (amounts.totalDeductions / amounts.originalAmount) * 100 : 0;
            return percent <= parseFloat(STATE.filters.deductionPercentTo);
        });
    }

    filtered.sort((a, b) => compareDates(b.date, a.date));

    return filtered;
}

function renderPagination(totalItems, totalPages) {
    const pagination = document.getElementById('pagination');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = `
        <button onclick="window.changePage(1)" ${STATE.currentPage === 1 ? 'disabled' : ''}>«</button>
        <button onclick="window.changePage(${STATE.currentPage - 1})" ${STATE.currentPage === 1 ? 'disabled' : ''}>‹</button>
    `;

    const maxButtons = 5;
    let startPage = Math.max(1, STATE.currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);

    if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button onclick="window.changePage(${i})" class="${i === STATE.currentPage ? 'active' : ''}">${i}</button>`;
    }

    html += `
        <button onclick="window.changePage(${STATE.currentPage + 1})" ${STATE.currentPage === totalPages ? 'disabled' : ''}>›</button>
        <button onclick="window.changePage(${totalPages})" ${STATE.currentPage === totalPages ? 'disabled' : ''}>»</button>
    `;

    pagination.innerHTML = html;
}

window.changePage = function(page) {
    STATE.currentPage = page;
    renderEntriesTable();
};

function renderSourcesAndInsurances() {
    const sourceSelects = ['quickSource', 'filterSource', 'entrySource', 'typeChartSource', 'monthlyChartSource'];
    sourceSelects.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const currentValue = select.value;
        if (id.includes('Chart')) {
            select.innerHTML = '<option value="">Όλα τα Διαγνωστικά</option>';
        } else {
            select.innerHTML = id.startsWith('filter') ? '<option value="">Όλα</option>' : '<option value="">Επιλογή...</option>';
        }
        STATE.sources.forEach(source => {
            select.innerHTML += `<option value="${escapeHtml(source)}">${escapeHtml(source)}</option>`;
        });
        select.value = currentValue;
    });

    const insuranceSelects = ['quickInsurance', 'filterInsurance', 'entryInsurance'];
    insuranceSelects.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const currentValue = select.value;
        select.innerHTML = id.startsWith('filter') ? '<option value="">Όλες</option>' : '<option value="">Επιλογή...</option>';
        STATE.insurances.forEach(insurance => {
            select.innerHTML += `<option value="${escapeHtml(insurance)}">${escapeHtml(insurance)}</option>`;
        });
        select.value = currentValue;
    });

    // Settings lists
    const sourcesList = document.getElementById('sourcesList');
    if (sourcesList) {
        sourcesList.innerHTML = STATE.sources.map((source, index) => `
            <div class="sortable-item" draggable="true" data-index="${index}" data-type="source">
                <span class="drag-handle">☰</span>
                <span class="item-text">${escapeHtml(source)}</span>
                <div class="item-actions">
                    <button onclick="window.removeSource('${escapeHtml(source).replace(/'/g, "\\'")}')">×</button>
                </div>
            </div>
        `).join('');
    }

    const insurancesList = document.getElementById('insurancesList');
    if (insurancesList) {
        insurancesList.innerHTML = STATE.insurances.map((insurance, index) => `
            <div class="sortable-item" draggable="true" data-index="${index}" data-type="insurance">
                <span class="drag-handle">☰</span>
                <span class="item-text">${escapeHtml(insurance)}</span>
                <div class="item-actions">
                    <button onclick="window.removeInsurance('${escapeHtml(insurance).replace(/'/g, "\\'")}')">×</button>
                </div>
            </div>
        `).join('');
    }
}

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
        entry.clawbackPeriod = document.getElementById('entryClawbackPeriod')?.value || 'monthly';
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

// Export to window for onclick handlers
window.generateReport = generateReport;
window.generateComparison = generateComparison;
window.generateForecast = generateForecast;
window.generateHeatmap = generateHeatmap;

/**
 * app.js Part 4 - DOMContentLoaded Event Listeners & Initialization
 * FINAL PART - Complete Event Setup
 */

// Continued from Part 3...

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

    // Save Entry Function
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
            const originalAmount = entry.amount;
            
            entry.deductions = {
                parakratisi: parseFloat(document.getElementById('entryParakratisi').value) || 0,
                mde: parseFloat(document.getElementById('entryMDE').value) || 0,
                rebate: parseFloat(document.getElementById('entryRebate').value) || 0,
                krathseis: parseFloat(document.getElementById('entryKrathseisEopyy').value) || 0,
                clawback: parseFloat(document.getElementById('entryClawback').value) || 0
            };
            
            entry.deductionsPercent = {
                parakratisiPercent: parseFloat(document.getElementById('entryParakratisiPercent').value) || 0,
                mdePercent: parseFloat(document.getElementById('entryMDEPercent').value) || 0,
                rebatePercent: parseFloat(document.getElementById('entryRebatePercent').value) || 0,
                krathseisPercent: parseFloat(document.getElementById('entryKrathseisEopyyPercent').value) || 0,
                clawbackPercent: parseFloat(document.getElementById('entryClawbackPercent').value) || 0
            };
            
            entry.clawbackPeriod = document.getElementById('entryClawbackPeriod')?.value || 'monthly';
        } else {
            entry.krathseis = parseFloat(document.getElementById('entryKrathseisOther').value) || 0;
            entry.krathseisPercent = parseFloat(document.getElementById('entryKrathseisOtherPercent').value) || 0;
        }

        const success = await addEntry(entry);
        if (success) {
            document.getElementById('entryModal').classList.remove('active');
            showToast(STRINGS.success.entrySaved, 'success');
            renderEntriesTable();
            if (STATE.currentView === 'dashboard') renderDashboard();
        }
    };

    // Confirm Delete Function
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

    // Export Chart PDF
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

    // Export Functions to window
    window.generateReport = generateReport;
    window.generateComparison = generateComparison;
    window.generateForecast = generateForecast;
    window.generateHeatmap = generateHeatmap;

    // Add Event Listeners for Reports
    document.getElementById('generateReportBtn')?.addEventListener('click', generateReport);

    // Add Event Listeners for Comparison
    document.getElementById('comparePeriodsBtn')?.addEventListener('click', generateComparison);

    // Add Event Listeners for Forecasting
    document.getElementById('generateForecastBtn')?.addEventListener('click', generateForecast);

    // Add Event Listeners for Heatmaps
    document.getElementById('generateHeatmapBtn')?.addEventListener('click', generateHeatmap);

    // Export Heatmap PDF
    document.getElementById('exportHeatmapPdfBtn')?.addEventListener('click', () => {
        exportChartPDF('heatmapCanvas');
    });

    console.log('Revenue Management System v5 initialized successfully! 🚀');
});