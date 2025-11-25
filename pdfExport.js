/**
 * pdfExport.js - PDF Export Manager
 * Full implementation with Dashboard, Entries List, and Charts export
 * Version: 2.0 (Complete)
 */

import { formatCurrency, formatDateTime, escapeHtml } from './utils.js';
import eopyyDeductionsManager from './eopyyClawback.js';

// ========================================
// Configuration
// ========================================
const PDF_CONFIG = {
    format: 'a4',
    orientation: 'portrait',
    unit: 'mm',
    margins: {
        top: 15,
        bottom: 15,
        left: 15,
        right: 15
    },
    fontSize: {
        title: 18,
        subtitle: 14,
        body: 10,
        small: 8
    },
    colors: {
        primary: '#2563eb',
        text: '#1f2937',
        lightGray: '#f3f4f6',
        border: '#e5e7eb'
    },
    lineHeight: 1.5,
    maxWidth: 180 // A4 width minus margins
};

// ========================================
// PDF Export Manager Class
// ========================================
class PDFExportManager {
    constructor() {
        this.jsPDF = null;
        this.html2canvas = null;
        this.checkDependencies();
    }

    /**
     * Check if dependencies are loaded
     * @private
     */
    checkDependencies() {
        if (typeof window !== 'undefined') {
            this.jsPDF = window.jspdf?.jsPDF;
            this.html2canvas = window.html2canvas;
        }
    }

    /**
     * Verify dependencies are available
     * @returns {boolean} Available or not
     * @private
     */
    areDependenciesAvailable() {
        this.checkDependencies();
        return this.jsPDF && this.html2canvas;
    }

    // ========================================
    // Dashboard PDF Export
    // ========================================

    /**
     * Export dashboard to PDF
     * @param {Object} data - Dashboard data
     * @returns {Promise<void>}
     */
    async exportDashboard(data) {
        if (!this.areDependenciesAvailable()) {
            throw new Error('PDF dependencies not loaded');
        }

        try {
            const doc = new this.jsPDF({
                orientation: PDF_CONFIG.orientation,
                unit: PDF_CONFIG.unit,
                format: PDF_CONFIG.format
            });

            let yPos = PDF_CONFIG.margins.top;

            // Header
            yPos = this.addHeader(doc, 'Dashboard - Επισκόπηση', yPos);
            yPos += 10;

            // KPIs Summary
            yPos = this.addKPIsSection(doc, data.kpis, yPos);
            yPos += 5;

            // Charts (if provided)
            if (data.charts && data.charts.length > 0) {
                yPos = await this.addChartsSection(doc, data.charts, yPos);
            }

            // Footer
            this.addFooter(doc);

            // Save
            const filename = `dashboard_${this.getDateString()}.pdf`;
            doc.save(filename);

            console.log('[PDF] Dashboard exported:', filename);
        } catch (error) {
            console.error('[PDF] Dashboard export error:', error);
            throw error;
        }
    }

    /**
     * Add KPIs section to PDF
     * @param {Object} doc - jsPDF instance
     * @param {Object} kpis - KPI data
     * @param {number} yPos - Y position
     * @returns {number} New Y position
     * @private
     */
    addKPIsSection(doc, kpis, yPos) {
        // Section title
        doc.setFontSize(PDF_CONFIG.fontSize.subtitle);
        doc.setTextColor(PDF_CONFIG.colors.primary);
        doc.text('Βασικοί Δείκτες (KPIs)', PDF_CONFIG.margins.left, yPos);
        yPos += 7;

        // Reset color
        doc.setTextColor(PDF_CONFIG.colors.text);
        doc.setFontSize(PDF_CONFIG.fontSize.body);

        // KPI items
        const kpiItems = [
            { label: 'Συνολικά Έσοδα', value: kpis.total },
            { label: 'ΕΟΠΥΥ', value: kpis.eopyyTotal },
            { label: 'Άλλα Ταμεία', value: kpis.nonEopyyTotal },
            { label: 'Κρατήσεις (Σύνολο)', value: kpis.eopyyTotalDeductions + kpis.nonEopyyKrathseis }
        ];

        // ΕΟΠΥΥ Breakdown
        const eopyyBreakdown = [
            { label: '  Παρακράτηση', value: kpis.eopyyParakratisi },
            { label: '  ΜΔΕ', value: kpis.eopyyMDE },
            { label: '  Rebate', value: kpis.eopyyRebate },
            { label: '  Κρατήσεις', value: kpis.eopyyKrathseis },
            { label: '  Clawback', value: kpis.eopyyClawback }
        ];

        // Draw main KPIs
        kpiItems.forEach(item => {
            doc.text(item.label + ':', PDF_CONFIG.margins.left, yPos);
            doc.text(formatCurrency(item.value), PDF_CONFIG.margins.left + 80, yPos, { align: 'right' });
            yPos += 6;
        });

        yPos += 2;

        // Draw ΕΟΠΥΥ breakdown
        doc.setFontSize(PDF_CONFIG.fontSize.small);
        doc.setTextColor('#6b7280');
        eopyyBreakdown.forEach(item => {
            doc.text(item.label + ':', PDF_CONFIG.margins.left, yPos);
            doc.text(formatCurrency(item.value), PDF_CONFIG.margins.left + 80, yPos, { align: 'right' });
            yPos += 5;
        });

        // Reset
        doc.setFontSize(PDF_CONFIG.fontSize.body);
        doc.setTextColor(PDF_CONFIG.colors.text);

        return yPos + 5;
    }

    /**
     * Add charts section to PDF
     * @param {Object} doc - jsPDF instance
     * @param {Array} charts - Chart configs
     * @param {number} yPos - Y position
     * @returns {Promise<number>} New Y position
     * @private
     */
    async addChartsSection(doc, charts, yPos) {
        for (const chart of charts) {
            // Check if we need a new page
            if (yPos > 220) {
                doc.addPage();
                yPos = PDF_CONFIG.margins.top;
            }

            // Chart title
            doc.setFontSize(PDF_CONFIG.fontSize.subtitle);
            doc.setTextColor(PDF_CONFIG.colors.primary);
            doc.text(chart.title, PDF_CONFIG.margins.left, yPos);
            yPos += 8;
            doc.setTextColor(PDF_CONFIG.colors.text);

            // Capture chart canvas
            const canvas = document.getElementById(chart.canvasId);
            if (canvas) {
                try {
                    const imgData = canvas.toDataURL('image/png');
                    const imgWidth = 180;
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;

                    doc.addImage(imgData, 'PNG', PDF_CONFIG.margins.left, yPos, imgWidth, imgHeight);
                    yPos += imgHeight + 10;
                } catch (error) {
                    console.warn('[PDF] Chart capture failed:', chart.canvasId, error);
                }
            }
        }

        return yPos;
    }

    // ========================================
    // Entries List PDF Export
    // ========================================

    /**
     * Export entries list to PDF
     * @param {Array} entries - Entries to export
     * @param {Object} filters - Active filters
     * @returns {Promise<void>}
     */
    async exportEntriesList(entries, filters = {}) {
        if (!this.areDependenciesAvailable()) {
            throw new Error('PDF dependencies not loaded');
        }

        try {
            const doc = new this.jsPDF({
                orientation: 'landscape',
                unit: PDF_CONFIG.unit,
                format: PDF_CONFIG.format
            });

            let yPos = PDF_CONFIG.margins.top;

            // Header
            yPos = this.addHeader(doc, 'Λίστα Εγγραφών', yPos);
            yPos += 5;

            // Filters info (if any)
            if (Object.keys(filters).some(k => filters[k])) {
                yPos = this.addFiltersInfo(doc, filters, yPos);
                yPos += 5;
            }

            // Summary
            yPos = this.addEntriesSummary(doc, entries, yPos);
            yPos += 5;

            // Table
            yPos = this.addEntriesTable(doc, entries, yPos);

            // Footer
            this.addFooter(doc);

            // Save
            const filename = `entries_${this.getDateString()}.pdf`;
            doc.save(filename);

            console.log('[PDF] Entries exported:', filename);
        } catch (error) {
            console.error('[PDF] Entries export error:', error);
            throw error;
        }
    }

    /**
     * Add filters info to PDF
     * @param {Object} doc - jsPDF instance
     * @param {Object} filters - Active filters
     * @param {number} yPos - Y position
     * @returns {number} New Y position
     * @private
     */
    addFiltersInfo(doc, filters, yPos) {
        doc.setFontSize(PDF_CONFIG.fontSize.small);
        doc.setTextColor('#6b7280');

        const filterTexts = [];
        if (filters.dateFrom) filterTexts.push(`Από: ${filters.dateFrom}`);
        if (filters.dateTo) filterTexts.push(`Έως: ${filters.dateTo}`);
        if (filters.source) filterTexts.push(`Διαγνωστικό: ${filters.source}`);
        if (filters.insurance) filterTexts.push(`Ασφάλεια: ${filters.insurance}`);
        if (filters.type) filterTexts.push(`Τύπος: ${filters.type === 'cash' ? 'Μετρητά' : 'Τιμολόγια'}`);

        if (filterTexts.length > 0) {
            doc.text('Φίλτρα: ' + filterTexts.join(' | '), PDF_CONFIG.margins.left, yPos);
            yPos += 5;
        }

        doc.setFontSize(PDF_CONFIG.fontSize.body);
        doc.setTextColor(PDF_CONFIG.colors.text);

        return yPos;
    }

    /**
     * Add entries summary to PDF
     * @param {Object} doc - jsPDF instance
     * @param {Array} entries - Entries
     * @param {number} yPos - Y position
     * @returns {number} New Y position
     * @private
     */
    addEntriesSummary(doc, entries, yPos) {
        const total = entries.reduce((sum, e) => {
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(e);
            return sum + amounts.finalAmount;
        }, 0);

        doc.setFontSize(PDF_CONFIG.fontSize.body);
        doc.text(`Σύνολο Εγγραφών: ${entries.length}`, PDF_CONFIG.margins.left, yPos);
        doc.text(`Συνολικό Ποσό: ${formatCurrency(total)}`, 200, yPos);

        return yPos + 7;
    }

    /**
     * Add entries table to PDF
     * @param {Object} doc - jsPDF instance
     * @param {Array} entries - Entries
     * @param {number} yPos - Y position
     * @returns {number} New Y position
     * @private
     */
    addEntriesTable(doc, entries, yPos) {
        // Table headers
        const headers = ['Ημ/νία', 'Διαγνωστικό', 'Ασφάλεια', 'Τύπος', 'Αρχικό €', 'Κρατ. €', 'Τελικό €'];
        const colWidths = [25, 50, 45, 25, 30, 30, 30];
        const startX = PDF_CONFIG.margins.left;

        // Draw header row
        doc.setFillColor(PDF_CONFIG.colors.lightGray);
        doc.rect(startX, yPos - 4, colWidths.reduce((a, b) => a + b, 0), 7, 'F');
        
        doc.setFontSize(PDF_CONFIG.fontSize.small);
        doc.setFont(undefined, 'bold');

        let xPos = startX;
        headers.forEach((header, i) => {
            doc.text(header, xPos + 2, yPos);
            xPos += colWidths[i];
        });

        yPos += 5;
        doc.setFont(undefined, 'normal');

        // Draw data rows
        const maxRows = 30; // Max rows per page
        let rowCount = 0;

        entries.forEach((entry, index) => {
            // Check if we need a new page
            if (rowCount >= maxRows) {
                doc.addPage();
                yPos = PDF_CONFIG.margins.top;
                
                // Redraw header
                doc.setFillColor(PDF_CONFIG.colors.lightGray);
                doc.rect(startX, yPos - 4, colWidths.reduce((a, b) => a + b, 0), 7, 'F');
                doc.setFont(undefined, 'bold');
                xPos = startX;
                headers.forEach((header, i) => {
                    doc.text(header, xPos + 2, yPos);
                    xPos += colWidths[i];
                });
                yPos += 5;
                doc.setFont(undefined, 'normal');
                rowCount = 0;
            }

            const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);

            // Draw row background (alternating)
            if (index % 2 === 0) {
                doc.setFillColor('#fafafa');
                doc.rect(startX, yPos - 4, colWidths.reduce((a, b) => a + b, 0), 6, 'F');
            }

            // Draw cell data
            xPos = startX;
            const rowData = [
                entry.date,
                this.truncateText(entry.source, 18),
                this.truncateText(entry.insurance, 16),
                entry.type === 'cash' ? 'Μετρ.' : 'Τιμολ.',
                amounts.originalAmount.toFixed(2),
                amounts.totalDeductions.toFixed(2),
                amounts.finalAmount.toFixed(2)
            ];

            rowData.forEach((data, i) => {
                const align = i >= 4 ? 'right' : 'left';
                const offset = align === 'right' ? colWidths[i] - 2 : 2;
                doc.text(data.toString(), xPos + offset, yPos, { align });
                xPos += colWidths[i];
            });

            yPos += 6;
            rowCount++;
        });

        return yPos;
    }

    // ========================================
    // Chart/Heatmap PDF Export
    // ========================================

    /**
     * Export chart/heatmap to PDF
     * @param {string} canvasId - Canvas element ID
     * @param {string} title - Chart title
     * @returns {Promise<void>}
     */
    async exportHeatmap(canvasId, title) {
        if (!this.areDependenciesAvailable()) {
            throw new Error('PDF dependencies not loaded');
        }

        try {
            const canvas = document.getElementById(canvasId);
            if (!canvas) {
                throw new Error(`Canvas not found: ${canvasId}`);
            }

            const doc = new this.jsPDF({
                orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
                unit: PDF_CONFIG.unit,
                format: PDF_CONFIG.format
            });

            let yPos = PDF_CONFIG.margins.top;

            // Header
            yPos = this.addHeader(doc, title, yPos);
            yPos += 10;

            // Capture canvas
            const imgData = canvas.toDataURL('image/png');
            const maxWidth = doc.internal.pageSize.getWidth() - (PDF_CONFIG.margins.left + PDF_CONFIG.margins.right);
            const maxHeight = doc.internal.pageSize.getHeight() - yPos - PDF_CONFIG.margins.bottom;

            const imgWidth = Math.min(maxWidth, (canvas.width * maxHeight) / canvas.height);
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            doc.addImage(imgData, 'PNG', PDF_CONFIG.margins.left, yPos, imgWidth, imgHeight);

            // Footer
            this.addFooter(doc);

            // Save
            const filename = `chart_${this.getDateString()}.pdf`;
            doc.save(filename);

            console.log('[PDF] Chart exported:', filename);
        } catch (error) {
            console.error('[PDF] Chart export error:', error);
            throw error;
        }
    }

    // ========================================
    // Helper Methods
    // ========================================

    /**
     * Add header to PDF
     * @param {Object} doc - jsPDF instance
     * @param {string} title - Page title
     * @param {number} yPos - Y position
     * @returns {number} New Y position
     * @private
     */
    addHeader(doc, title, yPos) {
        // Title
        doc.setFontSize(PDF_CONFIG.fontSize.title);
        doc.setTextColor(PDF_CONFIG.colors.primary);
        doc.text(title, PDF_CONFIG.margins.left, yPos);

        // Date/time
        doc.setFontSize(PDF_CONFIG.fontSize.small);
        doc.setTextColor('#6b7280');
        const dateStr = formatDateTime(Date.now());
        const pageWidth = doc.internal.pageSize.getWidth();
        doc.text(dateStr, pageWidth - PDF_CONFIG.margins.right, yPos, { align: 'right' });

        // Line
        yPos += 3;
        doc.setDrawColor(PDF_CONFIG.colors.border);
        doc.line(PDF_CONFIG.margins.left, yPos, pageWidth - PDF_CONFIG.margins.right, yPos);

        doc.setTextColor(PDF_CONFIG.colors.text);
        return yPos + 5;
    }

    /**
     * Add footer to PDF
     * @param {Object} doc - jsPDF instance
     * @private
     */
    addFooter(doc) {
        const pageCount = doc.internal.getNumberOfPages();
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageWidth = doc.internal.pageSize.getWidth();

        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            
            // Line
            const yPos = pageHeight - PDF_CONFIG.margins.bottom + 3;
            doc.setDrawColor(PDF_CONFIG.colors.border);
            doc.line(PDF_CONFIG.margins.left, yPos, pageWidth - PDF_CONFIG.margins.right, yPos);

            // Page number
            doc.setFontSize(PDF_CONFIG.fontSize.small);
            doc.setTextColor('#9ca3af');
            doc.text(
                `Σελίδα ${i} από ${pageCount}`,
                pageWidth / 2,
                yPos + 5,
                { align: 'center' }
            );

            // App name
            doc.text(
                'Revenue Management System',
                PDF_CONFIG.margins.left,
                yPos + 5
            );
        }
    }

    /**
     * Truncate text to max length
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Max length
     * @returns {string} Truncated text
     * @private
     */
    truncateText(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength - 2) + '..' : text;
    }

    /**
     * Get date string for filename
     * @returns {string} Date string (YYYY-MM-DD)
     * @private
     */
    getDateString() {
        return new Date().toISOString().slice(0, 10);
    }
}

// ========================================
// Singleton Instance
// ========================================
const pdfExportManager = new PDFExportManager();

// ========================================
// Export
// ========================================
export { PDFExportManager };
export default pdfExportManager;