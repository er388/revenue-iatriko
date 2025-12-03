/**
 * reports.js - Comprehensive Reporting Module
 * Generate annual, periodic, and breakdown reports
 * Version: 2.0 (Complete)
 */

import { STATE } from './state.js';
import eopyyDeductionsManager from './eopyyClawback.js';
import { 
    formatCurrency, 
    formatPercent, 
    parseMonthYear, 
    formatMonthYear,
    compareDates,
    generateDateRange,
    groupBy,
    sumBy
} from './utils.js';

// ========================================
// Configuration
// ========================================
const REPORT_CONFIG = {
    periods: {
        monthly: 'Μηνιαία',
        quarterly: 'Τριμηνιαία',
        semiannual: 'Εξαμηνιαία',
        annual: 'Ετήσια'
    },
    quarters: {
        Q1: [1, 2, 3],
        Q2: [4, 5, 6],
        Q3: [7, 8, 9],
        Q4: [10, 11, 12]
    },
    semesters: {
        H1: [1, 2, 3, 4, 5, 6],
        H2: [7, 8, 9, 10, 11, 12]
    }
};

// ========================================
// Reports Manager Class
// ========================================
class ReportsManager {
    constructor() {
        this.cache = {};
    }

    /**
     * Generate annual report
     * @param {number} year - Year
     * @param {Object} options - Options
     * @returns {Object} Report data
     */
    generateAnnualReport(year, options = {}) {
        const { includeParakratisi = false } = options;

        // VALIDATE: Ensure entries exist
        if (!STATE.entries || STATE.entries.length === 0) {
            return {
                year,
                isEmpty: true,
                message: 'Δεν υπάρχουν εγγραφές στο σύστημα'
            };
        }

        // Filter entries for year
        const entries = STATE.entries.filter(e => {
            const parsed = parseMonthYear(e.date);
            return parsed && parsed.year === year;
        });

        if (entries.length === 0) {
            return {
                year,
                isEmpty: true,
                message: `Δεν υπάρχουν εγγραφές για το ${year}`
            };
        }

        // Calculate KPIs
        const kpis = eopyyDeductionsManager.calculateKPIs(entries, { includeParakratisi });

        // Monthly breakdown
        const monthlyData = this.getMonthlyBreakdown(entries, includeParakratisi);

        // Source breakdown
        const sourceData = this.getSourceBreakdown(entries, includeParakratisi);

        // Insurance breakdown
        const insuranceData = this.getInsuranceBreakdown(entries, includeParakratisi);

        // Type breakdown
        const typeData = this.getTypeBreakdown(entries, includeParakratisi);

        // Deductions analysis
        const deductionsAnalysis = this.getDeductionsAnalysis(entries);

        return {
            year,
            period: 'annual',
            isEmpty: false,
            summary: {
                totalEntries: entries.length,
                dateRange: {
                    from: `01/${year}`,
                    to: `12/${year}`
                },
                kpis
            },
            monthly: monthlyData,
            bySource: sourceData,
            byInsurance: insuranceData,
            byType: typeData,
            deductions: deductionsAnalysis,
            generatedAt: Date.now()
        }
    }

    /**
     * Generate period report
     * @param {string} startDate - Start date (MM/YYYY)
     * @param {string} endDate - End date (MM/YYYY)
     * @param {Object} options - Options
     * @returns {Object} Report data
     */
    generatePeriodReport(startDate, endDate, options = {}) {
        const { includeParakratisi = false } = options;

        // Filter entries for period
        const entries = STATE.entries.filter(e => {
            return compareDates(e.date, startDate) >= 0 &&
                   compareDates(e.date, endDate) <= 0;
        });

        if (entries.length === 0) {
            return {
                period: 'custom',
                isEmpty: true,
                message: `Δεν υπάρχουν εγγραφές για την περίοδο ${startDate} - ${endDate}`
            };
        }

        // Calculate KPIs
        const kpis = eopyyDeductionsManager.calculateKPIs(entries, { includeParakratisi });

        // Monthly breakdown
        const monthlyData = this.getMonthlyBreakdown(entries, includeParakratisi);

        // Source breakdown
        const sourceData = this.getSourceBreakdown(entries, includeParakratisi);

        // Insurance breakdown
        const insuranceData = this.getInsuranceBreakdown(entries, includeParakratisi);

        return {
            period: 'custom',
            isEmpty: false,
            summary: {
                totalEntries: entries.length,
                dateRange: {
                    from: startDate,
                    to: endDate
                },
                kpis
            },
            monthly: monthlyData,
            bySource: sourceData,
            byInsurance: insuranceData,
            generatedAt: Date.now()
        };
    }

    /**
     * Generate quarterly report
     * @param {number} year - Year
     * @param {string} quarter - Quarter (Q1, Q2, Q3, Q4)
     * @param {Object} options - Options
     * @returns {Object} Report data
     */
    generateQuarterlyReport(year, quarter, options = {}) {
        const months = REPORT_CONFIG.quarters[quarter];
        if (!months) {
            throw new Error(`Invalid quarter: ${quarter}`);
        }

        const startDate = formatMonthYear(months[0], year);
        const endDate = formatMonthYear(months[months.length - 1], year);

        const report = this.generatePeriodReport(startDate, endDate, options);
        report.period = 'quarterly';
        report.quarter = quarter;
        report.year = year;

        return report;
    }

    /**
     * Generate semiannual report
     * @param {number} year - Year
     * @param {string} semester - Semester (H1, H2)
     * @param {Object} options - Options
     * @returns {Object} Report data
     */
    generateSemiannualReport(year, semester, options = {}) {
        const months = REPORT_CONFIG.semesters[semester];
        if (!months) {
            throw new Error(`Invalid semester: ${semester}`);
        }

        const startDate = formatMonthYear(months[0], year);
        const endDate = formatMonthYear(months[months.length - 1], year);

        const report = this.generatePeriodReport(startDate, endDate, options);
        report.period = 'semiannual';
        report.semester = semester;
        report.year = year;

        return report;
    }

    /**
     * Get monthly breakdown
     * @param {Array} entries - Entries
     * @param {boolean} includeParakratisi - Include parakratisi
     * @returns {Array} Monthly data
     * @private
     */
    getMonthlyBreakdown(entries, includeParakratisi) {
        const grouped = groupBy(entries, 'date');
        const monthlyData = [];

        for (const [date, monthEntries] of Object.entries(grouped)) {
            const kpis = eopyyDeductionsManager.calculateKPIs(monthEntries, { includeParakratisi });

            monthlyData.push({
                date,
                count: monthEntries.length,
                total: kpis.total,
                eopyyTotal: kpis.eopyyTotal,
                nonEopyyTotal: kpis.nonEopyyTotal,
                deductions: kpis.eopyyTotalDeductions + kpis.nonEopyyKrathseis
            });
        }

        // Sort by date
        monthlyData.sort((a, b) => compareDates(a.date, b.date));

        return monthlyData;
    }

    /**
     * Get source breakdown
     * @param {Array} entries - Entries
     * @param {boolean} includeParakratisi - Include parakratisi
     * @returns {Array} Source data
     * @private
     */
    getSourceBreakdown(entries, includeParakratisi) {
        const grouped = groupBy(entries, 'source');
        const sourceData = [];

        for (const [source, sourceEntries] of Object.entries(grouped)) {
            const kpis = eopyyDeductionsManager.calculateKPIs(sourceEntries, { includeParakratisi });

            sourceData.push({
                source,
                count: sourceEntries.length,
                total: kpis.total,
                eopyyTotal: kpis.eopyyTotal,
                nonEopyyTotal: kpis.nonEopyyTotal,
                deductions: kpis.eopyyTotalDeductions + kpis.nonEopyyKrathseis,
                averagePerEntry: kpis.total / sourceEntries.length
            });
        }

        // Sort by total descending
        sourceData.sort((a, b) => b.total - a.total);

        return sourceData;
    }

    /**
     * Get insurance breakdown
     * @param {Array} entries - Entries
     * @param {boolean} includeParakratisi - Include parakratisi
     * @returns {Array} Insurance data
     * @private
     */
    getInsuranceBreakdown(entries, includeParakratisi) {
        const grouped = groupBy(entries, 'insurance');
        const insuranceData = [];

        for (const [insurance, insuranceEntries] of Object.entries(grouped)) {
            const kpis = eopyyDeductionsManager.calculateKPIs(insuranceEntries, { includeParakratisi });

            insuranceData.push({
                insurance,
                count: insuranceEntries.length,
                total: kpis.total,
                eopyyTotal: kpis.eopyyTotal,
                nonEopyyTotal: kpis.nonEopyyTotal,
                deductions: kpis.eopyyTotalDeductions + kpis.nonEopyyKrathseis,
                averagePerEntry: kpis.total / insuranceEntries.length
            });
        }

        // Sort by total descending
        insuranceData.sort((a, b) => b.total - a.total);

        return insuranceData;
    }

    /**
     * Get type breakdown
     * @param {Array} entries - Entries
     * @param {boolean} includeParakratisi - Include parakratisi
     * @returns {Object} Type data
     * @private
     */
    getTypeBreakdown(entries, includeParakratisi) {
        const cashEntries = entries.filter(e => e.type === 'cash');
        const invoiceEntries = entries.filter(e => e.type === 'invoice');

        const cashKpis = eopyyDeductionsManager.calculateKPIs(cashEntries, { includeParakratisi });
        const invoiceKpis = eopyyDeductionsManager.calculateKPIs(invoiceEntries, { includeParakratisi });

        return {
            cash: {
                count: cashEntries.length,
                total: cashKpis.total,
                eopyyTotal: cashKpis.eopyyTotal,
                nonEopyyTotal: cashKpis.nonEopyyTotal
            },
            invoice: {
                count: invoiceEntries.length,
                total: invoiceKpis.total,
                eopyyTotal: invoiceKpis.eopyyTotal,
                nonEopyyTotal: invoiceKpis.nonEopyyTotal,
                deductions: invoiceKpis.eopyyTotalDeductions + invoiceKpis.nonEopyyKrathseis
            }
        };
    }

    /**
     * Get deductions analysis
     * @param {Array} entries - Entries
     * @returns {Object} Deductions analysis
     * @private
     */
    getDeductionsAnalysis(entries) {
        const eopyyEntries = entries.filter(e => eopyyDeductionsManager.isEopyyEntry(e));
        
        if (eopyyEntries.length === 0) {
            return {
                hasEopyy: false,
                message: 'Δεν υπάρχουν εγγραφές ΕΟΠΥΥ'
            };
        }

        let totalParakratisi = 0;
        let totalMDE = 0;
        let totalRebate = 0;
        let totalKrathseis = 0;
        let totalClawback = 0;
        let totalOriginal = 0;

        eopyyEntries.forEach(entry => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);
            totalOriginal += amounts.originalAmount;
            totalParakratisi += amounts.parakratisi || 0;
            totalMDE += amounts.mde || 0;
            totalRebate += amounts.rebate || 0;
            totalKrathseis += amounts.krathseis || 0;
            totalClawback += amounts.clawback || 0;
        });

        const totalDeductions = totalParakratisi + totalMDE + totalRebate + totalKrathseis + totalClawback;

        return {
            hasEopyy: true,
            entriesCount: eopyyEntries.length,
            totalOriginal,
            breakdown: {
                parakratisi: {
                    amount: totalParakratisi,
                    percent: (totalParakratisi / totalOriginal) * 100
                },
                mde: {
                    amount: totalMDE,
                    percent: (totalMDE / totalOriginal) * 100
                },
                rebate: {
                    amount: totalRebate,
                    percent: (totalRebate / totalOriginal) * 100
                },
                krathseis: {
                    amount: totalKrathseis,
                    percent: (totalKrathseis / totalOriginal) * 100
                },
                clawback: {
                    amount: totalClawback,
                    percent: (totalClawback / totalOriginal) * 100
                }
            },
            total: {
                amount: totalDeductions,
                percent: (totalDeductions / totalOriginal) * 100
            },
            averagePerEntry: totalDeductions / eopyyEntries.length
        };
    }

    /**
     * Get available years
     * @returns {Array} Years with data
     */
    getAvailableYears() {
        const years = new Set();
        
        STATE.entries.forEach(entry => {
            const parsed = parseMonthYear(entry.date);
            if (parsed) {
                years.add(parsed.year);
            }
        });

        return Array.from(years).sort((a, b) => b - a); // Descending
    }

    /**
     * Export report to CSV
     * @param {Object} report - Report data
     * @returns {string} CSV content
     */
    exportToCSV(report) {
        if (report.isEmpty) {
            return '';
        }

        let csv = [];

        // Header
        csv.push('# ΑΝΑΦΟΡΑ ΕΣΟΔΩΝ');
        csv.push(`# Περίοδος: ${report.summary.dateRange.from} - ${report.summary.dateRange.to}`);
        csv.push(`# Εγγραφές: ${report.summary.totalEntries}`);
        csv.push('');

        // Summary
        csv.push('ΣΥΝΟΛΙΚΑ');
        csv.push('Κατηγορία,Ποσό');
        csv.push(`Σύνολο,${report.summary.kpis.total.toFixed(2)}`);
        csv.push(`ΕΟΠΥΥ,${report.summary.kpis.eopyyTotal.toFixed(2)}`);
        csv.push(`Άλλα,${report.summary.kpis.nonEopyyTotal.toFixed(2)}`);
        csv.push(`Κρατήσεις,${(report.summary.kpis.eopyyTotalDeductions + report.summary.kpis.nonEopyyKrathseis).toFixed(2)}`);
        csv.push('');

        // Monthly breakdown
        if (report.monthly && report.monthly.length > 0) {
            csv.push('ΜΗΝΙΑΙΑ ΑΝΑΛΥΣΗ');
            csv.push('Μήνας,Εγγραφές,Σύνολο,ΕΟΠΥΥ,Άλλα,Κρατήσεις');
            report.monthly.forEach(m => {
                csv.push(`${m.date},${m.count},${m.total.toFixed(2)},${m.eopyyTotal.toFixed(2)},${m.nonEopyyTotal.toFixed(2)},${m.deductions.toFixed(2)}`);
            });
            csv.push('');
        }

        // Source breakdown
        if (report.bySource && report.bySource.length > 0) {
            csv.push('ΑΝΑΛΥΣΗ ΑΝΑ ΔΙΑΓΝΩΣΤΙΚΟ');
            csv.push('Διαγνωστικό,Εγγραφές,Σύνολο,ΕΟΠΥΥ,Άλλα,Μέσος Όρος');
            report.bySource.forEach(s => {
                csv.push(`"${s.source}",${s.count},${s.total.toFixed(2)},${s.eopyyTotal.toFixed(2)},${s.nonEopyyTotal.toFixed(2)},${s.averagePerEntry.toFixed(2)}`);
            });
            csv.push('');
        }

        // Insurance breakdown
        if (report.byInsurance && report.byInsurance.length > 0) {
            csv.push('ΑΝΑΛΥΣΗ ΑΝΑ ΑΣΦΑΛΕΙΑ');
            csv.push('Ασφάλεια,Εγγραφές,Σύνολο,Μέσος Όρος');
            report.byInsurance.forEach(i => {
                csv.push(`"${i.insurance}",${i.count},${i.total.toFixed(2)},${i.averagePerEntry.toFixed(2)}`);
            });
        }

        return csv.join('\n');
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache = {};
    }
}

// ========================================
// Singleton Instance
// ========================================
const reportsManager = new ReportsManager();

// ========================================
// Export
// ========================================
export { ReportsManager, REPORT_CONFIG };
export default reportsManager;
