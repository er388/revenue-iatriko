/**
 * app.js - Main Application File with Advanced Deductions
 * ΕΟΠΥΥ: 5 deductions, Others: 1 deduction
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
    currentKPIs: {}
};

// ========================================
// Toast Notifications
// ========================================
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
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
        STATE.sources = (await storage.loadSetting('sources')) || STATE.sources;
        STATE.insurances = (await storage.loadSetting('insurances')) || STATE.insurances;
        STATE.userLabel = (await storage.loadSetting('userLabel')) || STATE.userLabel;
        STATE.undoStack = await storage.loadUndoActions();
        
        document.getElementById('userLabel').textContent = `Χρήστης: ${STATE.userLabel}`;
        
        // Load deductions
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

    // Store original amount
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

    // Apply deductions if specified
    const isEopyy = eopyyDeductionsManager.isEopyyEntry(entry);
    
    if (isEopyy && entry.deductions) {
        await eopyyDeductionsManager.applyDeductions(
            entry.id,
            entry.deductions,
            entry.notes || ''
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
        
        // Remove deductions if exists
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
    const period = document.getElementById('dashPeriod').value;
    const includeParakratisi = document.getElementById('dashIncludeParakratisi').checked;
    const filtered = filterEntriesByPeriod(STATE.entries, period);

    // Calculate KPIs
    const kpis = eopyyDeductionsManager.calculateKPIs(filtered, { includeParakratisi });
    
    STATE.currentKPIs = kpis;

    // Main KPIs
    document.getElementById('kpiTotal').textContent = formatCurrency(kpis.total);
    document.getElementById('kpiEopyy').textContent = formatCurrency(kpis.eopyyTotal);
    document.getElementById('kpiOthers').textContent = formatCurrency(kpis.nonEopyyTotal);
    document.getElementById('kpiDeductions').textContent = formatCurrency(kpis.eopyyTotalDeductions + kpis.nonEopyyKrathseis);

    // ΕΟΠΥΥ Breakdown
    document.getElementById('kpiParakratisi').textContent = formatCurrency(kpis.eopyyParakratisi);
    document.getElementById('kpiMDE').textContent = formatCurrency(kpis.eopyyMDE);
    document.getElementById('kpiRebate').textContent = formatCurrency(kpis.eopyyRebate);
    document.getElementById('kpiKrathseis').textContent = formatCurrency(kpis.eopyyKrathseis);
    document.getElementById('kpiClawback').textContent = formatCurrency(kpis.eopyyClawback);

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
        const displayAmount = amounts.finalAmount;
        
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

function renderCharts(entries) {
    if (!STATE.cdnAvailable) {
        console.warn('Charts disabled - CDN unavailable');
        return;
    }

    // Type Chart
    const eopyyTotal = entries.filter(e => eopyyDeductionsManager.isEopyyEntry(e))
        .reduce((sum, e) => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return sum + amounts.finalAmount;
        }, 0);
    
    const othersTotal = entries.filter(e => !eopyyDeductionsManager.isEopyyEntry(e))
        .reduce((sum, e) => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return sum + amounts.finalAmount;
        }, 0);

    const typeCtx = document.getElementById('typeChart');
    if (typeCtx && window.Chart) {
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

    // Monthly Chart
    const monthlyData = {};
    entries.forEach(entry => {
        if (!monthlyData[entry.date]) monthlyData[entry.date] = 0;
        const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);
        monthlyData[entry.date] += amounts.finalAmount;
    });

    const sortedMonths = Object.keys(monthlyData).sort((a, b) => compareDates(a, b));
    const monthlyValues = sortedMonths.map(m => monthlyData[m]);

    const monthlyCtx = document.getElementById('monthlyChart');
    if (monthlyCtx && window.Chart) {
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
    
    const totalPages = Math.ceil(filtered.length / CONFIG.pageSize);
    const start = (STATE.currentPage - 1) * CONFIG.pageSize;
    const end = start + CONFIG.pageSize;
    const pageEntries = filtered.slice(start, end);

    if (pageEntries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">Δεν υπάρχουν εγγραφές</td></tr>';
        renderPagination(0, 0);
        return;
    }

    tbody.innerHTML = pageEntries.map(entry => {
        const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);
        const isEopyy = eopyyDeductionsManager.isEopyyEntry(entry);
        
        let deductionsDisplay = '-';
        if (isEopyy && amounts.hasDeductions) {
            deductionsDisplay = `Π:${formatCurrency(amounts.parakratisi)}, ΜΔΕ:${formatCurrency(amounts.mde)}, R:${formatCurrency(amounts.rebate)}, Κ:${formatCurrency(amounts.krathseis)}, C:${formatCurrency(amounts.clawback)}`;
        } else if (!isEopyy && amounts.hasDeductions) {
            deductionsDisplay = formatCurrency(amounts.krathseis);
        }
        
        return `
            <tr>
                <td>${escapeHtml(entry.date)}</td>
                <td>${escapeHtml(entry.source)}</td>
                <td>${escapeHtml(entry.insurance)}</td>
                <td>${entry.type === 'cash' ? 'Μετρητά' : 'Τιμολόγια'}</td>
                <td class="text-right">${formatCurrency(amounts.originalAmount)}</td>
                <td class="text-right" style="font-size: 0.85em;">${deductionsDisplay}</td>
                <td class="text-right"><strong>${formatCurrency(amounts.finalAmount)}</strong></td>
                <td>${entry.notes ? escapeHtml(entry.notes.substring(0, 30)) : '-'}</td>
                <td>
                    <button class="btn-secondary btn-sm" onclick="window.editEntry('${entry.id}')">✏️</button>
                    <button class="btn-danger btn-sm" onclick="window.confirmDelete('${entry.id}')">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');

    renderPagination(filtered.length, totalPages);
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

function renderSourcesAndInsurances() {
    const sourceSelects = ['quickSource', 'filterSource', 'reportSource', 'entrySource'];
    sourceSelects.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const currentValue = select.value;
        select.innerHTML = id.startsWith('filter') || id.startsWith('report') ? '<option value="">Όλα</option>' : '<option value="">Επιλογή...</option>';
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

    const sourcesList = document.getElementById('sourcesList');
    if (sourcesList) {
        sourcesList.innerHTML = STATE.sources.map(source => `
            <div class="tag">
                ${escapeHtml(source)}
                <button onclick="window.removeSource('${escapeHtml(source)}')">×</button>
            </div>
        `).join('');
    }

    const insurancesList = document.getElementById('insurancesList');
    if (insurancesList) {
        insurancesList.innerHTML = STATE.insurances.map(insurance => `
            <div class="tag">
                ${escapeHtml(insurance)}
                <button onclick="window.removeInsurance('${escapeHtml(insurance)}')">×</button>
            </div>
        `).join('');
    }
}

// ========================================
// Filtering
// ========================================
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

    filtered.sort((a, b) => compareDates(b.date, a.date));

    return filtered;
}

function filterEntriesByPeriod(entries, period) {
    const now = new Date();
    let filtered = [...entries];

    if (period === 'today' || period === 'month') {
        const thisMonth = formatMonthYear(now.getMonth() + 1, now.getFullYear());
        filtered = filtered.filter(e => e.date === thisMonth);
    } else if (period === 'year') {
        const thisYear = now.getFullYear();
        filtered = filtered.filter(e => e.date.endsWith(`/${thisYear}`));
    }

    return filtered;
}

// ========================================
// Form Handlers
// ========================================
function showDeductionFields() {
    const insurance = document.getElementById('quickInsurance').value;
    const type = document.getElementById('quickType').value;
    const isEopyy = insurance.toUpperCase().includes('ΕΟΠΥΥ');
    const isInvoice = type === 'invoice';
    
    document.getElementById('quickEopyyDeductions').style.display = (isEopyy && isInvoice) ? 'block' : 'none';
    document.getElementById('quickNonEopyyDeductions').style.display = (!isEopyy && isInvoice) ? 'block' : 'none';
}

function showModalDeductionFields() {
    const insurance = document.getElementById('entryInsurance').value;
    const type = document.getElementById('entryType').value;
    const isEopyy = insurance.toUpperCase().includes('ΕΟΠΥΥ');
    const isInvoice = type === 'invoice';
    
    document.getElementById('modalEopyyDeductions').style.display = (isEopyy && isInvoice) ? 'block' : 'none';
    document.getElementById('modalNonEopyyDeductions').style.display = (!isEopyy && isInvoice) ? 'block' : 'none';
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
    document.getElementById('entryNotes').value = entry.notes || '';

    // Load deductions
    const isEopyy = eopyyDeductionsManager.isEopyyEntry(entry);
    const deduction = eopyyDeductionsManager.getDeductions(entry.id);
    
    if (isEopyy && deduction) {
        document.getElementById('entryParakratisi').value = deduction.deductions.parakratisi || '';
        document.getElementById('entryMDE').value = deduction.deductions.mde || '';
        document.getElementById('entryRebate').value = deduction.deductions.rebate || '';
        document.getElementById('entryKrathseisEopyy').value = deduction.deductions.krathseis || '';
        document.getElementById('entryClawback').value = deduction.deductions.clawback || '';
    } else if (!isEopyy) {
        document.getElementById('entryKrathseisOther').value = entry.krathseis || '';
    }

    showModalDeductionFields();
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

    // Add deductions
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

// ========================================
// Initialization
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing Revenue Management System...');

    // Check CDN availability
    const cdnStatus = await cdnChecker.checkAll();
    STATE.cdnAvailable = !cdnStatus.offline;
    
    if (cdnStatus.offline) {
        cdnChecker.showOfflineNotice();
        console.warn('CDN libraries unavailable - some features disabled');
    }

    periodicChecker.start();

    await storage.init();
    await loadData();
    
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);

    renderSourcesAndInsurances();
    renderDashboard();

    setupDateAutoFormat(document.getElementById('quickDate'));
    setupDateAutoFormat(document.getElementById('entryDate'));
    setupDateAutoFormat(document.getElementById('filterDateFrom'));
    setupDateAutoFormat(document.getElementById('filterDateTo'));

    // Quick Add Form
    document.getElementById('quickAddForm').addEventListener('submit', async (e) => {
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
            e.target.reset();
            showToast(STRINGS.success.entrySaved, 'success');
            renderDashboard();
        }
    });

    // Type/Insurance change handlers
    document.getElementById('quickType').addEventListener('change', showDeductionFields);
    document.getElementById('quickInsurance').addEventListener('change', showDeductionFields);
    document.getElementById('entryType').addEventListener('change', showModalDeductionFields);
    document.getElementById('entryInsurance').addEventListener('change', showModalDeductionFields);

    // Dashboard toggles
    document.getElementById('dashPeriod').addEventListener('change', () => renderDashboard());
    document.getElementById('dashIncludeParakratisi').addEventListener('change', () => renderDashboard());

    // Navigation tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            
            tab.classList.add('active');
            const viewId = tab.getAttribute('data-view') + 'View';
            document.getElementById(viewId).classList.add('active');
            STATE.currentView = tab.getAttribute('data-view');

            if (STATE.currentView === 'entries') {
                renderEntriesTable();
            }
        });
    });

    // Filters
    document.getElementById('applyFiltersBtn').addEventListener('click', () => {
        STATE.filters = {
            dateFrom: document.getElementById('filterDateFrom').value,
            dateTo: document.getElementById('filterDateTo').value,
            source: document.getElementById('filterSource').value,
            insurance: document.getElementById('filterInsurance').value,
            type: document.getElementById('filterType').value
        };
        STATE.currentPage = 1;
        renderEntriesTable();
    });

    document.getElementById('clearFiltersBtn').addEventListener('click', () => {
        document.getElementById('filterDateFrom').value = '';
        document.getElementById('filterDateTo').value = '';
        document.getElementById('filterSource').value = '';
        document.getElementById('filterInsurance').value = '';
        document.getElementById('filterType').value = '';
        STATE.filters = {};
        STATE.currentPage = 1;
        renderEntriesTable();
    });

    // Add Entry Modal
    document.getElementById('addEntryBtn').addEventListener('click', () => {
        STATE.editingEntry = null;
        document.getElementById('modalTitle').textContent = 'Νέα Εγγραφή';
        document.getElementById('entryId').value = '';
        document.getElementById('entryDate').value = '';
        document.getElementById('entrySource').value = '';
        document.getElementById('entryInsurance').value = '';
        document.getElementById('entryType').value = 'cash';
        document.getElementById('entryAmount').value = '';
        document.getElementById('entryParakratisi').value = '';
        document.getElementById('entryMDE').value = '';
        document.getElementById('entryRebate').value = '';
        document.getElementById('entryKrathseisEopyy').value = '';
        document.getElementById('entryClawback').value = '';
        document.getElementById('entryKrathseisOther').value = '';
        document.getElementById('entryNotes').value = '';
        document.getElementById('modalEopyyDeductions').style.display = 'none';
        document.getElementById('modalNonEopyyDeductions').style.display = 'none';
        document.getElementById('entryModal').classList.add('active');
    });

    // CSV Export
    document.getElementById('exportCsvBtn').addEventListener('click', () => {
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

    // PDF Exports
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
            const filtered = applyFilters();
            await pdfExportManager.exportEntriesList(filtered, STATE.filters);
            showToast('PDF δημιουργήθηκε επιτυχώς!', 'success');
        } catch (error) {
            console.error('PDF export error:', error);
            showToast('Σφάλμα δημιουργίας PDF', 'error');
        }
    });

    // Backup & Import
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

    // Autosave
    const autosaveCheckbox = document.getElementById('autosaveEnabled');
    if (autosaveCheckbox) {
        const savedAutosave = localStorage.getItem('autosaveEnabled') === 'true';
        autosaveCheckbox.checked = savedAutosave;
        
        if (savedAutosave) {
            enableAutosave();
            updateAutosaveStatus();
        }

        autosaveCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                enableAutosave();
                localStorage.setItem('autosaveEnabled', 'true');
            } else {
                disableAutosave();
                localStorage.setItem('autosaveEnabled', 'false');
            }
            updateAutosaveStatus();
        });
    }

    function updateAutosaveStatus() {
        const status = getAutosaveStatus();
        const statusEl = document.getElementById('autosaveStatus');
        if (statusEl) {
            statusEl.innerHTML = `
                <p><strong>Κατάσταση:</strong> ${status.enabled ? '✅ Ενεργό' : '❌ Ανενεργό'}</p>
                ${status.enabled ? `
                    <p><strong>Τελευταία αποθήκευση:</strong> ${status.lastSaveFormatted}</p>
                    <p><strong>Εκκρεμείς αλλαγές:</strong> ${status.pendingChanges ? 'Ναι' : 'Όχι'}</p>
                ` : ''}
            `;
        }
    }

    // Storage info
    const storageInfo = storage.getStorageInfo();
    const storageInfoEl = document.getElementById('storageInfo');
    if (storageInfoEl) {
        storageInfoEl.innerHTML = `
            <p><strong>Στρατηγική:</strong> ${storageInfo.strategy === 'indexeddb' ? 'IndexedDB' : 'LocalStorage'}</p>
            ${storageInfo.estimate.quota > 0 ? `
                <p><strong>Χρήση:</strong> ${(storageInfo.estimate.usage / 1024 / 1024).toFixed(2)} MB / ${(storageInfo.estimate.quota / 1024 / 1024).toFixed(2)} MB (${storageInfo.estimate.percent.toFixed(1)}%)</p>
            ` : ''}
        `;
    }

    // Clear cache
document.getElementById('clearCacheBtn')?.addEventListener('click', async () => {
        const confirmed = confirm('⚠️ ΠΡΟΣΟΧΗ: Θα διαγραφούν ΟΛΟΙ οι τομείς αποθήκευσης!\n\n' +
            '- Όλες οι εγγραφές\n' +
            '- Διαγνωστικά και Ασφάλειες\n' +
            '- Ρυθμίσεις\n' +
            '- Cache\n\n' +
            'Η ενέργεια είναι ΜΟΝΙΜΗ και ΔΕΝ μπορεί να αναιρεθεί!\n\n' +
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

    // Theme toggle
    document.getElementById('themeToggle')?.addEventListener('click', () => {
        const current = document.body.getAttribute('data-theme');
        const newTheme = current === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });

    // Add new source
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

    // Add new insurance
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

    // Add source/insurance buttons in forms
    document.getElementById('addSourceBtn')?.addEventListener('click', async () => {
        const newSource = prompt('Νέο διαγνωστικό:');
        if (newSource && newSource.trim()) {
            STATE.sources.push(newSource.trim());
            await storage.saveSetting('sources', STATE.sources);
            renderSourcesAndInsurances();
            document.getElementById('quickSource').value = newSource.trim();
        }
    });

    document.getElementById('addInsuranceBtn')?.addEventListener('click', async () => {
        const newInsurance = prompt('Νέα ασφάλεια:');
        if (newInsurance && newInsurance.trim()) {
            STATE.insurances.push(newInsurance.trim());
            await storage.saveSetting('insurances', STATE.insurances);
            renderSourcesAndInsurances();
            document.getElementById('quickInsurance').value = newInsurance.trim();
        }
    });

    console.log('Revenue Management System initialized successfully!');
    console.log('CDN Status:', STATE.cdnAvailable ? 'Online' : 'Offline');
// Import CSV
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

    // Backup button
    document.getElementById('backupBtn')?.addEventListener('click', async () => {
        try {
            await exportBackup();
            showToast('Backup δημιουργήθηκε!', 'success');
        } catch (error) {
            showToast('Σφάλμα backup', 'error');
        }
    });
});
