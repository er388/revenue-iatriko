/**
 * eopyyClawback.js - ΕΟΠΥΥ Deductions Calculation Engine
 * Manages 5 deduction types for ΕΟΠΥΥ + 1 general deduction for others
 * Version: 2.0 (Clean Rewrite)
 */

import { formatCurrency, parseMonthYear, generateId } from './utils.js';
import storage from './storage.js';

// ========================================
// Deductions Manager Class
// ========================================
class EopyyDeductionsManager {
    constructor() {
        this.deductions = []; // [{entryId, deductions, percentages, appliedDate}]
    }

    /**
     * Load deductions from storage
     * @returns {Promise<boolean>} Success status
     */
    async loadDeductions() {
        try {
            this.deductions = await storage.loadSetting('eopyyDeductions') || [];
            console.log(`[Deductions] Loaded ${this.deductions.length} deduction records`);
            return true;
        } catch (error) {
            console.error('[Deductions] Load error:', error);
            this.deductions = [];
            return false;
        }
    }

    /**
     * Save deductions to storage
     * @returns {Promise<boolean>} Success status
     */
    async saveDeductions() {
        try {
            await storage.saveSetting('eopyyDeductions', this.deductions);
            return true;
        } catch (error) {
            console.error('[Deductions] Save error:', error);
            return false;
        }
    }

    /**
     * Check if entry is ΕΟΠΥΥ
     * @param {Object} entry - Entry object
     * @returns {boolean} Is ΕΟΠΥΥ
     */
    isEopyyEntry(entry) {
        return entry.insurance && entry.insurance.toUpperCase().includes('ΕΟΠΥΥ');
    }

    /**
     * Apply deductions to entry
     * @param {string} entryId - Entry ID
     * @param {Object} deductionAmounts - Deduction amounts and percentages
     * @param {string} notes - Optional notes
     * @returns {Promise<Object>} Deduction record
     */
    async applyDeductions(entryId, deductionAmounts, notes = '') {
        try {
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
                    parakratisiPercent: parseFloat(deductionAmounts.parakratisiPercent) || 0,
                    mdePercent: parseFloat(deductionAmounts.mdePercent) || 0,
                    rebatePercent: parseFloat(deductionAmounts.rebatePercent) || 0,
                    krathseisPercent: parseFloat(deductionAmounts.krathseisPercent) || 0,
                    clawbackPercent: parseFloat(deductionAmounts.clawbackPercent) || 0
                },
                clawbackPeriod: deductionAmounts.clawbackPeriod || 'monthly',
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
        } catch (error) {
            console.error('[Deductions] Apply error:', error);
            throw error;
        }
    }

    /**
     * Remove deductions from entry
     * @param {string} entryId - Entry ID
     * @returns {Promise<boolean>} Success status
     */
    async removeDeductions(entryId) {
        try {
            const index = this.deductions.findIndex(d => d.entryId === entryId);
            if (index >= 0) {
                this.deductions.splice(index, 1);
                await this.saveDeductions();
                return true;
            }
            return false;
        } catch (error) {
            console.error('[Deductions] Remove error:', error);
            return false;
        }
    }

    /**
     * Get deductions for entry
     * @param {string} entryId - Entry ID
     * @returns {Object|null} Deduction record
     */
    getDeductions(entryId) {
        return this.deductions.find(d => d.entryId === entryId) || null;
    }

    /**
     * Calculate amounts breakdown for entry
     * @param {Object} entry - Entry object
     * @returns {Object} Amounts breakdown
     */
    getAmountsBreakdown(entry) {
        const originalAmount = parseFloat(entry.originalAmount) || parseFloat(entry.amount);
        
        // ΕΟΠΥΥ entries
        if (this.isEopyyEntry(entry)) {
            const deduction = this.getDeductions(entry.id);
            
            if (!deduction) {
                // No deductions applied yet
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
                    hasDeductions: false,
                    isEopyy: true
                };
            }

            const { parakratisi, mde, rebate, krathseis, clawback } = deduction.deductions;
            const totalDeductions = parakratisi + mde + rebate + krathseis + clawback;
            
            // ✅ ΚΡΙΣΙΜΟ: Default χωρίς παρακράτηση
            const finalAmount = originalAmount - totalDeductions;
            
            // Με παρακράτηση (όταν toggle enabled)
            const finalAmountNoParakratisi = originalAmount - (mde + rebate + krathseis + clawback);

            return {
                originalAmount,
                parakratisi,
                mde,
                rebate,
                krathseis,
                clawback,
                totalDeductions,
                finalAmount, // Χωρίς παρακράτηση (default)
                finalAmountNoParakratisi, // Με παρακράτηση (toggle)
                hasDeductions: true,
                isEopyy: true
            };
        }
        
        // Non-ΕΟΠΥΥ entries (only general krathseis)
        const krathseisAmount = parseFloat(entry.krathseis) || 0;
        
        return {
            originalAmount,
            krathseis: krathseisAmount,
            totalDeductions: krathseisAmount,
            finalAmount: originalAmount - krathseisAmount,
            finalAmountNoParakratisi: originalAmount - krathseisAmount,
            hasDeductions: krathseisAmount > 0,
            isEopyy: false
        };
    }

    /**
     * Calculate KPIs with options
     * @param {Array} entries - Entries array
     * @param {Object} options - {includeParakratisi: boolean}
     * @returns {Object} KPIs
     */
    calculateKPIs(entries, options = {}) {
        const { includeParakratisi = false } = options;

        let eopyyOriginal = 0;
        let eopyyParakratisi = 0;
        let eopyyMDE = 0;
        let eopyyRebate = 0;
        let eopyyKrathseis = 0;
        let eopyyClawback = 0;
        let eopyyFinal = 0;
        let eopyyFinalNoParakratisi = 0;
        let eopyyTotal = 0;
        
        let nonEopyyOriginal = 0;
        let nonEopyyKrathseis = 0;
        let nonEopyyFinal = 0;
        let nonEopyyTotal = 0;

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
                
                // ✅ Λογική toggle
                if (includeParakratisi) {
                    eopyyTotal += amounts.finalAmountNoParakratisi; // Με παρακράτηση
                } else {
                    eopyyTotal += amounts.finalAmount; // Χωρίς παρακράτηση (default)
                }
            } else {
                nonEopyyOriginal += amounts.originalAmount;
                nonEopyyKrathseis += amounts.krathseis || 0;
                nonEopyyFinal += amounts.finalAmount;
            }
        });

        nonEopyyTotal = nonEopyyFinal;
        const total = eopyyTotal + nonEopyyTotal;
        const eopyyTotalDeductions = eopyyParakratisi + eopyyMDE + eopyyRebate + eopyyKrathseis + eopyyClawback;

        return {
            total,
            eopyyOriginal,
            eopyyParakratisi,
            eopyyMDE,
            eopyyRebate,
            eopyyKrathseis,
            eopyyClawback,
            eopyyTotalDeductions,
            eopyyFinal,
            eopyyFinalNoParakratisi,
            eopyyTotal,
            nonEopyyOriginal,
            nonEopyyKrathseis,
            nonEopyyFinal,
            nonEopyyTotal,
            includeParakratisi
        };
    }

    /**
     * Get entries missing deductions (ΕΟΠΥΥ without deductions)
     * @param {Array} entries - Entries array
     * @returns {Array} Entries missing deductions
     */
    getEntriesMissingDeductions(entries) {
        return entries.filter(entry => {
            if (!this.isEopyyEntry(entry)) return false;
            return !this.getDeductions(entry.id);
        });
    }

    /**
     * Get entries with deductions
     * @param {Array} entries - Entries array
     * @returns {Array} Entries with deductions
     */
    getEntriesWithDeductions(entries) {
        return entries.filter(entry => {
            return this.isEopyyEntry(entry) && this.getDeductions(entry.id);
        });
    }

    /**
     * Batch apply deductions by percentage
     * @param {Array} entries - Entries array
     * @param {Object} percentages - Percentage values
     * @param {string} notes - Optional notes
     * @returns {Promise<Object>} Batch result
     */
    async batchApplyDeductions(entries, percentages, notes = '') {
        const eopyyEntries = entries.filter(e => this.isEopyyEntry(e));
        let applied = 0;
        let skipped = 0;

        for (const entry of eopyyEntries) {
            try {
                const originalAmount = parseFloat(entry.originalAmount) || parseFloat(entry.amount);
                
                const deductionAmounts = {
                    parakratisi: (originalAmount * (parseFloat(percentages.parakratisi) || 0)) / 100,
                    parakratisiPercent: parseFloat(percentages.parakratisi) || 0,
                    mde: (originalAmount * (parseFloat(percentages.mde) || 0)) / 100,
                    mdePercent: parseFloat(percentages.mde) || 0,
                    rebate: (originalAmount * (parseFloat(percentages.rebate) || 0)) / 100,
                    rebatePercent: parseFloat(percentages.rebate) || 0,
                    krathseis: (originalAmount * (parseFloat(percentages.krathseis) || 0)) / 100,
                    krathseisPercent: parseFloat(percentages.krathseis) || 0,
                    clawback: (originalAmount * (parseFloat(percentages.clawback) || 0)) / 100,
                    clawbackPercent: parseFloat(percentages.clawback) || 0,
                    clawbackPeriod: percentages.clawbackPeriod || 'monthly'
                };

                await this.applyDeductions(entry.id, deductionAmounts, notes);
                applied++;
            } catch (error) {
                console.error('[Deductions] Batch apply error:', error);
                skipped++;
            }
        }

        return {
            total: eopyyEntries.length,
            applied,
            skipped
        };
    }

    /**
     * Export deductions report
     * @param {Array} entries - Entries array
     * @returns {Object} Report data
     */
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
                    clawbackPeriod: deduction ? deduction.clawbackPeriod : null,
                    notes: deduction ? deduction.notes : ''
                });
            }
        });

        return report;
    }

    /**
     * Calculate deduction percentages from amounts
     * @param {Object} entry - Entry object
     * @returns {Object} Percentage breakdown
     */
    getPercentageBreakdown(entry) {
        const amounts = this.getAmountsBreakdown(entry);
        const original = amounts.originalAmount;

        if (original === 0) {
            return {
                parakratisiPercent: 0,
                mdePercent: 0,
                rebatePercent: 0,
                krathseisPercent: 0,
                clawbackPercent: 0,
                totalPercent: 0
            };
        }

        return {
            parakratisiPercent: (amounts.parakratisi / original) * 100,
            mdePercent: (amounts.mde / original) * 100,
            rebatePercent: (amounts.rebate / original) * 100,
            krathseisPercent: (amounts.krathseis / original) * 100,
            clawbackPercent: (amounts.clawback / original) * 100,
            totalPercent: (amounts.totalDeductions / original) * 100
        };
    }

    /**
     * Validate deduction amounts
     * @param {Object} deductionAmounts - Deduction amounts
     * @param {number} originalAmount - Original amount
     * @returns {Object} Validation result
     */
    validateDeductions(deductionAmounts, originalAmount) {
        const errors = [];
        
        const total = 
            (parseFloat(deductionAmounts.parakratisi) || 0) +
            (parseFloat(deductionAmounts.mde) || 0) +
            (parseFloat(deductionAmounts.rebate) || 0) +
            (parseFloat(deductionAmounts.krathseis) || 0) +
            (parseFloat(deductionAmounts.clawback) || 0);

        if (total > originalAmount) {
            errors.push('Το σύνολο των κρατήσεων υπερβαίνει το αρχικό ποσό');
        }

        if (total < 0) {
            errors.push('Οι κρατήσεις δεν μπορούν να είναι αρνητικές');
        }

        // Check percentages
        const totalPercent = 
            (parseFloat(deductionAmounts.parakratisiPercent) || 0) +
            (parseFloat(deductionAmounts.mdePercent) || 0) +
            (parseFloat(deductionAmounts.rebatePercent) || 0) +
            (parseFloat(deductionAmounts.krathseisPercent) || 0) +
            (parseFloat(deductionAmounts.clawbackPercent) || 0);

        if (totalPercent > 100) {
            errors.push('Το σύνολο των ποσοστών υπερβαίνει το 100%');
        }

        return {
            valid: errors.length === 0,
            errors,
            totalAmount: total,
            totalPercent
        };
    }

    /**
     * Get summary statistics
     * @returns {Object} Summary stats
     */
    getSummaryStats() {
        return {
            totalDeductionRecords: this.deductions.length,
            entriesWithDeductions: this.deductions.length,
            averageDeductionCount: this.deductions.length > 0 ? 
                this.deductions.reduce((sum, d) => {
                    const count = Object.values(d.deductions).filter(v => v > 0).length;
                    return sum + count;
                }, 0) / this.deductions.length : 0
        };
    }
}

// ========================================
// Singleton Instance
// ========================================
const eopyyDeductionsManager = new EopyyDeductionsManager();

// ========================================
// Export
// ========================================
export { EopyyDeductionsManager };
export default eopyyDeductionsManager;
