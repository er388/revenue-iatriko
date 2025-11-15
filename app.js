/**
 * app.js - Main Application File v3
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
import { STATE, CONFIG } from './state.js';
import { loadData, saveData, addEntry, deleteEntry, setShowToast } from './dataManager.js';

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

// Register showToast με το dataManager
setShowToast(showToast);

// ========================================
// UI Rendering
// ========================================
function renderDashboard() {
    const period = document.getElementById('dashPeriod').value;
    const includeParakratisi = document.getElementById('dashIncludeParakratisi').checked;
    const filtered = filterEntriesByPeriod(STATE.entries, period);

    const kpis = eopyyDeductionsManager.calculateKPIs(filtered, { includeParakratisi });
    STATE.currentKPIs = kpis;

    document.getElementById('kpiTotal').textContent = formatCurrency(kpis.total);
    document.getElementById('kpiEopyy').textContent = formatCurrency(kpis.eopyyTotal);
    document.getElementById('kpiOthers').textContent = formatCurrency(kpis.nonEopyyTotal);
    document.getElementById('kpiDeductions').textContent = formatCurrency(kpis.eopyyTotalDeductions + kpis.nonEopyyKrathseis);

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
        monthlyData[entry.date] += amounts.finalAmount;
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
    
    const totalPages = Math.ceil(filtered.length / CONFIG.pageSize);
    const start = (STATE.currentPage - 1) * CONFIG.pageSize;
    const end = start + CONFIG.pageSize;
    const pageEntries = filtered.slice(start, end);

    if (pageEntries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">Δεν υπάρχουν εγγραφές</td></tr>';
        renderPagination(0, 0);
        return;
    }

    tbody.innerHTML = pageEntries.map(entry => {
        const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);
        const isEopyy = eopyyDeductionsManager.isEopyyEntry(entry);
        
        const deductionsAmount = amounts.totalDeductions;
        const deductionsPercent = amounts.originalAmount > 0 
            ? ((deductionsAmount / amounts.originalAmount) * 100).toFixed(2) 
            : '0.00';
        
        return `
            <tr>
                <td>${escapeHtml(entry.date)}</td>
                <td>${escapeHtml(entry.source)}</td>
                <td>${escapeHtml(entry.insurance)}</td>
                <td>${entry.type === 'cash' ? 'Μετρητά' : 'Τιμολόγια'}</td>
                <td class="text-right">${formatCurrency(amounts.originalAmount)}</td>
                <td class="text-right"><strong>${formatCurrency(amounts.finalAmount)}</strong></td>
                <td>${entry.notes ? escapeHtml(entry.notes.substring(0, 20)) : '-'}</td>
                <td>
                    <button class="btn-secondary btn-compact btn-sm" onclick="window.editEntry('${entry.id}')">✏️</button>
                    <button class="btn-danger btn-compact btn-sm" onclick="window.confirmDelete('${entry.id}')">🗑️</button>
                </td>
            </tr>
            <tr class="deductions-row">
                <td colspan="4"></td>
                <td class="text-right">${formatCurrency(deductionsAmount)}</td>
                <td class="text-right">${deductionsPercent}%</td>
                <td colspan="2"></td>
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
    const sourceSelects = ['quickSource', 'filterSource', 'entrySource'];
    sourceSelects.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const currentValue = select.value;
        select.innerHTML = id.startsWith('filter') ? '<option value="">Όλα</option>' : '<option value="">Επιλογή...</option>';
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
        sourcesList.innerHTML = STATE.sources.map((source, index) => `
            <div class="sortable-item" draggable="true" data-index="${index}" data-type="source">
                <span class="drag-handle">☰</span>
                <span class="item-text">${escapeHtml(source)}</span>
                <div class="item-actions">
                    <button onclick="window.removeSource('${escapeHtml(source).replace(/'/g, "\\'")}')">×</button>
                </div>
            </div>
        `).join('');
        setupSortable(sourcesList, 'sources');
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
        setupSortable(insurancesList, 'insurances');
    }
}

function setupSortable(container, arrayName) {
    let draggedItem = null;
    
    container.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('sortable-item')) {
            draggedItem = e.target;
            e.target.style.opacity = '0.5';
        }
    });
    
    container.addEventListener('dragend', (e) => {
        if (e.target.classList.contains('sortable-item')) {
            e.target.style.opacity = '1';
        }
    });
    
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        if (afterElement == null) {
            container.appendChild(draggedItem);
        } else {
            container.insertBefore(draggedItem, afterElement);
        }
    });
    
    container.addEventListener('drop', async (e) => {
        e.preventDefault();
        const items = [...container.querySelectorAll('.sortable-item')];
        const newOrder = items.map(item => item.querySelector('.item-text').textContent.trim());
        STATE[arrayName] = newOrder;
        await storage.saveSetting(arrayName, newOrder);
        renderSourcesAndInsurances();
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.sortable-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
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
// Initialization
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing Revenue Management System v3...');

    const cdnStatus = await cdnChecker.checkAll();
    STATE.cdnAvailable = !cdnStatus.offline;
    
    if (cdnStatus.offline) {
        cdnChecker.showOfflineNotice();
        console.warn('CDN libraries unavailable - some features disabled');
    }

    periodicChecker.start();

    await storage.init();
    await loadData();

    renderSourcesAndInsurances();
    renderDashboard();

    setupDateAutoFormat(document.getElementById('quickDate'));
    setupDateAutoFormat(document.getElementById('entryDate'));
    setupDateAutoFormat(document.getElementById('filterDateFrom'));
    setupDateAutoFormat(document.getElementById('filterDateTo'));

    // Setup percentage sync for quick form
    const getQuickAmount = () => parseFloat(document.getElementById('quickAmount').value) || 0;
    setupPercentageSync('quickParakratisi', 'quickParakratisiPercent', getQuickAmount);
    setupPercentageSync('quickMDE', 'quickMDEPercent', getQuickAmount);
    setupPercentageSync('quickRebate', 'quickRebatePercent', getQuickAmount);
    setupPercentageSync('quickKrathseisEopyy', 'quickKrathseisEopyyPercent', getQuickAmount);
    setupPercentageSync('quickClawback', 'quickClawbackPercent', getQuickAmount);
    setupPercentageSync('quickKrathseisOther', 'quickKrathseisOtherPercent', getQuickAmount);
    
    // Setup percentage sync for modal
    const getModalAmount = () => parseFloat(document.getElementById('entryAmount').value) || 0;
    setupPercentageSync('entryParakratisi', 'entryParakratisiPercent', getModalAmount);
    setupPercentageSync('entryMDE', 'entryMDEPercent', getModalAmount);
    setupPercentageSync('entryRebate', 'entryRebatePercent', getModalAmount);
    setupPercentageSync('entryKrathseisEopyy', 'entryKrathseisEopyyPercent', getModalAmount);
    setupPercentageSync('entryClawback', 'entryClawbackPercent', getModalAmount);
    setupPercentageSync('entryKrathseisOther', 'entryKrathseisOtherPercent', getModalAmount);
    
    // Notes toggle
    document.getElementById('quickNotesToggle')?.addEventListener('change', (e) => {
        document.getElementById('quickNotes').style.display = e.target.checked ? 'block' : 'none';
    });
    
    document.getElementById('entryNotesToggle')?.addEventListener('change', (e) => {
        document.getElementById('entryNotes').style.display = e.target.checked ? 'block' : 'none';
    });
    
    // Dark mode toggle
    document.getElementById('darkModeToggle')?.addEventListener('change', (e) => {
        document.body.setAttribute('data-theme', e.target.checked ? 'dark' : 'light');
        localStorage.setItem('theme', e.target.checked ? 'dark' : 'light');
    });
    
    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    if (document.getElementById('darkModeToggle')) {
        document.getElementById('darkModeToggle').checked = savedTheme === 'dark';
    }
    
    // Remember last selections
    ['quickSource', 'quickInsurance', 'quickType'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const savedValue = localStorage.getItem(`last_${id}`);
            if (savedValue) el.value = savedValue;
            
            el.addEventListener('change', () => {
                localStorage.setItem(`last_${id}`, el.value);
            });
        }
    });

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
            // Clear only amount and notes, keep selections
            document.getElementById('quickAmount').value = '';
            document.getElementById('quickNotes').value = '';
            document.getElementById('quickNotesToggle').checked = false;
            document.getElementById('quickNotes').style.display = 'none';
            
            // Clear deduction fields
            ['quickParakratisi', 'quickParakratisiPercent', 'quickMDE', 'quickMDEPercent', 
             'quickRebate', 'quickRebatePercent', 'quickKrathseisEopyy', 'quickKrathseisEopyyPercent',
             'quickClawback', 'quickClawbackPercent', 'quickKrathseisOther', 'quickKrathseisOtherPercent'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            
            showToast(STRINGS.success.entrySaved, 'success');
            renderDashboard();
        }
    });

    // Type/Insurance change handlers
    document.getElementById('quickType')?.addEventListener('change', showDeductionFields);
    document.getElementById('quickInsurance')?.addEventListener('change', showDeductionFields);
    document.getElementById('quickAmount')?.addEventListener('input', () => calculateFinalAmount('quick'));
    
    document.getElementById('entryType')?.addEventListener('change', showModalDeductionFields);
    document.getElementById('entryInsurance')?.addEventListener('change', showModalDeductionFields);
    document.getElementById('entryAmount')?.addEventListener('input', () => calculateFinalAmount('entry'));

    // Dashboard toggles
    document.getElementById('dashPeriod')?.addEventListener('change', () => renderDashboard());
    document.getElementById('dashIncludeParakratisi')?.addEventListener('change', () => renderDashboard());

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
    document.getElementById('applyFiltersBtn')?.addEventListener('click', () => {
        STATE.filters = {
            dateFrom: document.getElementById('filterDateFrom').value,
            dateTo: document.getElementById('filterDateTo').value,
            source: document.getElementById('filterSource').value,
            insurance: document.getElementById('filterInsurance').value,
            type: document.getElementById('filterType').value,
            amountFrom: document.getElementById('filterAmountFrom').value,
            amountTo: document.getElementById('filterAmountTo').value,
            deductionPercentFrom: document.getElementById('filterDeductionPercentFrom').value,
            deductionPercentTo: document.getElementById('filterDeductionPercentTo').value
        };
        STATE.currentPage = 1;
        renderEntriesTable();
    });

    document.getElementById('clearFiltersBtn')?.addEventListener('click', () => {
        ['filterDateFrom', 'filterDateTo', 'filterSource', 'filterInsurance', 'filterType',
         'filterAmountFrom', 'filterAmountTo', 'filterDeductionPercentFrom', 'filterDeductionPercentTo'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        STATE.filters = {};
        STATE.currentPage = 1;
        renderEntriesTable();
    });

    // Add Entry Modal
    document.getElementById('addEntryBtn')?.addEventListener('click', () => {
        STATE.editingEntry = null;
        document.getElementById('modalTitle').textContent = 'Νέα Εγγραφή';
        document.getElementById('entryId').value = '';
        document.getElementById('entryDate').value = '';
        
        // Keep last selections
        const lastSource = localStorage.getItem('last_quickSource');
        const lastInsurance = localStorage.getItem('last_quickInsurance');
        const lastType = localStorage.getItem('last_quickType') || 'cash';
        
        if (lastSource) document.getElementById('entrySource').value = lastSource;
        if (lastInsurance) document.getElementById('entryInsurance').value = lastInsurance;
        document.getElementById('entryType').value = lastType;
        
        document.getElementById('entryAmount').value = '';
        ['entryParakratisi', 'entryParakratisiPercent', 'entryMDE', 'entryMDEPercent',
         'entryRebate', 'entryRebatePercent', 'entryKrathseisEopyy', 'entryKrathseisEopyyPercent',
         'entryClawback', 'entryClawbackPercent', 'entryKrathseisOther', 'entryKrathseisOtherPercent'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        
        document.getElementById('entryNotes').value = '';
        document.getElementById('entryNotesToggle').checked = false;
        document.getElementById('entryNotes').style.display = 'none';
        document.getElementById('modalEopyyDeductions').style.display = 'none';
        document.getElementById('modalNonEopyyDeductions').style.display = 'none';
        document.getElementById('entryModal').classList.add('active');
    });

    // CSV Export
    document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
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

        autosaveCheckbox.addEventListener('change', (e) => {
            localStorage.setItem('autosaveEnabled', e.target.checked ? 'true' : 'false');
            showToast(e.target.checked ? 'Autosave ενεργοποιήθηκε' : 'Autosave απενεργοποιήθηκε', 'info');
        });
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

    console.log('Revenue Management System v3 initialized successfully!');
    console.log('CDN Status:', STATE.cdnAvailable ? 'Online' : 'Offline');
    console.log('Change Counter for Autosave: Active (every 5 changes)');
});