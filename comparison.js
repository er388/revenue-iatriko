/**
 * comparison.js - Period Comparison Module
 * Side-by-side comparison of two periods
 * Version: 2.0 (Complete)
 */

import { STATE } from './state.js';
import eopyyDeductionsManager from './eopyyClawback.js';
import reportsManager from './reports.js';
import { 
    formatCurrency, 
    formatPercent, 
    calculatePercentChange,
    parseMonthYear,
    compareDates,
    escapeHtml
} from './utils.js';

// ========================================
// Configuration
// ========================================
const COMPARISON_CONFIG = {
    changeThresholds: {
        significant: 10, // 10% change is significant
        major: 25 // 25% change is major
    },
    trendIndicators: {
        increase: '↑',
        decrease: '↓',
        neutral: '→'
    }
};

// ========================================
// Comparison Manager Class
// ========================================
class ComparisonManager {
    constructor() {
        this.lastComparison = null;
    }

    /**
     * Compare two periods
     * @param {Object} period1 - First period config
     * @param {Object} period2 - Second period config
     * @param {Object} options - Options
     * @returns {Object} Comparison data
     */
    comparePeriods(period1, period2, options = {}) {
        const { includeParakratisi = false } = options;

        // Generate reports for both periods
        const report1 = this.generatePeriodReport(period1, includeParakratisi);
        const report2 = this.generatePeriodReport(period2, includeParakratisi);

        if (report1.isEmpty || report2.isEmpty) {
            return {
                error: true,
                message: 'Μία ή και οι δύο περίοδοι δεν έχουν δεδομένα'
            };
        }

        // Compare KPIs
        const kpisComparison = this.compareKPIs(
            report1.summary.kpis,
            report2.summary.kpis
        );

        // Compare sources
        const sourcesComparison = this.compareSources(
            report1.bySource,
            report2.bySource
        );

        // Compare insurances
        const insurancesComparison = this.compareInsurances(
            report1.byInsurance,
            report2.byInsurance
        );

        // Compare entry counts
        const entriesComparison = this.compareEntryCounts(
            report1.summary.totalEntries,
            report2.summary.totalEntries
        );

        // Overall trend analysis
        const trendAnalysis = this.analyzeTrends(kpisComparison);

        const comparison = {
            period1: {
                label: this.getPeriodLabel(period1),
                dateRange: report1.summary.dateRange,
                report: report1
            },
            period2: {
                label: this.getPeriodLabel(period2),
                dateRange: report2.summary.dateRange,
                report: report2
            },
            kpis: kpisComparison,
            sources: sourcesComparison,
            insurances: insurancesComparison,
            entries: entriesComparison,
            trends: trendAnalysis,
            generatedAt: Date.now()
        };

        this.lastComparison = comparison;
        return comparison;
    }

    /**
     * Generate report for period
     * @param {Object} period - Period config
     * @param {boolean} includeParakratisi - Include parakratisi
     * @returns {Object} Report
     * @private
     */
    generatePeriodReport(period, includeParakratisi) {
        const { type } = period;

        if (type === 'annual') {
            return reportsManager.generateAnnualReport(period.year, { includeParakratisi });
        } else if (type === 'quarterly') {
            return reportsManager.generateQuarterlyReport(period.year, period.quarter, { includeParakratisi });
        } else if (type === 'semiannual') {
            return reportsManager.generateSemiannualReport(period.year, period.semester, { includeParakratisi });
        } else if (type === 'custom') {
            return reportsManager.generatePeriodReport(period.startDate, period.endDate, { includeParakratisi });
        }

        throw new Error('Invalid period type');
    }

    /**
     * Get period label
     * @param {Object} period - Period config
     * @returns {string} Label
     * @private
     */
    getPeriodLabel(period) {
        const { type } = period;

        if (type === 'annual') {
            return `Έτος ${period.year}`;
        } else if (type === 'quarterly') {
            return `${period.quarter} ${period.year}`;
        } else if (type === 'semiannual') {
            return `${period.semester} ${period.year}`;
        } else if (type === 'custom') {
            return `${period.startDate} - ${period.endDate}`;
        }

        return 'Unknown';
    }

    /**
     * Compare KPIs
     * @param {Object} kpis1 - KPIs from period 1
     * @param {Object} kpis2 - KPIs from period 2
     * @returns {Object} KPIs comparison
     * @private
     */
    compareKPIs(kpis1, kpis2) {
        const metrics = [
            'total',
            'eopyyTotal',
            'nonEopyyTotal',
            'eopyyParakratisi',
            'eopyyMDE',
            'eopyyRebate',
            'eopyyKrathseis',
            'eopyyClawback',
            'eopyyTotalDeductions',
            'nonEopyyKrathseis'
        ];

        const comparison = {};

        metrics.forEach(metric => {
            const value1 = kpis1[metric] || 0;
            const value2 = kpis2[metric] || 0;
            const change = value2 - value1;
            const changePercent = calculatePercentChange(value1, value2);

            comparison[metric] = {
                period1: value1,
                period2: value2,
                change,
                changePercent,
                trend: this.getTrend(changePercent),
                significance: this.getSignificance(changePercent)
            };
        });

        return comparison;
    }

    /**
     * Compare sources
     * @param {Array} sources1 - Sources from period 1
     * @param {Array} sources2 - Sources from period 2
     * @returns {Array} Sources comparison
     * @private
     */
    compareSources(sources1, sources2) {
        const allSources = new Set([
            ...sources1.map(s => s.source),
            ...sources2.map(s => s.source)
        ]);

        const comparison = [];

        allSources.forEach(source => {
            const s1 = sources1.find(s => s.source === source);
            const s2 = sources2.find(s => s.source === source);

            const total1 = s1?.total || 0;
            const total2 = s2?.total || 0;
            const change = total2 - total1;
            const changePercent = calculatePercentChange(total1, total2);

            comparison.push({
                source,
                period1: {
                    total: total1,
                    count: s1?.count || 0
                },
                period2: {
                    total: total2,
                    count: s2?.count || 0
                },
                change,
                changePercent,
                trend: this.getTrend(changePercent),
                significance: this.getSignificance(changePercent)
            });
        });

        // Sort by absolute change (descending)
        comparison.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

        return comparison;
    }

    /**
     * Compare insurances
     * @param {Array} insurances1 - Insurances from period 1
     * @param {Array} insurances2 - Insurances from period 2
     * @returns {Array} Insurances comparison
     * @private
     */
    compareInsurances(insurances1, insurances2) {
        const allInsurances = new Set([
            ...insurances1.map(i => i.insurance),
            ...insurances2.map(i => i.insurance)
        ]);

        const comparison = [];

        allInsurances.forEach(insurance => {
            const i1 = insurances1.find(i => i.insurance === insurance);
            const i2 = insurances2.find(i => i.insurance === insurance);

            const total1 = i1?.total || 0;
            const total2 = i2?.total || 0;
            const change = total2 - total1;
            const changePercent = calculatePercentChange(total1, total2);

            comparison.push({
                insurance,
                period1: {
                    total: total1,
                    count: i1?.count || 0
                },
                period2: {
                    total: total2,
                    count: i2?.count || 0
                },
                change,
                changePercent,
                trend: this.getTrend(changePercent),
                significance: this.getSignificance(changePercent)
            });
        });

        // Sort by absolute change (descending)
        comparison.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

        return comparison;
    }

    /**
     * Compare entry counts
     * @param {number} count1 - Count from period 1
     * @param {number} count2 - Count from period 2
     * @returns {Object} Entry count comparison
     * @private
     */
    compareEntryCounts(count1, count2) {
        const change = count2 - count1;
        const changePercent = calculatePercentChange(count1, count2);

        return {
            period1: count1,
            period2: count2,
            change,
            changePercent,
            trend: this.getTrend(changePercent)
        };
    }

    /**
     * Analyze trends
     * @param {Object} kpisComparison - KPIs comparison
     * @returns {Object} Trend analysis
     * @private
     */
    analyzeTrends(kpisComparison) {
        const analysis = {
            overall: 'neutral',
            positive: [],
            negative: [],
            neutral: [],
            significant: []
        };

        // Overall trend based on total revenue
        const totalChange = kpisComparison.total.changePercent;
        if (totalChange > 5) {
            analysis.overall = 'positive';
        } else if (totalChange < -5) {
            analysis.overall = 'negative';
        }

        // Categorize metrics
        Object.entries(kpisComparison).forEach(([metric, data]) => {
            if (data.changePercent > 5) {
                analysis.positive.push(metric);
            } else if (data.changePercent < -5) {
                analysis.negative.push(metric);
            } else {
                analysis.neutral.push(metric);
            }

            if (data.significance === 'significant' || data.significance === 'major') {
                analysis.significant.push({
                    metric,
                    changePercent: data.changePercent,
                    significance: data.significance
                });
            }
        });

        return analysis;
    }

    /**
     * Get trend indicator
     * @param {number} changePercent - Percentage change
     * @returns {string} Trend indicator
     * @private
     */
    getTrend(changePercent) {
        if (changePercent > 1) return 'increase';
        if (changePercent < -1) return 'decrease';
        return 'neutral';
    }

    /**
     * Get change significance
     * @param {number} changePercent - Percentage change
     * @returns {string} Significance level
     * @private
     */
    getSignificance(changePercent) {
        const abs = Math.abs(changePercent);
        
        if (abs >= COMPARISON_CONFIG.changeThresholds.major) {
            return 'major';
        } else if (abs >= COMPARISON_CONFIG.changeThresholds.significant) {
            return 'significant';
        } else if (abs >= 5) {
            return 'moderate';
        }
        
        return 'minor';
    }

    /**
     * Get trend icon
     * @param {string} trend - Trend type
     * @returns {string} Icon
     */
    getTrendIcon(trend) {
        return COMPARISON_CONFIG.trendIndicators[trend] || '';
    }

    /**
     * Get trend color class
     * @param {string} trend - Trend type
     * @returns {string} CSS class
     */
    getTrendColorClass(trend) {
        if (trend === 'increase') return 'trend-positive';
        if (trend === 'decrease') return 'trend-negative';
        return 'trend-neutral';
    }

    /**
     * Export comparison to CSV
     * @param {Object} comparison - Comparison data
     * @returns {string} CSV content
     */
    exportToCSV(comparison) {
        let csv = [];

        // Header
        csv.push('# ΣΥΓΚΡΙΣΗ ΠΕΡΙΟΔΩΝ');
        csv.push(`# Περίοδος 1: ${comparison.period1.label}`);
        csv.push(`# Περίοδος 2: ${comparison.period2.label}`);
        csv.push('');

        // Summary
        csv.push('ΣΥΝΟΛΙΚΑ');
        csv.push('Μετρική,Περίοδος 1,Περίοδος 2,Μεταβολή,Μεταβολή %');
        
        const summaryMetrics = [
            ['Σύνολο', 'total'],
            ['ΕΟΠΥΥ', 'eopyyTotal'],
            ['Άλλα', 'nonEopyyTotal'],
            ['Κρατήσεις', 'eopyyTotalDeductions']
        ];

        summaryMetrics.forEach(([label, key]) => {
            const data = comparison.kpis[key];
            csv.push(`${label},${data.period1.toFixed(2)},${data.period2.toFixed(2)},${data.change.toFixed(2)},${data.changePercent.toFixed(2)}%`);
        });

        csv.push('');

        // Sources comparison
        if (comparison.sources.length > 0) {
            csv.push('ΣΥΓΚΡΙΣΗ ΑΝΑ ΔΙΑΓΝΩΣΤΙΚΟ');
            csv.push('Διαγνωστικό,Περίοδος 1,Περίοδος 2,Μεταβολή,Μεταβολή %');
            comparison.sources.forEach(s => {
                csv.push(`"${s.source}",${s.period1.total.toFixed(2)},${s.period2.total.toFixed(2)},${s.change.toFixed(2)},${s.changePercent.toFixed(2)}%`);
            });
            csv.push('');
        }

        // Insurances comparison
        if (comparison.insurances.length > 0) {
            csv.push('ΣΥΓΚΡΙΣΗ ΑΝΑ ΑΣΦΑΛΕΙΑ');
            csv.push('Ασφάλεια,Περίοδος 1,Περίοδος 2,Μεταβολή,Μεταβολή %');
            comparison.insurances.forEach(i => {
                csv.push(`"${i.insurance}",${i.period1.total.toFixed(2)},${i.period2.total.toFixed(2)},${i.change.toFixed(2)},${i.changePercent.toFixed(2)}%`);
            });
        }

        return csv.join('\n');
    }

    /**
     * Get last comparison
     * @returns {Object|null} Last comparison
     */
    getLastComparison() {
        return this.lastComparison;
    }
}

// ========================================
// Singleton Instance
// ========================================
const comparisonManager = new ComparisonManager();

// ========================================
// Export
// ========================================
export { ComparisonManager, COMPARISON_CONFIG };
export default comparisonManager;
