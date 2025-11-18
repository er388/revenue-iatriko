/**
 * pdfExport.js - Advanced PDF Export Module
 * Updated Î³Î¹Î± Î½Î­Î¿ ÏƒÏÏƒÏ„Î·Î¼Î± ÎºÏÎ±Ï„Î®ÏƒÎµÏ‰Î½
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

    // Helper: Convert Greek text to Latin transliteration for PDF
    greekToLatin(text) {
        const greekMap = {
            'Α': 'A', 'Β': 'V', 'Γ': 'G', 'Δ': 'D', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'I', 'Θ': 'Th',
            'Ι': 'I', 'Κ': 'K', 'Λ': 'L', 'Μ': 'M', 'Ν': 'N', 'Ξ': 'X', 'Ο': 'O', 'Π': 'P',
            'Ρ': 'R', 'Σ': 'S', 'Τ': 'T', 'Υ': 'Y', 'Φ': 'F', 'Χ': 'Ch', 'Ψ': 'Ps', 'Ω': 'O',
            'α': 'a', 'β': 'v', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'i', 'θ': 'th',
            'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p',
            'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'y', 'φ': 'f', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o',
            'ά': 'a', 'έ': 'e', 'ή': 'i', 'ί': 'i', 'ό': 'o', 'ύ': 'y', 'ώ': 'o',
            'Ά': 'A', 'Έ': 'E', 'Ή': 'I', 'Ί': 'I', 'Ό': 'O', 'Ύ': 'Y', 'Ώ': 'O'
        };
        
        return text.split('').map(char => greekMap[char] || char).join('');
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
        doc.text(this.greekToLatin('Αναφορά Εσόδων'), margin, yPos);
        yPos += 10;

        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(this.greekToLatin(`Δημιουργήθηκε: ${formatDateTime(Date.now())}`), margin, yPos);
        yPos += 15;

// Main KPIs
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.text(this.greekToLatin('Βασικοί Δείκτες'), margin, yPos);
        yPos += 8;

        doc.setFontSize(10);
        const mainKpis = [
            [this.greekToLatin('Συνολικά Έσοδα:'), formatCurrency(data.kpis.total)],
            [this.greekToLatin('ΕΟΠΥΥ (Τελικό):'), formatCurrency(data.kpis.eopyyTotal)],
            [this.greekToLatin('Άλλα Ταμεία:'), formatCurrency(data.kpis.nonEopyyTotal)],
            [this.greekToLatin('Σύνολο Κρατήσεων:'), formatCurrency(data.kpis.eopyyTotalDeductions + data.kpis.nonEopyyKrathseis)]
        ];

        mainKpis.forEach(([label, value]) => {
            doc.text(label, margin, yPos);
            doc.text(value, margin + 60, yPos);
            yPos += 6;
        });

        yPos += 10;

// ΕΟΠΥΥ Deductions Breakdown
        doc.setFontSize(14);
        doc.text(this.greekToLatin('Ανάλυση Κρατήσεων ΕΟΠΥΥ'), margin, yPos);
        yPos += 8;

        doc.setFontSize(10);
        const eopyyDeductions = [
            [this.greekToLatin('Αρχικό Ποσό:'), formatCurrency(data.kpis.eopyyOriginal)],
            [this.greekToLatin('Παρακράτηση:'), formatCurrency(data.kpis.eopyyParakratisi)],
            [this.greekToLatin('ΜΔΕ:'), formatCurrency(data.kpis.eopyyMDE)],
            ['Rebate:', formatCurrency(data.kpis.eopyyRebate)],
            [this.greekToLatin('Κρατήσεις:'), formatCurrency(data.kpis.eopyyKrathseis)],
            ['Clawback:', formatCurrency(data.kpis.eopyyClawback)],
            [this.greekToLatin('Τελικό:'), formatCurrency(data.kpis.eopyyFinal)]
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
                doc.text(chart.title, margin, yPos);
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
        doc.text('Î›Î¯ÏƒÏ„Î± Î•Î³Î³ÏÎ±Ï†ÏŽÎ½', margin, yPos);
        yPos += 10;

        // Filters info
        if (Object.keys(filters).length > 0) {
            doc.setFontSize(9);
            doc.setTextColor(100, 100, 100);
            let filterText = 'Î¦Î¯Î»Ï„ÏÎ±: ';
            if (filters.dateFrom) filterText += `Î‘Ï€ÏŒ ${filters.dateFrom} `;
            if (filters.dateTo) filterText += `ÎˆÏ‰Ï‚ ${filters.dateTo} `;
            if (filters.source) filterText += `Î Î·Î³Î®: ${filters.source} `;
            if (filters.insurance) filterText += `Î‘ÏƒÏ†Î¬Î»ÎµÎ¹Î±: ${filters.insurance}`;
            doc.text(filterText, margin, yPos);
            yPos += 8;
        }

        doc.setTextColor(0, 0, 0);
        yPos += 5;

        // Table Header
        doc.setFontSize(8);
        doc.setFillColor(240, 240, 240);
        doc.rect(margin, yPos, pageWidth - 2 * margin, 6, 'F');
        
        doc.text('Î—Î¼/Î½Î¯Î±', margin + 2, yPos + 4);
        doc.text('Î Î·Î³Î®', margin + 20, yPos + 4);
        doc.text('Î‘ÏƒÏ†Î¬Î»ÎµÎ¹Î±', margin + 45, yPos + 4);
        doc.text('Î‘ÏÏ‡Î¹ÎºÏŒ', margin + 70, yPos + 4);
        doc.text('ÎšÏÎ±Ï„.', margin + 90, yPos + 4);
        doc.text('Î¤ÎµÎ»Î¹ÎºÏŒ', margin + 110, yPos + 4);
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
            doc.text(entry.source.substring(0, 10), margin + 20, yPos + 3.5);
            doc.text(entry.insurance.substring(0, 10), margin + 45, yPos + 3.5);
            doc.text(formatCurrency(amounts.originalAmount), margin + 70, yPos + 3.5);
            doc.text(formatCurrency(amounts.totalDeductions), margin + 90, yPos + 3.5);
            doc.text(formatCurrency(amounts.finalAmount), margin + 110, yPos + 3.5);
            
            yPos += 5;
        });

        // Summary
        doc.addPage();
        yPos = margin;

        doc.setFontSize(12);
        doc.text('Î ÎµÏÎ¯Î»Î·ÏˆÎ·', margin, yPos);
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
        doc.text(`Î£ÏÎ½Î¿Î»Î¿ Î•Î³Î³ÏÎ±Ï†ÏŽÎ½: ${entries.length}`, margin, yPos);
        yPos += 6;
        doc.text(`Î‘ÏÏ‡Î¹ÎºÏŒ Î Î¿ÏƒÏŒ: ${formatCurrency(totalOriginal)}`, margin, yPos);
        yPos += 6;
        doc.text(`ÎšÏÎ±Ï„Î®ÏƒÎµÎ¹Ï‚: ${formatCurrency(totalDeductions)}`, margin, yPos);
        yPos += 6;
        doc.text(`Î¤ÎµÎ»Î¹ÎºÏŒ Î Î¿ÏƒÏŒ: ${formatCurrency(totalFinal)}`, margin, yPos);

        const filename = `entries_${new Date().toISOString().slice(0, 10)}.pdf`;
        doc.save(filename);
    }

    async exportForecast(forecastData) {
        await this.init();

        const doc = new this.jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        let yPos = margin;

        doc.setFontSize(20);
        doc.setTextColor(37, 99, 235);
        doc.text('Î‘Î½Î±Ï†Î¿ÏÎ¬ Î ÏÎ¿Î²Î»Î­ÏˆÎµÏ‰Î½', margin, yPos);
        yPos += 15;

        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(forecastData.summary, margin, yPos, { maxWidth: pageWidth - 2 * margin });
        yPos += 30;

        doc.setFontSize(12);
        doc.text('Î“ÏÎ¬Ï†Î·Î¼Î± Î ÏÏŒÎ²Î»ÎµÏˆÎ·Ï‚', margin, yPos);
        yPos += 8;

        try {
            const canvas = document.getElementById('forecastChart');
            if (canvas) {
                const imgData = canvas.toDataURL('image/png');
                const imgWidth = pageWidth - 2 * margin;
                const imgHeight = 100;
                
                doc.addImage(imgData, 'PNG', margin, yPos, imgWidth, imgHeight);
                yPos += imgHeight + 10;
            }
        } catch (error) {
            console.error('Forecast chart export error:', error);
        }

        const filename = `forecast_${new Date().toISOString().slice(0, 10)}.pdf`;
        doc.save(filename);
    }

    async exportHeatmap(canvasId, title) {
        await this.init();

        const doc = new this.jsPDF('l', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;

        doc.setFontSize(16);
        doc.text(title, margin, margin);

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