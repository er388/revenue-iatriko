/**
 * uiRenderers.js - UI Rendering Module
 * All rendering functions for dashboard, tables, charts, etc.
 * Version: 2.0 (Clean Rewrite)
 */

import { STATE, CONFIG } from './state.js';
import eopyyDeductionsManager from './eopyyClawback.js';
import storage from './storage.js';
import { 
    escapeHtml, 
    formatCurrency, 
    compareDates,
    parseMonthYear,
    formatMonthYear,
    formatPercent
} from './utils.js';

// ========================================
// Toast Notifications
// ========================================

/**
 * Show toast notification
 * @param {string} message - Message text
 * @param {string} type - 'success' | 'error' | 'warning' | 'info'
 */
export function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = `toast toast-compact ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, CONFIG.toastDuration);
}

// ========================================
// Dashboard Rendering
// ========================================

/**
 * Render complete dashboard (KPIs, charts, recent entries)
 */
export function renderDashboard() {
    const period = document.getElementById('dashPeriod')?.value || 'all';
    const includeParakratisi = document.getElementById('dashIncludeParakratisi')?.checked || false;
    
    // Filter entries by period
    let filtered = [...STATE.entries];
    const now = new Date();

    if (period === 'month') {
        const thisMonth = formatMonthYear(now.getMonth() + 1, now.getFullYear());
        filtered = filtered.filter(e => e.date === thisMonth);
    } else if (period === 'year') {
        const thisYear = now.getFullYear();
        filtered = filtered.filter(e => e.date.endsWith(`/${thisYear}`));
    }

    // Calculate KPIs
    const kpis = eopyyDeductionsManager.calculateKPIs(filtered, { includeParakratisi });
    STATE.currentKPIs = kpis;

    // Render KPI cards
    renderKPICards(kpis);
    
    // Render charts
    renderCharts(filtered);
    
    // Render recent entries
    renderRecentEntries();
}

/**
 * Render KPI cards with percentages
 * @param {Object} kpis - KPI data
 */
function renderKPICards(kpis) {
    const total = kpis.total;
    
    // Main KPIs
    updateKPI('kpiTotal', kpis.total, 100);
    updateKPI('kpiEopyy', kpis.eopyyTotal, (kpis.total > 0 ? (kpis.eopyyTotal / kpis.total) * 100 : 0));
    updateKPI('kpiOthers', kpis.nonEopyyTotal, (kpis.total > 0 ? (kpis.nonEopyyTotal / kpis.total) * 100 : 0));
    
    // Total deductions
    const totalDeductions = kpis.eopyyTotalDeductions + kpis.nonEopyyKrathseis;
    updateKPI('kpiDeductions', totalDeductions, (kpis.total > 0 ? (totalDeductions / kpis.total) * 100 : 0));
    
    // ΕΟΠΥΥ breakdown
    updateKPI('kpiParakratisi', kpis.eopyyParakratisi, (kpis.total > 0 ? (kpis.eopyyParakratisi / kpis.total) * 100 : 0));
    updateKPI('kpiMDE', kpis.eopyyMDE, (kpis.total > 0 ? (kpis.eopyyMDE / kpis.total) * 100 : 0));
    updateKPI('kpiRebate', kpis.eopyyRebate, (kpis.total > 0 ? (kpis.eopyyRebate / kpis.total) * 100 : 0));
    updateKPI('kpiKrathseis', kpis.eopyyKrathseis, (kpis.total > 0 ? (kpis.eopyyKrathseis / kpis.total) * 100 : 0));
    updateKPI('kpiClawback', kpis.eopyyClawback, (kpis.total > 0 ? (kpis.eopyyClawback / kpis.total) * 100 : 0));
}

/**
 * Update single KPI card
 * @param {string} elementId - KPI card ID
 * @param {number} value - KPI value
 * @param {number} percent - Percentage of total
 */
function updateKPI(elementId, value, percent) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    el.textContent = formatCurrency(value);
    
    // Update percentage display
    const percentElId = elementId + 'Percent';
    const percentEl = document.getElementById(percentElId);
    
    if (percentEl) {
        percentEl.textContent = formatPercent(percent);
        
        // Color coding based on context
        percentEl.className = 'kpi-percent';
        
        // Deduction percentages are negative (red)
        if (elementId.includes('Deductions') || 
            elementId.includes('Parakratisi') || 
            elementId.includes('MDE') || 
            elementId.includes('Rebate') || 
            elementId.includes('Krathseis') || 
            elementId.includes('Clawback')) {
            percentEl.classList.add('negative');
        } else if (percent > 0) {
            percentEl.classList.add('positive');
        } else {
            percentEl.classList.add('neutral');
        }
    }
}

/**
 * Render recent entries table (last 10)
 */
export function renderRecentEntries() {
    const tbody = document.getElementById('recentEntriesBody');
    if (!tbody) return;

    const recent = STATE.entries
        .sort((a, b) => compareDates(b.date, a.date))
        .slice(0, 10);

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
                <td class="text-right"><strong>${formatCurrency(amounts.finalAmount)}</strong></td>
            </tr>
        `;
    }).join('');
}

/**
 * Render charts (Pie chart + Monthly trend)
 * @param {Array} entries - Filtered entries
 */
export function renderCharts(entries) {
    if (!STATE.cdnAvailable || !window.Chart) {
        console.warn('[Charts] Chart.js not available');
        return;
    }

    // Calculate totals
    const eopyyTotal = entries
        .filter(e => eopyyDeductionsManager.isEopyyEntry(e))
        .reduce((sum, e) => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return sum + amounts.finalAmount;
        }, 0);
    
    const othersTotal = entries
        .filter(e => !eopyyDeductionsManager.isEopyyEntry(e))
        .reduce((sum, e) => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return sum + amounts.finalAmount;
        }, 0);

    renderTypeChart(eopyyTotal, othersTotal);
    renderMonthlyChart(entries);
}

/**
 * Render pie chart (ΕΟΠΥΥ vs Others)
 * @param {number} eopyyTotal - ΕΟΠΥΥ total
 * @param {number} othersTotal - Others total
 */
function renderTypeChart(eopyyTotal, othersTotal) {
    const ctx = document.getElementById('typeChart');
    if (!ctx) return;

    // Destroy existing chart
    if (STATE.charts.typeChart) {
        STATE.charts.typeChart.destroy();
    }
    
    STATE.charts.typeChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['ΕΟΠΥΥ', 'Άλλα Ταμεία'],
            datasets: [{
                data: [eopyyTotal, othersTotal],
                backgroundColor: [
                    CONFIG.chartColors.primary, 
                    CONFIG.chartColors.success
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    position: 'bottom',
                    labels: {
                        padding: 10,
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.label}: ${formatCurrency(context.parsed)}`
                    }
                }
            }
        }
    });
}

/**
 * Render monthly trend line chart
 * @param {Array} entries - Filtered entries
 */
function renderMonthlyChart(entries) {
    const ctx = document.getElementById('monthlyChart');
    if (!ctx) return;

    // Group by month
    const monthlyData = {};
    entries.forEach(entry => {
        if (!monthlyData[entry.date]) {
            monthlyData[entry.date] = 0;
        }
        const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);
        monthlyData[entry.date] += amounts.finalAmount;
    });

    // Sort by date
    const sortedMonths = Object.keys(monthlyData).sort(compareDates);
    const monthlyValues = sortedMonths.map(m => monthlyData[m]);

    // Destroy existing chart
    if (STATE.charts.monthlyChart) {
        STATE.charts.monthlyChart.destroy();
    }
    
    STATE.charts.monthlyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedMonths,
            datasets: [{
                label: 'Έσοδα',
                data: monthlyValues,
                borderColor: CONFIG.chartColors.primary,
                backgroundColor: CONFIG.chartColors.primary + '20',
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
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
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: (context) => formatCurrency(context.parsed.y)
                    }
                }
            }
        }
    });
}

// ========================================
// Entries Table Rendering
// ========================================

/**
 * Render entries table with filters, sorting, pagination
 */
export function renderEntriesTable() {
    const tbody = document.getElementById('entriesTableBody');
    if (!tbody) return;

    // Apply filters (stub for now - will implement filters.js later)
    const filtered = applyFiltersStub();
    
    // Apply sorting
    const sorted = applySorting(filtered);
    
    // Calculate pagination
    const totalPages = Math.ceil(sorted.length / STATE.pageSize);
    const start = (STATE.currentPage - 1) * STATE.pageSize;
    const end = start + STATE.pageSize;
    const pageEntries = sorted.slice(start, end);

    if (pageEntries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="15" class="text-center">Δεν υπάρχουν εγγραφές</td></tr>';
        renderPagination(0, 0);
        return;
    }

    // Render rows
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
                <td class="text-right">${isEopyy ? formatCurrency(amounts.parakratisi || 0) : '-'}</td>
                <td class="text-right">${isEopyy ? formatCurrency(amounts.mde || 0) : '-'}</td>
                <td class="text-right">${isEopyy ? formatCurrency(amounts.rebate || 0) : '-'}</td>
                <td class="text-right">${formatCurrency(amounts.krathseis || 0)}</td>
                <td class="text-right">${isEopyy ? formatCurrency(amounts.clawback || 0) : '-'}</td>
                <td class="text-right">${formatCurrency(deductionsAmount)}</td>
                <td class="text-right">${deductionsPercent}%</td>
                <td class="text-right"><strong>${formatCurrency(amounts.finalAmount)}</strong></td>
                <td>${entry.notes ? escapeHtml(entry.notes.substring(0, 20)) + (entry.notes.length > 20 ? '...' : '') : '-'}</td>
                <td>
                    <button class="btn-secondary btn-compact btn-sm" onclick="window.editEntry('${entry.id}')">✏️</button>
                    <button class="btn-danger btn-compact btn-sm" onclick="window.confirmDelete('${entry.id}')">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');

    renderPagination(sorted.length, totalPages);
}

/**
 * Temporary filter stub (will be replaced by filters.js)
 * @returns {Array} Filtered entries
 */
function applyFiltersStub() {
    let filtered = [...STATE.entries];
    
    // Apply basic filters from STATE.filters
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
    
    return filtered;
}

/**
 * Apply sorting based on STATE.sortColumn and STATE.sortDirection
 * @param {Array} entries - Entries to sort
 * @returns {Array} Sorted entries
 */
function applySorting(entries) {
    if (!STATE.sortColumn) {
        // Default: sort by date DESC
        return entries.sort((a, b) => compareDates(b.date, a.date));
    }
    
    const sorted = [...entries].sort((a, b) => {
        let aVal, bVal;
        
        switch (STATE.sortColumn) {
            case 'date':
                return compareDates(a.date, b.date);
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
            case 'originalAmount':
                aVal = parseFloat(a.originalAmount || a.amount);
                bVal = parseFloat(b.originalAmount || b.amount);
                break;
            case 'finalAmount':
                const amountsA = eopyyDeductionsManager.getAmountsBreakdown(a);
                const amountsB = eopyyDeductionsManager.getAmountsBreakdown(b);
                aVal = amountsA.finalAmount;
                bVal = amountsB.finalAmount;
                break;
            default:
                return 0;
        }
        
        if (aVal < bVal) return -1;
        if (aVal > bVal) return 1;
        return 0;
    });
    
    // Apply direction
    return STATE.sortDirection === 'desc' ? sorted.reverse() : sorted;
}

/**
 * Render pagination controls
 * @param {number} totalItems - Total number of items
 * @param {number} totalPages - Total number of pages
 */
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

    // Show max 5 page buttons
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
    
    html += `<span class="pagination-info">Σελίδα ${STATE.currentPage} από ${totalPages} (${totalItems} εγγραφές)</span>`;

    pagination.innerHTML = html;
}

// ========================================
// Sources & Insurances Rendering
// ========================================

/**
 * Render sources and insurances dropdowns + settings lists
 */
export function renderSourcesAndInsurances() {
    // Update all source dropdowns
    const sourceSelects = ['quickSource', 'filterSource', 'entrySource'];
    sourceSelects.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        
        const currentValue = select.value;
        const isFilter = id.startsWith('filter');
        
        select.innerHTML = isFilter 
            ? '<option value="">Όλα</option>' 
            : '<option value="">Επιλογή...</option>';
        
        STATE.sources.forEach(source => {
            select.innerHTML += `<option value="${escapeHtml(source)}">${escapeHtml(source)}</option>`;
        });
        
        select.value = currentValue;
    });

    // Update all insurance dropdowns
    const insuranceSelects = ['quickInsurance', 'filterInsurance', 'entryInsurance'];
    insuranceSelects.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        
        const currentValue = select.value;
        const isFilter = id.startsWith('filter');
        
        select.innerHTML = isFilter 
            ? '<option value="">Όλες</option>' 
            : '<option value="">Επιλογή...</option>';
        
        STATE.insurances.forEach(insurance => {
            select.innerHTML += `<option value="${escapeHtml(insurance)}">${escapeHtml(insurance)}</option>`;
        });
        
        select.value = currentValue;
    });

    // Render settings lists (sortable)
    renderSourcesList();
    renderInsurancesList();
}

/**
 * Render sources list in settings (sortable)
 */
function renderSourcesList() {
    const sourcesList = document.getElementById('sourcesList');
    if (!sourcesList) return;

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

/**
 * Render insurances list in settings (sortable)
 */
function renderInsurancesList() {
    const insurancesList = document.getElementById('insurancesList');
    if (!insurancesList) return;

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

/**
 * Setup drag & drop for sortable lists
 * @param {HTMLElement} container - Container element
 * @param {string} arrayName - STATE array name ('sources' | 'insurances')
 */
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
        const afterElement = getDragAfterElement(container, e.clientY);
        if (afterElement == null) {
            container.appendChild(draggedItem);
        } else {
            container.insertBefore(draggedItem, afterElement);
        }
    });
    
    container.addEventListener('drop', async (e) => {
        e.preventDefault();
        
        // Get new order
        const items = [...container.querySelectorAll('.sortable-item')];
        const newOrder = items.map(item => item.querySelector('.item-text').textContent.trim());
        
        // Update STATE
        STATE[arrayName] = newOrder;
        
        // Save to storage
        await storage.saveSetting(arrayName, newOrder);
        
        // Re-render
        renderSourcesAndInsurances();
        
        showToast(`Η σειρά ενημερώθηκε`, 'success');
    });
}

/**
 * Helper function for drag & drop
 * @param {HTMLElement} container - Container
 * @param {number} y - Mouse Y position
 * @returns {HTMLElement|null} Element after which to insert
 */
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
// Column Sorting Setup
// ========================================

/**
 * Setup sortable table columns
 */
export function setupTableSorting() {
    const headers = document.querySelectorAll('.data-table th[data-sortable]');
    
    headers.forEach(header => {
        header.style.cursor = 'pointer';
        
        header.addEventListener('click', () => {
            const column = header.getAttribute('data-sortable');
            
            // Toggle sort direction
            if (STATE.sortColumn === column) {
                STATE.sortDirection = STATE.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                STATE.sortColumn = column;
                STATE.sortDirection = 'asc';
            }
            
            // Update header indicators
            headers.forEach(h => {
                h.classList.remove('sort-asc', 'sort-desc');
            });
            
            header.classList.add(`sort-${STATE.sortDirection}`);
            
            // Re-render table
            renderEntriesTable();
        });
    });
}

// ========================================
// Export All
// ========================================
export default {
    showToast,
    renderDashboard,
    renderRecentEntries,
    renderCharts,
    renderEntriesTable,
    renderPagination,
    renderSourcesAndInsurances,
    setupSortable,
    setupTableSorting
};