/**
 * comparison.js - Period Comparison Module
 * Î£ÏÎ³ÎºÏÎ¹ÏƒÎ· Ï€ÎµÏÎ¹ÏŒÎ´Ï‰Î½ Î¼Îµ side-by-side KPIs ÎºÎ±Î¹ trend analysis
 */

import {
    parseMonthYear,
    formatMonthYear,
    formatCurrency,
    calculatePercentChange,
    formatPercent,
    compareDates,
    generateDateRange,
    sumBy,
    groupBy
} from './utils.js';

// ========================================
// Period Definitions
// ========================================
const PERIOD_PRESETS = {
    currentMonth: () => {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        return {
            start: formatMonthYear(month, year),
            end: formatMonthYear(month, year)
        };
    },
    previousMonth: () => {
        const now = new Date();
        let month = now.getMonth(); // 0-11
        let year = now.getFullYear();
        
        if (month === 0) {
            month = 12;
            year--;
        }
        
        return {
            start: formatMonthYear(month, year),
            end: formatMonthYear(month, year)
        };
    },
    currentQuarter: () => {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        
        const quarter = Math.ceil(month / 3);
        const startMonth = (quarter - 1) * 3 + 1;
        const endMonth = quarter * 3;
        
        return {
            start: formatMonthYear(startMonth, year),
            end: formatMonthYear(endMonth, year)
        };
    },
    previousQuarter: () => {
        const now = new Date();
        const month = now.getMonth() + 1;
        let year = now.getFullYear();
        
        let quarter = Math.ceil(month / 3) - 1;
        if (quarter === 0) {
            quarter = 4;
            year--;
        }
        
        const startMonth = (quarter - 1) * 3 + 1;
        const endMonth = quarter * 3;
        
        return {
            start: formatMonthYear(startMonth, year),
            end: formatMonthYear(endMonth, year)
        };
    },
    currentYear: () => {
        const now = new Date();
        const year = now.getFullYear();
        return {
            start: formatMonthYear(1, year),
            end: formatMonthYear(12, year)
        };
    },
    previousYear: () => {
        const now = new Date();
        const year = now.getFullYear() - 1;
        return {
            start: formatMonthYear(1, year),
            end: formatMonthYear(12, year)
        };
    },
    sameLastYear: () => {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear() - 1;
        return {
            start: formatMonthYear(month, year),
            end: formatMonthYear(month, year)
        };
    }
};

// ========================================
// Comparison Class
// ========================================
class PeriodComparison {
    constructor(entries) {
        this.entries = entries;
    }

    /**
     * Filter entries Î³Î¹Î± ÏƒÏ…Î³ÎºÎµÎºÏÎ¹Î¼Î­Î½Î· Ï€ÎµÏÎ¯Î¿Î´Î¿
     * @param {string} startDate - Start date (MM/YYYY)
     * @param {string} endDate - End date (MM/YYYY)
     * @returns {Array}
     */
    filterByPeriod(startDate, endDate) {
        return this.entries.filter(entry => {
            return compareDates(entry.date, startDate) >= 0 &&
                   compareDates(entry.date, endDate) <= 0;
        });
    }

    /**
     * Calculate KPIs Î³Î¹Î± Ï€ÎµÏÎ¯Î¿Î´Î¿
     * @param {Array} entries - Filtered entries
     * @returns {Object}
     */
    calculateKPIs(entries) {
        const total = sumBy(entries, e => parseFloat(e.netAmount) || parseFloat(e.amount));
        const cash = sumBy(entries.filter(e => e.type === 'cash'), e => parseFloat(e.netAmount) || parseFloat(e.amount));
        const invoices = sumBy(entries.filter(e => e.type === 'invoice'), e => parseFloat(e.netAmount) || parseFloat(e.amount));
        const retentions = sumBy(entries, e => parseFloat(e.retentionAmount) || 0);
        
        // Group by source
        const bySource = groupBy(entries, 'source');
        const topSources = Object.entries(bySource)
            .map(([source, items]) => ({
                source,
                amount: sumBy(items, e => parseFloat(e.netAmount) || parseFloat(e.amount)),
                count: items.length
            }))
            .sort((a, b) => b.amount - a.amount);

        // Group by insurance
        const byInsurance = groupBy(entries, 'insurance');
        const topInsurances = Object.entries(byInsurance)
            .map(([insurance, items]) => ({
                insurance,
                amount: sumBy(items, e => parseFloat(e.netAmount) || parseFloat(e.amount)),
                count: items.length
            }))
            .sort((a, b) => b.amount - a.amount);

        // Monthly breakdown
        const monthlyData = groupBy(entries, 'date');
        const monthlyTotals = Object.entries(monthlyData)
            .map(([date, items]) => ({
                date,
                amount: sumBy(items, e => parseFloat(e.netAmount) || parseFloat(e.amount)),
                count: items.length
            }))
            .sort((a, b) => compareDates(a.date, b.date));

        return {
            total,
            cash,
            invoices,
            retentions,
            count: entries.length,
            avgPerEntry: entries.length > 0 ? total / entries.length : 0,
            topSources: topSources.slice(0, 5),
            topInsurances: topInsurances.slice(0, 5),
            monthlyTotals
        };
    }

    /**
     * Compare Î´ÏÎ¿ Ï€ÎµÏÎ¹ÏŒÎ´Î¿Ï…Ï‚
     * @param {Object} period1 - {start, end, label}
     * @param {Object} period2 - {start, end, label}
     * @returns {Object}
     */
    comparePeriods(period1, period2) {
        const entries1 = this.filterByPeriod(period1.start, period1.end);
        const entries2 = this.filterByPeriod(period2.start, period2.end);

        const kpis1 = this.calculateKPIs(entries1);
        const kpis2 = this.calculateKPIs(entries2);

        // Calculate changes
        const changes = {
            total: {
                value: kpis2.total - kpis1.total,
                percent: calculatePercentChange(kpis1.total, kpis2.total)
            },
            cash: {
                value: kpis2.cash - kpis1.cash,
                percent: calculatePercentChange(kpis1.cash, kpis2.cash)
            },
            invoices: {
                value: kpis2.invoices - kpis1.invoices,
                percent: calculatePercentChange(kpis1.invoices, kpis2.invoices)
            },
            retentions: {
                value: kpis2.retentions - kpis1.retentions,
                percent: calculatePercentChange(kpis1.retentions, kpis2.retentions)
            },
            count: {
                value: kpis2.count - kpis1.count,
                percent: calculatePercentChange(kpis1.count, kpis2.count)
            },
            avgPerEntry: {
                value: kpis2.avgPerEntry - kpis1.avgPerEntry,
                percent: calculatePercentChange(kpis1.avgPerEntry, kpis2.avgPerEntry)
            }
        };

        return {
            period1: {
                label: period1.label || `${period1.start} - ${period1.end}`,
                dateRange: { start: period1.start, end: period1.end },
                kpis: kpis1
            },
            period2: {
                label: period2.label || `${period2.start} - ${period2.end}`,
                dateRange: { start: period2.start, end: period2.end },
                kpis: kpis2
            },
            changes
        };
    }

    /**
     * Get comparison Î¼Îµ preset
     * @param {string} preset - Preset name
     * @returns {Object}
     */
    getPresetComparison(preset) {
        const presets = {
            'month-vs-previous': {
                period1: { ...PERIOD_PRESETS.previousMonth(), label: 'Î ÏÎ¿Î·Î³Î¿ÏÎ¼ÎµÎ½Î¿Ï‚ ÎœÎ®Î½Î±Ï‚' },
                period2: { ...PERIOD_PRESETS.currentMonth(), label: 'Î¤ÏÎ­Ï‡Ï‰Î½ ÎœÎ®Î½Î±Ï‚' }
            },
            'month-vs-last-year': {
                period1: { ...PERIOD_PRESETS.sameLastYear(), label: 'ÎŠÎ´Î¹Î¿Ï‚ ÎœÎ®Î½Î±Ï‚ Î Î­ÏÏƒÎ¹' },
                period2: { ...PERIOD_PRESETS.currentMonth(), label: 'Î¤ÏÎ­Ï‡Ï‰Î½ ÎœÎ®Î½Î±Ï‚' }
            },
            'quarter-vs-previous': {
                period1: { ...PERIOD_PRESETS.previousQuarter(), label: 'Î ÏÎ¿Î·Î³Î¿ÏÎ¼ÎµÎ½Î¿ Î¤ÏÎ¯Î¼Î·Î½Î¿' },
                period2: { ...PERIOD_PRESETS.currentQuarter(), label: 'Î¤ÏÎ­Ï‡Î¿Î½ Î¤ÏÎ¯Î¼Î·Î½Î¿' }
            },
            'year-vs-previous': {
                period1: { ...PERIOD_PRESETS.previousYear(), label: 'Î ÏÎ¿Î·Î³Î¿ÏÎ¼ÎµÎ½Î¿ ÎˆÏ„Î¿Ï‚' },
                period2: { ...PERIOD_PRESETS.currentYear(), label: 'Î¤ÏÎ­Ï‡Î¿Î½ ÎˆÏ„Î¿Ï‚' }
            }
        };

        const config = presets[preset];
        if (!config) throw new Error('Unknown preset');

        return this.comparePeriods(config.period1, config.period2);
    }

    /**
     * Generate trend data Î³Î¹Î± Î³ÏÎ¬Ï†Î·Î¼Î±
     * @param {string} startDate - Start date
     * @param {string} endDate - End date
     * @returns {Object}
     */
    generateTrendData(startDate, endDate) {
        const dateRange = generateDateRange(startDate, endDate);
        const entries = this.filterByPeriod(startDate, endDate);
        const grouped = groupBy(entries, 'date');

        const trendData = dateRange.map(date => {
            const monthEntries = grouped[date] || [];
            return {
                date,
                total: sumBy(monthEntries, e => parseFloat(e.netAmount) || parseFloat(e.amount)),
                cash: sumBy(monthEntries.filter(e => e.type === 'cash'), e => parseFloat(e.netAmount) || parseFloat(e.amount)),
                invoices: sumBy(monthEntries.filter(e => e.type === 'invoice'), e => parseFloat(e.netAmount) || parseFloat(e.amount)),
                count: monthEntries.length
            };
        });

        return trendData;
    }

    /**
     * Generate comparison table data
     * @param {Object} comparison - Comparison result
     * @returns {Array}
     */
    generateComparisonTable(comparison) {
        const { period1, period2, changes } = comparison;

        return [
            {
                metric: 'Î£Ï…Î½Î¿Î»Î¹ÎºÎ¬ ÎˆÏƒÎ¿Î´Î±',
                period1: formatCurrency(period1.kpis.total),
                period2: formatCurrency(period2.kpis.total),
                change: formatCurrency(changes.total.value),
                changePercent: formatPercent(changes.total.percent),
                trend: changes.total.percent > 0 ? 'up' : changes.total.percent < 0 ? 'down' : 'neutral'
            },
            {
                metric: 'ÎœÎµÏ„ÏÎ·Ï„Î¬ & ÎšÎ¬ÏÏ„ÎµÏ‚',
                period1: formatCurrency(period1.kpis.cash),
                period2: formatCurrency(period2.kpis.cash),
                change: formatCurrency(changes.cash.value),
                changePercent: formatPercent(changes.cash.percent),
                trend: changes.cash.percent > 0 ? 'up' : changes.cash.percent < 0 ? 'down' : 'neutral'
            },
            {
                metric: 'Î¤Î¹Î¼Î¿Î»ÏŒÎ³Î¹Î±',
                period1: formatCurrency(period1.kpis.invoices),
                period2: formatCurrency(period2.kpis.invoices),
                change: formatCurrency(changes.invoices.value),
                changePercent: formatPercent(changes.invoices.percent),
                trend: changes.invoices.percent > 0 ? 'up' : changes.invoices.percent < 0 ? 'down' : 'neutral'
            },
            {
                metric: 'ÎšÏÎ±Ï„Î®ÏƒÎµÎ¹Ï‚',
                period1: formatCurrency(period1.kpis.retentions),
                period2: formatCurrency(period2.kpis.retentions),
                change: formatCurrency(changes.retentions.value),
                changePercent: formatPercent(changes.retentions.percent),
                trend: changes.retentions.percent > 0 ? 'up' : changes.retentions.percent < 0 ? 'down' : 'neutral'
            },
            {
                metric: 'Î‘ÏÎ¹Î¸Î¼ÏŒÏ‚ Î•Î³Î³ÏÎ±Ï†ÏŽÎ½',
                period1: period1.kpis.count.toString(),
                period2: period2.kpis.count.toString(),
                change: changes.count.value > 0 ? `+${changes.count.value}` : changes.count.value.toString(),
                changePercent: formatPercent(changes.count.percent),
                trend: changes.count.percent > 0 ? 'up' : changes.count.percent < 0 ? 'down' : 'neutral'
            },
            {
                metric: 'ÎœÎ­ÏƒÎ¿Ï‚ ÎŒÏÎ¿Ï‚ / Î•Î³Î³ÏÎ±Ï†Î®',
                period1: formatCurrency(period1.kpis.avgPerEntry),
                period2: formatCurrency(period2.kpis.avgPerEntry),
                change: formatCurrency(changes.avgPerEntry.value),
                changePercent: formatPercent(changes.avgPerEntry.percent),
                trend: changes.avgPerEntry.percent > 0 ? 'up' : changes.avgPerEntry.percent < 0 ? 'down' : 'neutral'
            }
        ];
    }

    /**
     * Generate summary text
     * @param {Object} comparison - Comparison result
     * @returns {string}
     */
    generateSummary(comparison) {
        const { period1, period2, changes } = comparison;

        const parts = [];

        // Overall trend
        if (changes.total.percent > 10) {
            parts.push(`ðŸ“ˆ Î£Î·Î¼Î±Î½Ï„Î¹ÎºÎ® Î±ÏÎ¾Î·ÏƒÎ· ÎµÏƒÏŒÎ´Ï‰Î½ ÎºÎ±Ï„Î¬ ${formatPercent(changes.total.percent)}`);
        } else if (changes.total.percent < -10) {
            parts.push(`ðŸ“‰ Î£Î·Î¼Î±Î½Ï„Î¹ÎºÎ® Î¼ÎµÎ¯Ï‰ÏƒÎ· ÎµÏƒÏŒÎ´Ï‰Î½ ÎºÎ±Ï„Î¬ ${formatPercent(Math.abs(changes.total.percent))}`);
        } else if (Math.abs(changes.total.percent) <= 10) {
            parts.push(`âž¡ï¸ Î£Ï„Î±Î¸ÎµÏÏŒÏ„Î·Ï„Î± ÎµÏƒÏŒÎ´Ï‰Î½ (${formatPercent(Math.abs(changes.total.percent))} Î´Î¹Î±ÎºÏÎ¼Î±Î½ÏƒÎ·)`);
        }

        // Count trend
        if (changes.count.value > 0) {
            parts.push(`Î‘ÏÎ¾Î·ÏƒÎ· ÎµÎ³Î³ÏÎ±Ï†ÏŽÎ½: ${changes.count.value} (+${formatPercent(changes.count.percent)})`);
        } else if (changes.count.value < 0) {
            parts.push(`ÎœÎµÎ¯Ï‰ÏƒÎ· ÎµÎ³Î³ÏÎ±Ï†ÏŽÎ½: ${Math.abs(changes.count.value)} (-${formatPercent(Math.abs(changes.count.percent))})`);
        }

        // Average per entry
        if (changes.avgPerEntry.percent > 5) {
            parts.push(`Î’ÎµÎ»Ï„Î¯Ï‰ÏƒÎ· Î¼Î­ÏƒÎ¿Ï… ÏŒÏÎ¿Ï… Î±Î½Î¬ ÎµÎ³Î³ÏÎ±Ï†Î®: ${formatCurrency(changes.avgPerEntry.value)}`);
        } else if (changes.avgPerEntry.percent < -5) {
            parts.push(`ÎœÎµÎ¯Ï‰ÏƒÎ· Î¼Î­ÏƒÎ¿Ï… ÏŒÏÎ¿Ï… Î±Î½Î¬ ÎµÎ³Î³ÏÎ±Ï†Î®: ${formatCurrency(Math.abs(changes.avgPerEntry.value))}`);
        }

        return parts.join(' â€¢ ');
    }
}

// ========================================
// Exports
// ========================================
export { PeriodComparison, PERIOD_PRESETS };
export default PeriodComparison;