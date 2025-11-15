/**
 * app.js - Main Application File v5
 * All features implemented: draggable modals, percentage storage, auto-backup, etc.
 */

import storage from './storage.js';
import eopyyDeductionsManager from './eopyyClawback.js';
import backupManager, { 
    exportBackup, 
    importBackup, 
    getImportPreview,
    markChangesPending
} from './backup.js';
import pdfExportManager from './pdfExport.js';
import { cdnChecker, periodicChecker } from './cdnChecker.js';
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
import PeriodComparison from './comparison.js';
import ForecastManager from './forecasting.js';
import { HeatmapGenerator, HeatmapDataProcessor } from './charts.js';

// ========================================
// Utility: Download Blob (needed early)
// ========================================
function downloadBlob(filename, blob) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

// Make it global
window.downloadBlob = downloadBlob;

// ========================================
// DOM Ready Handler
// ========================================
function waitForDOM() {
    return new Promise(resolve => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', resolve);
        } else {
            resolve();
        }
    });
}

// ========================================
// Configuration
// ========================================
const CONFIG = {
    pageSize: 25,
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
    editingEntry: null,
    undoStack: [],
    userLabel: 'Admin',
    charts: {},
    cdnAvailable: true,
    currentKPIs: {},
    changeCounter: 0,
    autosaveThreshold: 5,
    hasUnsavedChanges: false,
    sortColumn: null,
    sortDirection: 'desc',
    pageSize: 25
};

// Comparison, Forecasting, Heatmaps state
let comparisonChart = null;
let comparisonTrendChart = null;
let forecastChart = null;
let heatmapGenerator = null;
// ========================================
// Populate Dropdowns Function (Global)
// ========================================
function populateDropdowns() {
    console.log('Populating dropdowns with:', {
        sources: STATE.sources,
        insurances: STATE.insurances
    });
    
    // Quick form dropdowns
    const quickSource = document.getElementById('quickSource');
    const quickInsurance = document.getElementById('quickInsurance');
    
    if (quickSource) {
        quickSource.innerHTML = '<option value="">Επιλογή...</option>' +
            STATE.sources.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
        console.log('✓ Quick source populated:', quickSource.options.length, 'options');
    } else {
        console.error('❌ quickSource element not found');
    }
    
    if (quickInsurance) {
        quickInsurance.innerHTML = '<option value="">Επιλογή...</option>' +
            STATE.insurances.map(i => `<option value="${escapeHtml(i)}">${escapeHtml(i)}</option>`).join('');
        console.log('✓ Quick insurance populated:', quickInsurance.options.length, 'options');
    } else {
        console.error('❌ quickInsurance element not found');
    }
    
    // Modal dropdowns
    const entrySource = document.getElementById('entrySource');
    const entryInsurance = document.getElementById('entryInsurance');
    
    if (entrySource) {
        entrySource.innerHTML = '<option value="">Επιλογή...</option>' +
            STATE.sources.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    }
    
    if (entryInsurance) {
        entryInsurance.innerHTML = '<option value="">Επιλογή...</option>' +
            STATE.insurances.map(i => `<option value="${escapeHtml(i)}">${escapeHtml(i)}</option>`).join('');
    }
    
    // Filter dropdowns
    const filterSource = document.getElementById('filterSource');
    const filterInsurance = document.getElementById('filterInsurance');
    
    if (filterSource) {
        filterSource.innerHTML = '<option value="">Όλα</option>' +
            STATE.sources.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    }
    
    if (filterInsurance) {
        filterInsurance.innerHTML = '<option value="">Όλες</option>' +
            STATE.insurances.map(i => `<option value="${escapeHtml(i)}">${escapeHtml(i)}</option>`).join('');
    }
    
    // Report source dropdown
    const reportSource = document.getElementById('reportSource');
    if (reportSource) {
        reportSource.innerHTML = '<option value="">Όλες</option>' +
            STATE.sources.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    }
}
// ========================================
// Settings List Renderers (Global)
// ========================================
function renderSourcesList() {
    const list = document.getElementById('sourcesList');
    if (!list) return;
    
    list.innerHTML = STATE.sources.map((source, idx) => `
        <div class="sortable-item">
            <span>${escapeHtml(source)}</span>
            <button class="btn-danger btn-sm" onclick="window.removeSource(${idx})">×</button>
        </div>
    `).join('');
}

function renderInsurancesList() {
    const list = document.getElementById('insurancesList');
    if (!list) return;
    
    list.innerHTML = STATE.insurances.map((insurance, idx) => `
        <div class="sortable-item">
            <span>${escapeHtml(insurance)}</span>
            <button class="btn-danger btn-sm" onclick="window.removeInsurance(${idx})">×</button>
        </div>
    `).join('');
}

window.removeSource = async function(idx) {
    if (confirm('Διαγραφή διαγνωστικού;')) {
        STATE.sources.splice(idx, 1);
        await saveData();
        populateDropdowns();
        renderSourcesList();
    }
};

window.removeInsurance = async function(idx) {
    if (confirm('Διαγραφή ασφάλειας;')) {
        STATE.insurances.splice(idx, 1);
        await saveData();
        populateDropdowns();
        renderInsurancesList();
    }
};
// ========================================
// Modal Draggable Setup
// ========================================
function makeModalDraggable(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    const modalContent = modal.querySelector('.modal-content');
    const modalHeader = modal.querySelector('.modal-header');
    
    if (!modalContent || !modalHeader) return;
    
    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;
    
    modalHeader.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('modal-close')) return;
        
        isDragging = true;
        modalContent.classList.add('draggable');
        
        const rect = modalContent.getBoundingClientRect();
        initialX = e.clientX - rect.left;
        initialY = e.clientY - rect.top;
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        
        modalContent.style.left = currentX + 'px';
        modalContent.style.top = currentY + 'px';
        modalContent.style.transform = 'none';
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
}

// ========================================
// Auto-load Backup on Startup
// ========================================
async function autoLoadBackup() {
    try {
        const response = await fetch('./backup.json');
        if (response.ok) {
            const blob = await response.blob();
            const file = new File([blob], 'backup.json', { type: 'application/json' });
            
            const report = await importBackup(file, 'merge');
            
            if (report.success) {
                console.log('Auto-loaded backup.json:', report);
                showToast(`Auto-loaded: ${report.inserted} εγγραφές`, 'success');
                return true;
            }
        }
    } catch (error) {
        console.warn('No backup.json found, prompting user...');
    }
    
    // Prompt user to select backup file
    const userWantsBackup = confirm('Δεν βρέθηκε backup.json.\n\nΘέλετε να φορτώσετε ένα backup αρχείο;');
    
    if (userWantsBackup) {
        document.getElementById('backupFileInput').click();
    }
    
    return false;
}

// ========================================
// Prompt Before Close if Unsaved
// ========================================
window.addEventListener('beforeunload', (e) => {
    if (STATE.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'Έχετε μη αποθηκευμένες αλλαγές. Θέλετε να δημιουργήσετε backup πριν κλείσετε;';
        return e.returnValue;
    }
});

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
// Data Management
// ========================================
async function loadData() {
    try {
        STATE.entries = await storage.loadEntries();
        
        // CRITICAL: Load sources/insurances ή χρήση defaults
        const loadedSources = await storage.loadSetting('sources');
        const loadedInsurances = await storage.loadSetting('insurances');
        
        // Ensure we ALWAYS have defaults
        if (!loadedSources || loadedSources.length === 0) {
            STATE.sources = ['Ταμείο 1', 'Ταμείο 2'];
            await storage.saveSetting('sources', STATE.sources);
            console.log('✓ Default sources created');
        } else {
            STATE.sources = loadedSources;
        }
        
        if (!loadedInsurances || loadedInsurances.length === 0) {
            STATE.insurances = ['ΕΟΠΥΥ', 'Ιδιωτική'];
            await storage.saveSetting('insurances', STATE.insurances);
            console.log('✓ Default insurances created');
        } else {
            STATE.insurances = loadedInsurances;
        }
        
        STATE.userLabel = (await storage.loadSetting('userLabel')) || STATE.userLabel;
        STATE.undoStack = await storage.loadUndoActions();
        
        const savedThreshold = await storage.loadSetting('autosaveThreshold');
        if (savedThreshold) {
            STATE.autosaveThreshold = savedThreshold;
            const thresholdEl = document.getElementById('autosaveThreshold');
            if (thresholdEl) thresholdEl.value = savedThreshold;
        }
        
        const savedPageSize = await storage.loadSetting('pageSize');
        if (savedPageSize) {
            STATE.pageSize = savedPageSize;
            CONFIG.pageSize = savedPageSize;
        }
        
        const userLabelEl = document.getElementById('userLabel');
        if (userLabelEl) {
            userLabelEl.textContent = `Χρήστης: ${STATE.userLabel}`;
        }
        
        await eopyyDeductionsManager.loadDeductions();
        
        console.log(`✓ Loaded ${STATE.entries.length} entries`);
        console.log(`✓ Sources: ${STATE.sources.length}`, STATE.sources);
        console.log(`✓ Insurances: ${STATE.insurances.length}`, STATE.insurances);
    } catch (error) {
        console.error('❌ Load data error:', error);
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
        // Store percentages too
        await eopyyDeductionsManager.applyDeductions(
            entry.id,
            entry.deductions,
            entry.notes || '',
            entry.deductionPercentages || {}
        );
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
// UI Rendering
// ========================================
function renderDashboard() {
    const period = document.getElementById('dashPeriod')?.value || 'all';
    const includeParakratisi = document.getElementById('dashIncludeParakratisi')?.checked || false;
    const filtered = filterEntriesByPeriod(STATE.entries, period);

    const kpis = eopyyDeductionsManager.calculateKPIs(filtered, { includeParakratisi });
    STATE.currentKPIs = kpis;

    // Calculate percentages SAFELY
    const totalOriginal = filtered.reduce((sum, e) => {
        const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
        return sum + (amounts.originalAmount || 0);
    }, 0);

    // Avoid division by zero
    const safePercent = (value) => {
        if (totalOriginal === 0) return '0.00';
        return ((value / totalOriginal) * 100).toFixed(2);
    };

    // Main KPIs
    const kpiTotalEl = document.getElementById('kpiTotal');
    if (kpiTotalEl) {
        kpiTotalEl.innerHTML = `
            <div class="kpi-header"><div class="kpi-label">Συνολικά</div></div>
            <div class="kpi-content">
                <div class="kpi-amount">${formatCurrency(kpis.total)}</div>
                <div class="kpi-percent">${safePercent(kpis.total)}%</div>
            </div>
        `;
    }
    
    const kpiEopyyEl = document.getElementById('kpiEopyy');
    if (kpiEopyyEl) {
        kpiEopyyEl.innerHTML = `
            <div class="kpi-header"><div class="kpi-label">ΕΟΠΥΥ</div></div>
            <div class="kpi-content">
                <div class="kpi-amount">${formatCurrency(kpis.eopyyTotal)}</div>
                <div class="kpi-percent">${safePercent(kpis.eopyyTotal)}%</div>
            </div>
        `;
    }
    
    const kpiOthersEl = document.getElementById('kpiOthers');
    if (kpiOthersEl) {
        kpiOthersEl.innerHTML = `
            <div class="kpi-header"><div class="kpi-label">Άλλα</div></div>
            <div class="kpi-content">
                <div class="kpi-amount">${formatCurrency(kpis.nonEopyyTotal)}</div>
                <div class="kpi-percent">${safePercent(kpis.nonEopyyTotal)}%</div>
            </div>
        `;
    }
    
    const kpiDeductionsEl = document.getElementById('kpiDeductions');
    if (kpiDeductionsEl) {
        const totalDeductions = kpis.eopyyTotalDeductions + kpis.nonEopyyKrathseis;
        kpiDeductionsEl.innerHTML = `
            <div class="kpi-header"><div class="kpi-label">Κρατήσεις</div></div>
            <div class="kpi-content">
                <div class="kpi-amount">${formatCurrency(totalDeductions)}</div>
                <div class="kpi-percent">${safePercent(totalDeductions)}%</div>
            </div>
        `;
    }

    // Breakdown KPIs
    const setKPIValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatCurrency(value);
    };

    setKPIValue('kpiParakratisi', kpis.eopyyParakratisi);
    setKPIValue('kpiMDE', kpis.eopyyMDE);
    setKPIValue('kpiRebate', kpis.eopyyRebate);
    setKPIValue('kpiKrathseis', kpis.eopyyKrathseis);
    setKPIValue('kpiClawback', kpis.eopyyClawback);

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
        
        return `
            <tr>
                <td>${escapeHtml(entry.date)}</td>
                <td>${escapeHtml(entry.source)}</td>
                <td>${escapeHtml(entry.insurance)}</td>
                <td>${entry.type === 'cash' ? 'Μετρητά' : 'Τιμολόγια'}</td>
                <td class="text-right">${formatCurrency(amounts.finalAmount)}</td>
            </tr>
        `;
    }).join('');
}

function renderCharts(entries) {
    if (!STATE.cdnAvailable || !window.Chart) {
        console.warn('Charts disabled - CDN unavailable');
        return;
    }

    const includeParakratisi = document.getElementById('dashIncludeParakratisi')?.checked || false;

    const eopyyTotal = entries.filter(e => eopyyDeductionsManager.isEopyyEntry(e))
        .reduce((sum, e) => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return sum + (includeParakratisi ? amounts.finalAmountNoParakratisi : amounts.finalAmount);
        }, 0);
    
    const othersTotal = entries.filter(e => !eopyyDeductionsManager.isEopyyEntry(e))
        .reduce((sum, e) => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return sum + amounts.finalAmount;
        }, 0);

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

    const monthlyData = {};
    entries.forEach(entry => {
        if (!monthlyData[entry.date]) monthlyData[entry.date] = 0;
        const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);
        monthlyData[entry.date] += includeParakratisi ? amounts.finalAmountNoParakratisi : amounts.finalAmount;
    });

    const sortedMonths = Object.keys(monthlyData).sort((a, b) => compareDates(a, b));
    const monthlyValues = sortedMonths.map(m => monthlyData[m]);

    const monthlyCtx = document.getElementById('monthlyChart');
    if (monthlyCtx) {
        if (STATE.charts.monthlyChart) STATE.charts.monthlyChart.destroy();
        STATE.charts.monthlyChart = new Chart(monthlyCtx, {
            type: 'line',
            data: {
                labels: sortedMonths,
                datasets: [{
                    label: 'Έσοδα',
                    data: monthlyValues,
                    borderColor: CONFIG.chartColors.primary,
                    backgroundColor: CONFIG.chartColors.primary + '20',
                    fill: true,
                    tension: 0.4
                }]
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
                            label: (context) => formatCurrency(context.parsed.y)
                        }
                    }
                }
            }
        });
    }
}

function renderEntriesTable() {
    const tbody = document.getElementById('entriesTableBody');
    const filtered = applyFilters();
    const sorted = applySorting(filtered);
    
    const totalPages = Math.ceil(sorted.length / STATE.pageSize);
    const start = (STATE.currentPage - 1) * STATE.pageSize;
    const end = start + STATE.pageSize;
    const pageEntries = sorted.slice(start, end);

    if (pageEntries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="15" class="text-center">Δεν υπάρχουν εγγραφές</td></tr>';
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
                <td class="text-right">${formatCurrency(amounts.parakratisi || 0)}</td>
                <td class="text-right">${formatCurrency(amounts.mde || 0)}</td>
                <td class="text-right">${formatCurrency(amounts.rebate || 0)}</td>
                <td class="text-right">${formatCurrency(amounts.krathseis || 0)}</td>
                <td class="text-right">${formatCurrency(amounts.clawback || 0)}</td>
                <td class="text-right">${formatCurrency(amounts.totalDeductions)}</td>
                <td class="text-right"><strong>${formatCurrency(amounts.finalAmount)}</strong></td>
                <td>${entry.notes ? escapeHtml(entry.notes.substring(0, 20)) : '-'}</td>
                <td class="text-center">
                    <button class="btn-secondary btn-compact btn-sm" onclick="window.editEntry('${entry.id}')">✏️</button>
                    <button class="btn-danger btn-compact btn-sm" onclick="window.confirmDelete('${entry.id}')">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');

    renderPagination(sorted.length, totalPages);
}

function applySorting(entries) {
    if (!STATE.sortColumn) return entries;
    
    return [...entries].sort((a, b) => {
        let aVal, bVal;
        
        switch(STATE.sortColumn) {
            case 'date':
                return STATE.sortDirection === 'asc' 
                    ? compareDates(a.date, b.date) 
                    : compareDates(b.date, a.date);
            case 'source':
                aVal = a.source.toLowerCase();
                bVal = b.source.toLowerCase();
                break;
            case 'insurance':
                aVal = a.insurance.toLowerCase();
                bVal = b.insurance.toLowerCase();
                break;
            case 'type':
                aVal = a.type;
                bVal = b.type;
                break;
            case 'amount':
                const amountsA = eopyyDeductionsManager.getAmountsBreakdown(a);
                const amountsB = eopyyDeductionsManager.getAmountsBreakdown(b);
                aVal = amountsA.originalAmount;
                bVal = amountsB.originalAmount;
                break;
            case 'final':
                const finalA = eopyyDeductionsManager.getAmountsBreakdown(a);
                const finalB = eopyyDeductionsManager.getAmountsBreakdown(b);
                aVal = finalA.finalAmount;
                bVal = finalB.finalAmount;
                break;
            default:
                return 0;
        }
        
        if (STATE.sortDirection === 'asc') {
            return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        } else {
            return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
        }
    });
}

function setSortColumn(column) {
    if (STATE.sortColumn === column) {
        STATE.sortDirection = STATE.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        STATE.sortColumn = column;
        STATE.sortDirection = 'desc';
    }
    
    // Update headers
    document.querySelectorAll('.sortable-header').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
    });
    
    const currentHeader = document.querySelector(`[data-sort="${column}"]`);
    if (currentHeader) {
        currentHeader.classList.add(STATE.sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
    }
    
    renderEntriesTable();
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

    return filtered;
}

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
    // 'all' returns everything

    return filtered;
}

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
// Event Handlers (Global for onclick)
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
    
    // Clear all fields first
    ['entryParakratisi', 'entryParakratisiPercent', 'entryMDE', 'entryMDEPercent',
     'entryRebate', 'entryRebatePercent', 'entryKrathseisEopyy', 'entryKrathseisEopyyPercent',
     'entryClawback', 'entryClawbackPercent', 'entryKrathseisOther', 'entryKrathseisOtherPercent'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    if (isEopyy && deduction) {
        document.getElementById('entryParakratisi').value = deduction.deductions.parakratisi || '';
        document.getElementById('entryMDE').value = deduction.deductions.mde || '';
        document.getElementById('entryRebate').value = deduction.deductions.rebate || '';
        document.getElementById('entryKrathseisEopyy').value = deduction.deductions.krathseis || '';
        document.getElementById('entryClawback').value = deduction.deductions.clawback || '';
        
        // Load percentages if stored
        if (deduction.percentages) {
            document.getElementById('entryParakratisiPercent').value = deduction.percentages.parakratisi || '';
            document.getElementById('entryMDEPercent').value = deduction.percentages.mde || '';
            document.getElementById('entryRebatePercent').value = deduction.percentages.rebate || '';
            document.getElementById('entryKrathseisEopyyPercent').value = deduction.percentages.krathseis || '';
            document.getElementById('entryClawbackPercent').value = deduction.percentages.clawback || '';
        }
    } else if (!isEopyy) {
        document.getElementById('entryKrathseisOther').value = entry.krathseis || '';
        if (entry.krathseisPercent) {
            document.getElementById('entryKrathseisOtherPercent').value = entry.krathseisPercent;
        }
    }

    showModalDeductionFields();
    document.getElementById('entryModal').classList.add('active');
};

window.saveEntry = async function() {
    const insurance = document.getElementById('entryInsurance').value;
    const isEopyy = insurance.toUpperCase().includes('ΕΟΠΥΥ');
    const amount = parseFloat(document.getElementById('entryAmount').value);
    
    const entry = {
        id: document.getElementById('entryId').value || undefined,
        date: document.getElementById('entryDate').value,
        source: document.getElementById('entrySource').value,
        insurance: insurance,
        type: document.getElementById('entryType').value,
        amount: amount,
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
        
        // Store percentages
        entry.deductionPercentages = {
            parakratisi: parseFloat(document.getElementById('entryParakratisiPercent').value) || 0,
            mde: parseFloat(document.getElementById('entryMDEPercent').value) || 0,
            rebate: parseFloat(document.getElementById('entryRebatePercent').value) || 0,
            krathseis: parseFloat(document.getElementById('entryKrathseisEopyyPercent').value) || 0,
            clawback: parseFloat(document.getElementById('entryClawbackPercent').value) || 0
        };
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

window.setSortColumn = setSortColumn;

// Initialize when DOM loads
// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing Revenue Management System v5...');

    try {
        // Wait for DOM to be fully ready
        await waitForDOM();
        
        // Initialize storage first
        await storage.init();
        console.log('✓ Storage initialized');

        // Check CDN availability
        const cdnStatus = await cdnChecker.checkAll();
        STATE.cdnAvailable = !cdnStatus.offline;
        
        if (cdnStatus.offline) {
            console.warn('CDN libraries unavailable - some features disabled');
            cdnChecker.showOfflineNotice();
        } else {
            console.log('✓ CDN libraries available');
        }

        periodicChecker.start();

// Load data ΠΡΙΝ populate dropdowns
await loadData();
console.log('✓ Data loaded:', STATE.entries.length, 'entries');

// CRITICAL: Wait για async operations
await new Promise(resolve => setTimeout(resolve, 100));

// Populate all dropdowns ΜΕΤΑ το load
populateDropdowns();
console.log('✓ Dropdowns populated');

// Verify dropdowns have options
const quickSource = document.getElementById('quickSource');
const quickInsurance = document.getElementById('quickInsurance');
console.log('Quick dropdowns check:', {
    sources: quickSource?.options?.length || 0,
    insurances: quickInsurance?.options?.length || 0
});

        // Auto-load backup
        await autoLoadBackup();

        // Make modals draggable
        makeModalDraggable('entryModal');
        makeModalDraggable('importBackupModal');

        // Set default dashboard period
        const dashPeriod = document.getElementById('dashPeriod');
        if (dashPeriod) {
            dashPeriod.value = 'all';
        }
        
        // Set default without Παρακράτηση
        const includeParakratisi = document.getElementById('dashIncludeParakratisi');
        if (includeParakratisi) {
            includeParakratisi.checked = false;
        }

        // Render initial dashboard
        renderDashboard();
        console.log('✓ Dashboard rendered');// Setup quick add form submission
const quickAddForm = document.getElementById('quickAddForm');
if (quickAddForm) {
    quickAddForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const insurance = document.getElementById('quickInsurance').value;
        const isEopyy = insurance.toUpperCase().includes('ΕΟΠΥΥ');
        const amount = parseFloat(document.getElementById('quickAmount').value);
        
        const entry = {
            date: document.getElementById('quickDate').value,
            source: document.getElementById('quickSource').value,
            insurance: insurance,
            type: document.getElementById('quickType').value,
            amount: amount,
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
            
            entry.deductionPercentages = {
                parakratisi: parseFloat(document.getElementById('quickParakratisiPercent').value) || 0,
                mde: parseFloat(document.getElementById('quickMDEPercent').value) || 0,
                rebate: parseFloat(document.getElementById('quickRebatePercent').value) || 0,
                krathseis: parseFloat(document.getElementById('quickKrathseisEopyyPercent').value) || 0,
                clawback: parseFloat(document.getElementById('quickClawbackPercent').value) || 0
            };
        } else {
            entry.krathseis = parseFloat(document.getElementById('quickKrathseisOther').value) || 0;
            entry.krathseisPercent = parseFloat(document.getElementById('quickKrathseisOtherPercent').value) || 0;
        }

        const success = await addEntry(entry);
        if (success) {
            showToast(STRINGS.success.entrySaved, 'success');
            quickAddForm.reset();
            document.getElementById('quickFinalAmount').textContent = '€ 0,00';
            document.getElementById('quickEopyyDeductions').style.display = 'none';
            document.getElementById('quickNonEopyyDeductions').style.display = 'none';
            renderDashboard();
        }
    });
}

        // Setup date auto-format
        setupDateAutoFormat(document.getElementById('quickDate'));
        setupDateAutoFormat(document.getElementById('entryDate'));
        setupDateAutoFormat(document.getElementById('filterDateFrom'));
        setupDateAutoFormat(document.getElementById('filterDateTo'));

        // Setup event listeners for dashboard controls
        document.getElementById('dashPeriod')?.addEventListener('change', () => {
            renderDashboard();
        });

        document.getElementById('dashIncludeParakratisi')?.addEventListener('change', () => {
            renderDashboard();
        });

        // Setup insurance/type change listeners for deductions
        ['quickInsurance', 'quickType'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', showDeductionFields);
        });

        ['entryInsurance', 'entryType'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', showModalDeductionFields);
        });

        // Setup amount change listeners for final amount calculation
        document.getElementById('quickAmount')?.addEventListener('input', () => calculateFinalAmount('quick'));
        document.getElementById('entryAmount')?.addEventListener('input', () => calculateFinalAmount('entry'));

        // Setup all deduction field listeners
        [
            'quickParakratisi', 'quickMDE', 'quickRebate', 'quickKrathseisEopyy', 
            'quickClawback', 'quickKrathseisOther',
            'entryParakratisi', 'entryMDE', 'entryRebate', 'entryKrathseisEopyy',
            'entryClawback', 'entryKrathseisOther'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => {
                    const prefix = id.startsWith('quick') ? 'quick' : 'entry';
                    calculateFinalAmount(prefix);
                });
            }
        });

        // Setup percentage sync
        const getQuickAmount = () => parseFloat(document.getElementById('quickAmount')?.value) || 0;
        setupPercentageSync('quickParakratisi', 'quickParakratisiPercent', getQuickAmount);
        setupPercentageSync('quickMDE', 'quickMDEPercent', getQuickAmount);
        setupPercentageSync('quickRebate', 'quickRebatePercent', getQuickAmount);
        setupPercentageSync('quickKrathseisEopyy', 'quickKrathseisEopyyPercent', getQuickAmount);
        setupPercentageSync('quickClawback', 'quickClawbackPercent', getQuickAmount);
        setupPercentageSync('quickKrathseisOther', 'quickKrathseisOtherPercent', getQuickAmount);
        
        const getModalAmount = () => parseFloat(document.getElementById('entryAmount')?.value) || 0;
        setupPercentageSync('entryParakratisi', 'entryParakratisiPercent', getModalAmount);
        setupPercentageSync('entryMDE', 'entryMDEPercent', getModalAmount);
        setupPercentageSync('entryRebate', 'entryRebatePercent', getModalAmount);
        setupPercentageSync('entryKrathseisEopyy', 'entryKrathseisEopyyPercent', getModalAmount);
        setupPercentageSync('entryClawback', 'entryClawbackPercent', getModalAmount);
        setupPercentageSync('entryKrathseisOther', 'entryKrathseisOtherPercent', getModalAmount);

        // Setup notes toggle
        document.getElementById('quickNotesToggle')?.addEventListener('change', (e) => {
            document.getElementById('quickNotes').style.display = e.target.checked ? 'block' : 'none';
        });

        document.getElementById('entryNotesToggle')?.addEventListener('change', (e) => {
            document.getElementById('entryNotes').style.display = e.target.checked ? 'block' : 'none';
        });

        // Setup navigation tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const view = tab.dataset.view;
                
                // Update active tab
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Show corresponding view
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
                const viewElement = document.getElementById(`${view}View`);
                if (viewElement) {
                    viewElement.classList.add('active');
                    STATE.currentView = view;
                    
                    // Render view-specific content
                    if (view === 'dashboard') renderDashboard();
                    if (view === 'entries') renderEntriesTable();
                }
            });
        });

        // Setup add entry button
        document.getElementById('addEntryBtn')?.addEventListener('click', () => {
            STATE.editingEntry = null;
            document.getElementById('modalTitle').textContent = 'Νέα Εγγραφή';
            document.getElementById('entryId').value = '';
            document.getElementById('entryDate').value = '';
            document.getElementById('entrySource').value = '';
            document.getElementById('entryInsurance').value = '';
            document.getElementById('entryType').value = 'cash';
            document.getElementById('entryAmount').value = '';
            document.getElementById('entryNotes').value = '';
            document.getElementById('entryNotesToggle').checked = false;
            document.getElementById('entryNotes').style.display = 'none';
            
            // Clear all deduction fields
            ['entryParakratisi', 'entryParakratisiPercent', 'entryMDE', 'entryMDEPercent',
             'entryRebate', 'entryRebatePercent', 'entryKrathseisEopyy', 'entryKrathseisEopyyPercent',
             'entryClawback', 'entryClawbackPercent', 'entryKrathseisOther', 'entryKrathseisOtherPercent'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            
            showModalDeductionFields();
            document.getElementById('entryModal').classList.add('active');
        });

        // Setup filters
        document.getElementById('applyFiltersBtn')?.addEventListener('click', () => {
            STATE.filters = {
                dateFrom: document.getElementById('filterDateFrom')?.value,
                dateTo: document.getElementById('filterDateTo')?.value,
                source: document.getElementById('filterSource')?.value,
                insurance: document.getElementById('filterInsurance')?.value,
                type: document.getElementById('filterType')?.value,
                amountFrom: document.getElementById('filterAmountFrom')?.value,
                amountTo: document.getElementById('filterAmountTo')?.value
            };
            STATE.currentPage = 1;
            renderEntriesTable();
        });

        document.getElementById('clearFiltersBtn')?.addEventListener('click', () => {
            STATE.filters = {};
            document.getElementById('filterDateFrom').value = '';
            document.getElementById('filterDateTo').value = '';
            document.getElementById('filterSource').value = '';
            document.getElementById('filterInsurance').value = '';
            document.getElementById('filterType').value = '';
            document.getElementById('filterAmountFrom').value = '';
            document.getElementById('filterAmountTo').value = '';
            STATE.currentPage = 1;
            renderEntriesTable();
        });

        // Setup page size selector
        document.getElementById('pageSizeSelect')?.addEventListener('change', (e) => {
            STATE.pageSize = parseInt(e.target.value);
            CONFIG.pageSize = STATE.pageSize;
            storage.saveSetting('pageSize', STATE.pageSize);
            STATE.currentPage = 1;
            renderEntriesTable();
        });

        // Setup backup buttons
        document.getElementById('backupBtn')?.addEventListener('click', async () => {
            await exportBackup();
            showToast('Backup δημιουργήθηκε', 'success');
        });

        document.getElementById('exportBackupBtn')?.addEventListener('click', async () => {
            await exportBackup();
            showToast('Backup εξήχθη', 'success');
        });

        document.getElementById('importBackupBtn')?.addEventListener('click', () => {
            document.getElementById('backupFileInput').click();
        });

        document.getElementById('backupFileInput')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const report = await importBackup(file, 'merge');
            if (report.success) {
                await loadData();
                populateDropdowns();
                renderDashboard();
                showToast(`Import: ${report.inserted} νέες, ${report.updated} ενημερώθηκαν`, 'success');
            } else {
                showToast('Import failed', 'error');
            }

            e.target.value = '';
        });

        // Setup CSV buttons
        document.getElementById('importCsvBtn')?.addEventListener('click', () => {
            document.getElementById('csvFileInput').click();
        });

        document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
            const filtered = applyFilters();
            const csvData = [
                ['Ημερομηνία', 'Διαγνωστικό', 'Ασφάλεια', 'Τύπος', 'Αρχικό', 'Παρακρ.', 'ΜΔΕ', 'Rebate', 'Κρατ.', 'Clawback', 'Σύνολο Κρατ.', 'Τελικό'],
                ...filtered.map(entry => {
                    const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);
                    return [
                        entry.date,
                        entry.source,
                        entry.insurance,
                        entry.type === 'cash' ? 'Μετρητά' : 'Τιμολόγια',
                        amounts.originalAmount.toFixed(2),
                        (amounts.parakratisi || 0).toFixed(2),
                        (amounts.mde || 0).toFixed(2),
                        (amounts.rebate || 0).toFixed(2),
                        (amounts.krathseis || 0).toFixed(2),
                        (amounts.clawback || 0).toFixed(2),
                        amounts.totalDeductions.toFixed(2),
                        amounts.finalAmount.toFixed(2)
                    ];
                })
            ];

            const csv = csvData.map(row => row.join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            downloadBlob('entries.csv', blob);
            showToast('CSV εξήχθη', 'success');
        });

        // Setup PDF export
        document.getElementById('exportEntriesPdfBtn')?.addEventListener('click', async () => {
            const filtered = applyFilters();
            await pdfExportManager.exportEntriesList(filtered, STATE.filters);
            showToast('PDF εξήχθη', 'success');
        });

        // Setup settings
        document.getElementById('darkModeToggle')?.addEventListener('change', (e) => {
            document.body.classList.toggle('dark-mode', e.target.checked);
            localStorage.setItem('darkMode', e.target.checked);
        });

        document.getElementById('autosaveEnabled')?.addEventListener('change', (e) => {
            localStorage.setItem('autosaveEnabled', e.target.checked);
        });

        document.getElementById('autosaveThreshold')?.addEventListener('change', async (e) => {
            STATE.autosaveThreshold = parseInt(e.target.value);
            await storage.saveSetting('autosaveThreshold', STATE.autosaveThreshold);
        });

        document.getElementById('clearCacheBtn')?.addEventListener('click', async () => {
            if (!confirm('ΠΡΟΣΟΧΗ: Θα διαγραφούν ΟΛΑ τα δεδομένα! Συνέχεια;')) return;

            const report = await storage.clearAllStorage();
            const reportDiv = document.getElementById('clearCacheReport');
            reportDiv.innerHTML = `
                <p>✓ Entries: ${report.entries ? 'Cleared' : 'Failed'}</p>
                <p>✓ Settings: ${report.settings ? 'Cleared' : 'Failed'}</p>
                <p>✓ localStorage: ${report.localStorage ? 'Cleared' : 'Failed'}</p>
                ${report.errors.length > 0 ? `<p class="text-danger">Errors: ${report.errors.join(', ')}</p>` : ''}
            `;

            setTimeout(() => location.reload(), 2000);
        });

        // Setup sources/insurances management
        document.getElementById('addNewSourceBtn')?.addEventListener('click', () => {
            const input = document.getElementById('newSourceInput');
            const value = input.value.trim();
            if (value && !STATE.sources.includes(value)) {
                STATE.sources.push(value);
                saveData();
                populateDropdowns();
                renderSourcesList();
                input.value = '';
            }
        });

        document.getElementById('addNewInsuranceBtn')?.addEventListener('click', () => {
            const input = document.getElementById('newInsuranceInput');
            const value = input.value.trim();
            if (value && !STATE.insurances.includes(value)) {
                STATE.insurances.push(value);
                saveData();
                populateDropdowns();
                renderInsurancesList();
                input.value = '';
            }
        });

        renderSourcesList();
        renderInsurancesList();

        console.log('✅ Revenue Management System v5 initialized successfully!');
        showToast('Σύστημα φορτώθηκε επιτυχώς', 'success');

    } catch (error) {
        console.error('❌ Initialization error:', error);
        showToast('Σφάλμα φόρτωσης: ' + error.message, 'error');
    }
// Helper functions for settings (MUST BE BEFORE DOMContentLoaded closes)
function renderSourcesList() {
    const list = document.getElementById('sourcesList');
    if (!list) return;
    
    list.innerHTML = STATE.sources.map((source, idx) => `
        <div class="sortable-item">
            <span>${escapeHtml(source)}</span>
            <button class="btn-danger btn-sm" onclick="removeSource(${idx})">×</button>
        </div>
    `).join('');
}

function renderInsurancesList() {
    const list = document.getElementById('insurancesList');
    if (!list) return;
    
    list.innerHTML = STATE.insurances.map((insurance, idx) => `
        <div class="sortable-item">
            <span>${escapeHtml(insurance)}</span>
            <button class="btn-danger btn-sm" onclick="removeInsurance(${idx})">×</button>
        </div>
    `).join('');
}

window.removeSource = async function(idx) {
    if (confirm('Διαγραφή διαγνωστικού;')) {
        STATE.sources.splice(idx, 1);
        await saveData();
        populateDropdowns();
        renderSourcesList();
    }
};

window.removeInsurance = async function(idx) {
    if (confirm('Διαγραφή ασφάλειας;')) {
        STATE.insurances.splice(idx, 1);
        await saveData();
        populateDropdowns();
        renderInsurancesList();
    }
};
});

// Helper functions for settings
function renderSourcesList() {
    const list = document.getElementById('sourcesList');
    if (!list) return;
    
    list.innerHTML = STATE.sources.map((source, idx) => `
        <div class="sortable-item">
            <span>${escapeHtml(source)}</span>
            <button class="btn-danger btn-sm" onclick="window.removeSource(${idx})">×</button>
        </div>
    `).join('');
}

function renderInsurancesList() {
    const list = document.getElementById('insurancesList');
    if (!list) return;
    
    list.innerHTML = STATE.insurances.map((insurance, idx) => `
        <div class="sortable-item">
            <span>${escapeHtml(insurance)}</span>
            <button class="btn-danger btn-sm" onclick="window.removeInsurance(${idx})">×</button>
        </div>
    `).join('');
}

window.removeSource = async function(idx) {
    if (confirm('Διαγραφή διαγνωστικού;')) {
        STATE.sources.splice(idx, 1);
        await saveData();
        populateDropdowns();
        renderSourcesList();
    }
};

window.removeInsurance = async function(idx) {
    if (confirm('Διαγραφή ασφάλειας;')) {
        STATE.insurances.splice(idx, 1);
        await saveData();
        populateDropdowns();
        renderInsurancesList();
    }
};