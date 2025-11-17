/**
 * pdfExport.js - Advanced PDF Export Module with Greek Support
 * Διορθωμένη έκδοση με σωστή κωδικοποίηση Ελληνικών
 */

import { formatCurrency, formatDateTime } from './utils.js';
import eopyyDeductionsManager from './eopyyClawback.js';

// ========================================
// PDF Export Manager
// ========================================
class PDFExportManager {
    constructor() {
        this.jsPDF = null;
        this.html2canvas = null;
    }

    async init() {
        if (typeof window.jspdf !== 'undefined') {
            this.jsPDF = window.jspdf.jsPDF;
        }
        if (typeof window.html2canvas !== 'undefined') {
            this.html2canvas = window.html2canvas;
        }

        if (!this.jsPDF || !this.html2canvas) {
            throw new Error('jsPDF or html2canvas not loaded');
        }
    }

    async exportDashboard(data) {
        await this.init();

        const doc = new this.jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        let yPos = margin;

        // Header
        doc.setFontSize(20);
        doc.setTextColor(37, 99, 235);
        doc.text('Anafora Esodon', margin, yPos);
        yPos += 10;

        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(`Dimiourgitheike: ${formatDateTime(Date.now())}`, margin, yPos);
        yPos += 15;

        // Main KPIs
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.text('Vasikoi Deiktes', margin, yPos);
        yPos += 8;

        doc.setFontSize(10);
        const mainKpis = [
            ['Synolika Esoda:', formatCurrency(data.kpis.total)],
            ['EOPYY (Teliko):', formatCurrency(data.kpis.eopyyTotal)],
            ['Alla Tameia:', formatCurrency(data.kpis.nonEopyyTotal)],
            ['Synolo Kratiseon:', formatCurrency(data.kpis.eopyyTotalDeductions + data.kpis.nonEopyyKrathseis)]
        ];

        mainKpis.forEach(([label, value]) => {
            doc.text(label, margin, yPos);
            doc.text(value, margin + 60, yPos);
            yPos += 6;
        });

        yPos += 10;

        // ΕΟΠΥΥ Deductions Breakdown
        doc.setFontSize(14);
        doc.text('Analysi Kratiseon EOPYY', margin, yPos);
        yPos += 8;

        doc.setFontSize(10);
        const eopyyDeductions = [
            ['Arxiko Poso:', formatCurrency(data.kpis.eopyyOriginal)],
            ['Parakratisi:', formatCurrency(data.kpis.eopyyParakratisi)],
            ['MDE:', formatCurrency(data.kpis.eopyyMDE)],
            ['Rebate:', formatCurrency(data.kpis.eopyyRebate)],
            ['Kratiseis:', formatCurrency(data.kpis.eopyyKrathseis)],
            ['Clawback:', formatCurrency(data.kpis.eopyyClawback)],
            ['Teliko:', formatCurrency(data.kpis.eopyyFinal)]
        ];

        eopyyDeductions.forEach(([label, value]) => {
            doc.text(label, margin, yPos);
            doc.text(value, margin + 60, yPos);
            yPos += 6;
        });

        yPos += 10;

        // Charts
        if (data.charts && data.charts.length > 0) {
            for (let i = 0; i < data.charts.length; i++) {
                const chart = data.charts[i];

                if (yPos + 80 > pageHeight - margin) {
                    doc.addPage();
                    yPos = margin;
                }

                doc.setFontSize(12);
                doc.text(this.transliterate(chart.title), margin, yPos);
                yPos += 8;

                try {
                    const canvas = document.getElementById(chart.canvasId);
                    if (canvas) {
                        const imgData = canvas.toDataURL('image/png');
                        const imgWidth = pageWidth - 2 * margin;
                        const imgHeight = 70;
                        
                        doc.addImage(imgData, 'PNG', margin, yPos, imgWidth, imgHeight);
                        yPos += imgHeight + 10;
                    }
                } catch (error) {
                    console.error('Chart export error:', error);
                }
            }
        }

        const filename = `dashboard_${new Date().toISOString().slice(0, 10)}.pdf`;
        doc.save(filename);
    }

    async exportEntriesList(entries, filters = {}) {
        await this.init();

        const doc = new this.jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        let yPos = margin;

        // Header
        doc.setFontSize(16);
        doc.text('Lista Egrafon', margin, yPos);
        yPos += 10;

        // Filters info
        if (Object.keys(filters).length > 0) {
            doc.setFontSize(9);
            doc.setTextColor(100, 100, 100);
            let filterText = 'Filtra: ';
            if (filters.dateFrom) filterText += `Apo ${filters.dateFrom} `;
            if (filters.dateTo) filterText += `Eos ${filters.dateTo} `;
            if (filters.source) filterText += `Pigi: ${this.transliterate(filters.source)} `;
            if (filters.insurance) filterText += `Asfaleia: ${this.transliterate(filters.insurance)}`;
            doc.text(filterText, margin, yPos);
            yPos += 8;
        }

        doc.setTextColor(0, 0, 0);
        yPos += 5;

        // Table Header
        doc.setFontSize(8);
        doc.setFillColor(240, 240, 240);
        doc.rect(margin, yPos, pageWidth - 2 * margin, 6, 'F');
        
        doc.text('Im/nia', margin + 2, yPos + 4);
        doc.text('Pigi', margin + 20, yPos + 4);
        doc.text('Asfaleia', margin + 45, yPos + 4);
        doc.text('Arxiko', margin + 70, yPos + 4);
        doc.text('Krat.', margin + 90, yPos + 4);
        doc.text('Teliko', margin + 110, yPos + 4);
        yPos += 6;

        // Rows
        entries.forEach((entry, index) => {
            if (yPos > 270) {
                doc.addPage();
                yPos = margin;
            }

            if (index % 2 === 0) {
                doc.setFillColor(250, 250, 250);
                doc.rect(margin, yPos, pageWidth - 2 * margin, 5, 'F');
            }

            const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);

            doc.text(entry.date, margin + 2, yPos + 3.5);
            doc.text(this.transliterate(entry.source.substring(0, 10)), margin + 20, yPos + 3.5);
            doc.text(this.transliterate(entry.insurance.substring(0, 10)), margin + 45, yPos + 3.5);
            doc.text(formatCurrency(amounts.originalAmount), margin + 70, yPos + 3.5);
            doc.text(formatCurrency(amounts.totalDeductions), margin + 90, yPos + 3.5);
            doc.text(formatCurrency(amounts.finalAmount), margin + 110, yPos + 3.5);
            
            yPos += 5;
        });

        // Summary
        doc.addPage();
        yPos = margin;

        doc.setFontSize(12);
        doc.text('Perilipsi', margin, yPos);
        yPos += 10;

        const totalOriginal = entries.reduce((sum, e) => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return sum + amounts.originalAmount;
        }, 0);

        const totalDeductions = entries.reduce((sum, e) => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return sum + amounts.totalDeductions;
        }, 0);

        const totalFinal = entries.reduce((sum, e) => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return sum + amounts.finalAmount;
        }, 0);

        doc.setFontSize(10);
        doc.text(`Synolo Egrafon: ${entries.length}`, margin, yPos);
        yPos += 6;
        doc.text(`Arxiko Poso: ${formatCurrency(totalOriginal)}`, margin, yPos);
        yPos += 6;
        doc.text(`Kratiseis: ${formatCurrency(totalDeductions)}`, margin, yPos);
        yPos += 6;
        doc.text(`Teliko Poso: ${formatCurrency(totalFinal)}`, margin, yPos);

        const filename = `entries_${new Date().toISOString().slice(0, 10)}.pdf`;
        doc.save(filename);
    }

    async exportHeatmap(canvasId, title) {
        await this.init();

        const doc = new this.jsPDF('l', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;

        doc.setFontSize(16);
        doc.text(this.transliterate(title), margin, margin);

        try {
            const canvas = document.getElementById(canvasId);
            if (canvas) {
                const imgData = canvas.toDataURL('image/png');
                const imgWidth = pageWidth - 2 * margin;
                const imgHeight = pageHeight - 2 * margin - 10;
                
                doc.addImage(imgData, 'PNG', margin, margin + 10, imgWidth, imgHeight);
            }
        } catch (error) {
            console.error('Heatmap export error:', error);
        }

        const filename = `heatmap_${new Date().toISOString().slice(0, 10)}.pdf`;
        doc.save(filename);
    }

    /**
     * Transliterate Greek to Latin characters
     * @param {string} text - Greek text
     * @returns {string} - Transliterated text
     */
    transliterate(text) {
        if (!text) return '';
        
        const greekToLatin = {
            'Α': 'A', 'Β': 'V', 'Γ': 'G', 'Δ': 'D', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'I', 'Θ': 'Th',
            'Ι': 'I', 'Κ': 'K', 'Λ': 'L', 'Μ': 'M', 'Ν': 'N', 'Ξ': 'X', 'Ο': 'O', 'Π': 'P',
            'Ρ': 'R', 'Σ': 'S', 'Τ': 'T', 'Υ': 'Y', 'Φ': 'F', 'Χ': 'Ch', 'Ψ': 'Ps', 'Ω': 'O',
            'α': 'a', 'β': 'v', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'i', 'θ': 'th',
            'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p',
            'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'y', 'φ': 'f', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o',
            'ά': 'a', 'έ': 'e', 'ή': 'i', 'ί': 'i', 'ό': 'o', 'ύ': 'y', 'ώ': 'o',
            'Ά': 'A', 'Έ': 'E', 'Ή': 'I', 'Ί': 'I', 'Ό': 'O', 'Ύ': 'Y', 'Ώ': 'O',
            'ϊ': 'i', 'ϋ': 'y', 'ΐ': 'i', 'ΰ': 'y'
        };
        
        return text.split('').map(char => greekToLatin[char] || char).join('');
    }
}

// ========================================
// Singleton Instance
// ========================================
const pdfExportManager = new PDFExportManager();

// ========================================
// Exports
// ========================================
export { PDFExportManager };
export default pdfExportManager;