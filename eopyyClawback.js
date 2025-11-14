/**
 * eopyyClawback.js - ΕΟΠΥΥ Advanced Deductions Management
 * v2.1 - Added percentage storage
 */

import { formatCurrency, parseMonthYear, generateId } from './utils.js';
import storage from './storage.js';

class EopyyDeductionsManager {
    constructor() {
        this.deductions = [];
    }

    async loadDeductions() {
        try {
            this.deductions = await storage.loadSetting('eopyyDeductions') || [];
        } catch (error) {
            console.error('Load deductions error:', error);
            this.deductions = [];
        }
    }

    async saveDeductions() {
        try {
            await storage.saveSetting('eopyyDeductions', this.deductions);
        } catch (error) {
            console.error('Save deductions error:', error);
        }
    }

    isEopyyEntry(entry) {
        return entry.insurance && entry.insurance.toUpperCase().includes('ΕΟΠΥΥ');
    }

    /**
     * Apply deductions με percentages
     * @param {string} entryId - Entry ID
     * @param {Object} deductionAmounts - {parakratisi, mde, rebate, krathseis, clawback}
     * @param {string} notes - Notes
     * @param {Object} percentages - {parakratisi, mde, rebate, krathseis, clawback} percentages
     * @returns {Promise<Object>}
     */
    async applyDeductions(entryId, deductionAmounts, notes = '', percentages = {}) {
        const existingIndex = this.deductions.findIndex(d => d.entryId === entryId);
        
        const deduction = {
            id: existingIndex >= 0 ? this.deductions[existingIndex].id : generateId(),
            entryId,
            deductions: {
                parakratisi: parseFloat(deductionAmounts.parakratisi) || 0,
                mde: parseFloat(deductionAmounts.mde) || 0,
                rebate: parseFloat(deductionAmounts.rebate) || 0,
                krathseis: parseFloat(deductionAmounts.krathseis) || 0,
                clawback: parseFloat(deductionAmounts.clawback) || 0
            },
            percentages: {
                parakratisi: parseFloat(percentages.parakratisi) || 0,
                mde: parseFloat(percentages.mde) || 0,
                rebate: parseFloat(percentages.rebate) || 0,
                krathseis: parseFloat(percentages.krathseis) || 0,
                clawback: parseFloat(percentages.clawback) || 0
            },
            appliedDate: Date.now(),
            notes
        };

        if (existingIndex >= 0) {
            this.deductions[existingIndex] = deduction;
        } else {
            this.deductions.push(deduction);
        }

        await this.saveDeductions();
        return deduction;
    }

    async removeDeductions(entryId) {
        const index = this.deductions.findIndex(d => d.entryId === entryId);
        if (index >= 0) {
            this.deductions.splice(index, 1);
            await this.saveDeductions();
            return true;
        }
        return false;
    }

    getDeductions(entryId) {
        return this.deductions.find(d => d.entryId === entryId) || null;
    }

    getAmountsBreakdown(entry) {
        const originalAmount = parseFloat(entry.originalAmount) || parseFloat(entry.amount);
        
        if (this.isEopyyEntry(entry)) {
            const deduction = this.getDeductions(entry.id);
            
            if (!deduction) {
                return {
                    originalAmount,
                    parakratisi: 0,
                    mde: 0,
                    rebate: 0,
                    krathseis: 0,
                    clawback: 0,
                    totalDeductions: 0,
                    finalAmount: originalAmount,
                    finalAmountNoParakratisi: originalAmount,
                    hasDeductions: false
                };
            }

            const { parakratisi, mde, rebate, krathseis, clawback } = deduction.deductions;
            const totalDeductions = parakratisi + mde + rebate + krathseis + clawback;
            const finalAmount = originalAmount - totalDeductions;
            const finalAmountNoParakratisi = originalAmount - (mde + rebate + krathseis + clawback);

            return {
                originalAmount,
                parakratisi,
                mde,
                rebate,
                krathseis,
                clawback,
                totalDeductions,
                finalAmount,
                finalAmountNoParakratisi,
                hasDeductions: true
            };
        }
        
        const krathseisAmount = parseFloat(entry.krathseis) || 0;
        return {
            originalAmount,
            krathseis: krathseisAmount,
            totalDeductions: krathseisAmount,
            finalAmount: originalAmount - krathseisAmount,
            finalAmountNoParakratisi: originalAmount - krathseisAmount,
            hasDeductions: krathseisAmount > 0,
            isNonEopyy: true
        };
    }

    calculateKPIs(entries, options = {}) {
        const { includeParakratisi = false } = options;

        let total = 0;
        let eopyyTotal = 0;
        let eopyyOriginal = 0;
        let eopyyParakratisi = 0;
        let eopyyMDE = 0;
        let eopyyRebate = 0;
        let eopyyKrathseis = 0;
        let eopyyClawback = 0;
        let eopyyFinal = 0;
        let eopyyFinalNoParakratisi = 0;
        let nonEopyyTotal = 0;
        let nonEopyyKrathseis = 0;
        let nonEopyyFinal = 0;

        entries.forEach(entry => {
            const amounts = this.getAmountsBreakdown(entry);

            if (this.isEopyyEntry(entry)) {
                eopyyOriginal += amounts.originalAmount;
                eopyyParakratisi += amounts.parakratisi || 0;
                eopyyMDE += amounts.mde || 0;
                eopyyRebate += amounts.rebate || 0;
                eopyyKrathseis += amounts.krathseis || 0;
                eopyyClawback += amounts.clawback || 0;
                eopyyFinal += amounts.finalAmount;
                eopyyFinalNoParakratisi += amounts.finalAmountNoParakratisi;
                
                if (includeParakratisi) {
                    eopyyTotal += amounts.finalAmountNoParakratisi;
                } else {
                    eopyyTotal += amounts.finalAmount;
                }
            } else {
                nonEopyyTotal += amounts.originalAmount;
                nonEopyyKrathseis += amounts.krathseis || 0;
                nonEopyyFinal += amounts.finalAmount;
            }
        });

        total = eopyyTotal + nonEopyyFinal;

        return {
            total,
            eopyyOriginal,
            eopyyParakratisi,
            eopyyMDE,
            eopyyRebate,
            eopyyKrathseis,
            eopyyClawback,
            eopyyTotalDeductions: eopyyParakratisi + eopyyMDE + eopyyRebate + eopyyKrathseis + eopyyClawback,
            eopyyFinal,
            eopyyFinalNoParakratisi,
            eopyyTotal,
            nonEopyyOriginal: nonEopyyTotal,
            nonEopyyKrathseis,
            nonEopyyFinal,
            nonEopyyTotal: nonEopyyFinal,
            includeParakratisi
        };
    }

    getEntriesMissingDeductions(entries) {
        return entries.filter(entry => {
            if (!this.isEopyyEntry(entry)) return false;
            return !this.getDeductions(entry.id);
        });
    }

    getEntriesWithDeductions(entries) {
        return entries.filter(entry => {
            return this.isEopyyEntry(entry) && this.getDeductions(entry.id);
        });
    }

    async batchApplyDeductions(entries, percentages, notes = '') {
        const eopyyEntries = entries.filter(e => this.isEopyyEntry(e));
        let applied = 0;
        let skipped = 0;

        for (const entry of eopyyEntries) {
            const originalAmount = parseFloat(entry.originalAmount) || parseFloat(entry.amount);
            
            const deductionAmounts = {
                parakratisi: (originalAmount * (parseFloat(percentages.parakratisi) || 0)) / 100,
                mde: (originalAmount * (parseFloat(percentages.mde) || 0)) / 100,
                rebate: (originalAmount * (parseFloat(percentages.rebate) || 0)) / 100,
                krathseis: (originalAmount * (parseFloat(percentages.krathseis) || 0)) / 100,
                clawback: (originalAmount * (parseFloat(percentages.clawback) || 0)) / 100
            };

            try {
                await this.applyDeductions(entry.id, deductionAmounts, notes, percentages);
                applied++;
            } catch (error) {
                console.error('Batch apply deductions error:', error);
                skipped++;
            }
        }

        return {
            total: eopyyEntries.length,
            applied,
            skipped
        };
    }

    exportDeductionsReport(entries) {
        const report = {
            generatedDate: new Date().toISOString(),
            summary: this.calculateKPIs(entries, { includeParakratisi: false }),
            summaryWithParakratisi: this.calculateKPIs(entries, { includeParakratisi: true }),
            entries: []
        };

        entries.forEach(entry => {
            if (this.isEopyyEntry(entry)) {
                const amounts = this.getAmountsBreakdown(entry);
                const deduction = this.getDeductions(entry.id);

                report.entries.push({
                    date: entry.date,
                    source: entry.source,
                    originalAmount: amounts.originalAmount,
                    parakratisi: amounts.parakratisi,
                    mde: amounts.mde,
                    rebate: amounts.rebate,
                    krathseis: amounts.krathseis,
                    clawback: amounts.clawback,
                    totalDeductions: amounts.totalDeductions,
                    finalAmount: amounts.finalAmount,
                    finalAmountNoParakratisi: amounts.finalAmountNoParakratisi,
                    deductionsAppliedDate: deduction ? new Date(deduction.appliedDate).toISOString() : null,
                    notes: deduction ? deduction.notes : ''
                });
            }
        });

        return report;
    }
}

const eopyyDeductionsManager = new EopyyDeductionsManager();

export { EopyyDeductionsManager };
export default eopyyDeductionsManager;
