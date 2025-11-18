/**
 * uiRenderers.js - UI Rendering Module (FIXED)
 * All rendering functions for dashboard, tables, charts, etc.
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

// ========================================
// Toast Notifications
// ========================================

export function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = `toast toast-compact ${type} show`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ========================================
// Dashboard Rendering
// ========================================

export function renderDashboard() {
    console.log('renderDashboard called, entries:', STATE.entries.length);
    
    const period = document.getElementById('dashPeriod')?.value || 'all';
    const includeParakratisi = document.getElementById('dashIncludeParakratisi')?.checked || false;
    const filtered = filterEntriesByPeriod(STATE.entries, period);

    console.log('Filtered entries:', filtered.length);

    const kpis = eopyyDeductionsManager.calculateKPIs(filtered, { includeParakratisi });
    STATE.currentKPIs = kpis;

    console.log('KPIs calculated:', kpis);

    // Calculate percentages for each KPI
    const total = kpis.total;
    const percentages = {
        total: 100,
        eopyy: total > 0 ? (kpis.eopyyTotal / total) * 100 : 0,
        others: total > 0 ? (kpis.nonEopyyTotal / total) * 100 : 0,
        deductions: total > 0 ? ((kpis.eopyyTotalDeductions + kpis.nonEopyyKrathseis) / total) * 100 : 0,
        parakratisi: kpis.eopyyOriginal > 0 ? (kpis.eopyyParakratisi / kpis.eopyyOriginal) * 100 : 0,
        mde: kpis.eopyyOriginal > 0 ? (kpis.eopyyMDE / kpis.eopyyOriginal) * 100 : 0,
        rebate: kpis.eopyyOriginal > 0 ? (kpis.eopyyRebate / kpis.eopyyOriginal) * 100 : 0,
        krathseis: kpis.eopyyOriginal > 0 ? (kpis.eopyyKrathseis / kpis.eopyyOriginal) * 100 : 0,
        clawback: kpis.eopyyOriginal > 0 ? (kpis.eopyyClawback / kpis.eopyyOriginal) * 100 : 0
    };

    // Update KPI cards
    updateKPICard('kpiTotal', 'Συνολικά', kpis.total, percentages.total);
    updateKPICard('kpiEopyy', 'ΕΟΠΥΥ', kpis.eopyyTotal, percentages.eopyy);
    updateKPICard('kpiOthers', 'Άλλα', kpis.nonEopyyTotal, percentages.others);
    updateKPICard('kpiDeductions', 'Κρατήσεις', kpis.eopyyTotalDeductions + kpis.nonEopyyKrathseis, percentages.deductions);
    updateKPICard('kpiParakratisi', 'Παρακράτηση', kpis.eopyyParakratisi, percentages.parakratisi);
    updateKPICard('kpiMDE', 'ΜΔΕ', kpis.eopyyMDE, percentages.mde);
    updateKPICard('kpiRebate', 'Rebate', kpis.eopyyRebate, percentages.rebate);
    updateKPICard('kpiKrathseis', 'Κρατήσεις', kpis.eopyyKrathseis, percentages.krathseis);
    updateKPICard('kpiClawback', 'Clawback', kpis.eopyyClawback, percentages.clawback);

    renderRecentEntries();
    renderCharts(filtered);
    
    console.log('Dashboard rendered successfully');
}

function updateKPICard(id, label, amount, percentage) {
    const container = document.getElementById(id);
    if (!container) {
        console.warn(`KPI card not found: ${id}`);
        return;
    }
    
    container.innerHTML = `
        <div class="kpi-label">${escapeHtml(label)}</div>
        <div class="kpi-content">
            <div class="kpi-value">${formatCurrency(amount)}</div>
            <div class="kpi-percentage">${percentage.toFixed(2)}%</div>
        </div>
    `;
    
    console.log(`Updated KPI card: ${id}`, { label, amount, percentage });
}

function filterEntriesByPeriod(entries, period) {
    const now = new Date();
    let filtered = [...entries];