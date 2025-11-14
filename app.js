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
        STATE.sources = (await storage.loadSetting('sources')) || STATE.sources;
        STATE.insurances = (await storage.loadSetting('insurances')) || STATE.insurances;
        STATE.userLabel = (await storage.loadSetting('userLabel')) || STATE.userLabel;
        STATE.undoStack = await storage.loadUndoActions();
        
        const savedThreshold = await storage.loadSetting('autosaveThreshold');
        if (savedThreshold) {
            STATE.autosaveThreshold = savedThreshold;
            document.getElementById('autosaveThreshold').value = savedThreshold;
        }
        
        const savedPageSize = await storage.loadSetting('pageSize');
        if (savedPageSize) {
            STATE.pageSize = savedPageSize;
            CONFIG.pageSize = savedPageSize;
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
    const period = document.getElementById('dashPeriod').value;
    const includeParakratisi = document.getElementById('dashIncludeParakratisi').checked;
    const filtered = filterEntriesByPeriod(STATE.entries, period);

    const kpis = eopyyDeductionsManager.calculateKPIs(filtered, { includeParakratisi });
    STATE.currentKPIs = kpis;

    // Calculate percentages
    const totalOriginal = filtered.reduce((sum, e) => {
        const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
        return sum + amounts.originalAmount;
    }, 0);

    document.getElementById('kpiTotal').innerHTML = `
        <div class="kpi-header"><div class="kpi-label">Συνολικά</div></div>
        <div class="kpi-content">
            <div class="kpi-amount">${formatCurrency(kpis.total)}</div>
            <div class="kpi-percent">${((kpis.total / totalOriginal) * 100).toFixed(2)}%</div>
        </div>
    `;
    
    document.getElementById('kpiEopyy').innerHTML = `
        <div class="kpi-header"><div class="kpi-label">ΕΟΠΥΥ</div></div>
        <div class="kpi-content">
            <div class="kpi-amount">${formatCurrency(kpis.eopyyTotal)}</div>
            <div class="kpi-percent">${((kpis.eopyyTotal / totalOriginal) * 100).toFixed(2)}%</div>
        </div>
    `;
    
    document.getElementById('kpiOthers').innerHTML = `
        <div class="kpi-header"><div class="kpi-label">Άλλα</div></div>
        <div class="kpi-content">
            <div class="kpi-amount">${formatCurrency(kpis.nonEopyyTotal)}</div>
            <div class="kpi-percent">${((kpis.nonEopyyTotal / totalOriginal) * 100).toFixed(2)}%</div>
        </div>
    `;
    
    document.getElementById('kpiDeductions').innerHTML = `
        <div class="kpi-header"><div class="kpi-label">Κρατήσεις</div></div>
        <div class="kpi-content">
            <div class="kpi-amount">${formatCurrency(kpis.eopyyTotalDeductions + kpis.nonEopyyKrathseis)}</div>
            <div class="kpi-percent">${(((kpis.eopyyTotalDeductions + kpis.nonEopyyKrathseis) / totalOriginal) * 100).toFixed(2)}%</div>
        </div>
    `;

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
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing Revenue Management System v5...');

    const cdnStatus = await cdnChecker.checkAll();
    STATE.cdnAvailable = !cdnStatus.offline;
    
    if (cdnStatus.offline) {
        cdnChecker.showOfflineNotice();
    }

    periodicChecker.start();

    await storage.init();
    await autoLoadBackup();
    await loadData();

    // Make modals draggable
    makeModalDraggable('entryModal');
    makeModalDraggable('importBackupModal');

    // Set default to "Όλα"
    document.getElementById('dashPeriod').value = 'all';
    
    // Set default without Παρακράτηση
    document.getElementById('dashIncludeParakratisi').checked = false;

    renderDashboard();
    
    // Setup percentage sync
    const getQuickAmount = () => parseFloat(document.getElementById('quickAmount').value) || 0;
    setupPercentageSync('quickParakratisi', 'quickParakratisiPercent', getQuickAmount);
    setupPercentageSync('quickMDE', 'quickMDEPercent', getQuickAmount);
    setupPercentageSync('quickRebate', 'quickRebatePercent', getQuickAmount);
    setupPercentageSync('quickKrathseisEopyy', 'quickKrathseisEopyyPercent', getQuickAmount);
    setupPercentageSync('quickClawback', 'quickClawbackPercent', getQuickAmount);
    setupPercentageSync('quickKrathseisOther', 'quickKrathseisOtherPercent', getQuickAmount);
    
    const getModalAmount = () => parseFloat(document.getElementById('entryAmount').value) || 0;
    setupPercentageSync('entryParakratisi', 'entryParakratisiPercent', getModalAmount);
    setupPercentageSync('entryMDE', 'entryMDEPercent', getModalAmount);
    setupPercentageSync('entryRebate', 'entryRebatePercent', getModalAmount);
    setupPercentageSync('entryKrathseisEopyy', 'entryKrathseisEopyyPercent', getModalAmount);
    setupPercentageSync('entryClawback', 'entryClawbackPercent', getModalAmount);
    setupPercentageSync('entryKrathseisOther', 'entryKrathseisOtherPercent', getModalAmount);

    // Quick form submit - clear final amount after
    document.getElementById('quickAddForm').addEventListener('submit', async (e) => {
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
            document.getElementById('quickAmount').value = '';
            document.getElementById('quickNotes').value = '';
            document.getElementById('quickNotesToggle').checked = false;
            document.getElementById('quickNotes').style.display = 'none';
            
            // Clear all deduction fields AND FINAL AMOUNT
            ['quickParakratisi', 'quickParakratisiPercent', 'quickMDE', 'quickMDEPercent', 
             'quickRebate', 'quickRebatePercent', 'quickKrathseisEopyy', 'quickKrathseisEopyyPercent',
             'quickClawback', 'quickClawbackPercent', 'quickKrathseisOther', 'quickKrathseisOtherPercent'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            
            document.getElementById('quickFinalAmount').textContent = '€ 0,00';
            
            showToast(STRINGS.success.entrySaved, 'success');
            renderDashboard();
        }
    });

    console.log('Revenue Management System v5 initialized!');
});
