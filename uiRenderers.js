/**
 * uiRenderers.js - UI Rendering Module (Minimal Working Version)
 */

import { STATE, CONFIG } from './state.js';
import eopyyDeductionsManager from './eopyyClawback.js';
import storage from './storage.js';
import { 
    escapeHtml, 
    formatCurrency, 
    compareDates,
    parseMonthYear,
    formatMonthYear
} from './utils.js';
import { applyFilters } from './filters.js';

// Toast Notifications
export function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = `toast toast-compact ${type} show`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Recent Entries Rendering
export function renderRecentEntries() {
    const tbody = document.getElementById('recentEntriesBody');
    if (!tbody) return;

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

// Charts Rendering
export function renderCharts(entries) {
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

    // Type Chart
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

    // Monthly Chart
    const monthlyCtx = document.getElementById('monthlyChart');
    if (monthlyCtx) {
        const monthlyData = {};
        entries.forEach(entry => {
            if (!monthlyData[entry.date]) monthlyData[entry.date] = 0;
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);
            monthlyData[entry.date] += amounts.finalAmount;
        });

        const sortedMonths = Object.keys(monthlyData).sort((a, b) => compareDates(a, b));
        const monthlyValues = sortedMonths.map(m => monthlyData[m]);

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

// Dashboard Rendering
export function renderDashboard() {
    const period = document.getElementById('dashPeriod')?.value || 'all';
    const includeParakratisi = document.getElementById('dashIncludeParakratisi')?.checked || false;
    
    let filtered = [...STATE.entries];
    const now = new Date();

    if (period === 'month') {
        const thisMonth = formatMonthYear(now.getMonth() + 1, now.getFullYear());
        filtered = filtered.filter(e => e.date === thisMonth);
    } else if (period === 'year') {
        const thisYear = now.getFullYear();
        filtered = filtered.filter(e => e.date.endsWith(`/${thisYear}`));
    }

    const kpis = eopyyDeductionsManager.calculateKPIs(filtered, { includeParakratisi });
    STATE.currentKPIs = kpis;

    // Update KPIs
    const updates = [
        ['kpiTotal', kpis.total],
        ['kpiEopyy', kpis.eopyyTotal],
        ['kpiOthers', kpis.nonEopyyTotal],
        ['kpiDeductions', kpis.eopyyTotalDeductions + kpis.nonEopyyKrathseis],
        ['kpiParakratisi', kpis.eopyyParakratisi],
        ['kpiMDE', kpis.eopyyMDE],
        ['kpiRebate', kpis.eopyyRebate],
        ['kpiKrathseis', kpis.eopyyKrathseis],
        ['kpiClawback', kpis.eopyyClawback]
    ];

    updates.forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatCurrency(value);
    });

    renderRecentEntries();
    renderCharts(filtered);
}

// Entries Table Rendering
export function renderEntriesTable() {
    const tbody = document.getElementById('entriesTableBody');
    if (!tbody) return;

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
        const deductionsPercent = amounts.originalAmount > 0 
            ? ((amounts.totalDeductions / amounts.originalAmount) * 100).toFixed(2) 
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
                <td class="text-right">${formatCurrency(amounts.totalDeductions)}</td>
                <td class="text-right">${deductionsPercent}%</td>
                <td colspan="2"></td>
            </tr>
        `;
    }).join('');

    renderPagination(filtered.length, totalPages);
}

// Pagination Rendering
export function renderPagination(totalItems, totalPages) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    
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

// Sources & Insurances Rendering
export function renderSourcesAndInsurances() {
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

// Sortable Setup
export function setupSortable(container, arrayName) {
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

export default {
    showToast,
    renderDashboard,
    renderRecentEntries,
    renderCharts,
    renderEntriesTable,
    renderPagination,
    renderSourcesAndInsurances,
    setupSortable
};