/**
 * pdfExport.js - PDF Export Manager with Greek Support
 * FIXED: Greek character encoding
 * Version: 2.1
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
    maxWidth: 180
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

    checkDependencies() {
        if (typeof window !== 'undefined') {
            this.jsPDF = window.jspdf?.jsPDF;
            this.html2canvas = window.html2canvas;
        }
    }

    areDependenciesAvailable() {
        this.checkDependencies();
        return this.jsPDF && this.html2canvas;
    }

    /**
     * ✅ FIXED: Create PDF instance with Greek support
     */
    createPDFInstance(options = {}) {
        const doc = new this.jsPDF({
            orientation: options.orientation || PDF_CONFIG.orientation,
            unit: options.unit || PDF_CONFIG.unit,
            format: options.format || PDF_CONFIG.format,
            compress: true,
            // ✅ Enable better Unicode handling
            putOnlyUsedFonts: true,
            floatPrecision: 16
        });
        
        // ✅ CRITICAL: Set language for Greek support
        try {
            doc.setLanguage("el-GR");
        } catch (e) {
            console.warn('[PDF] Language setting not supported:', e);
        }
        
        return doc;
    }

    /**
     * ✅ ALTERNATIVE METHOD: Use html2canvas for Greek text
     * This is MORE RELIABLE than text-based PDF generation
     */
    async exportAsImage(elementId, filename) {
        if (!this.html2canvas) {
            throw new Error('html2canvas not available');
        }

        const element = document.getElementById(elementId);
        if (!element) {
            throw new Error('Element not found: ' + elementId);
        }

        try {
            // Capture element as image
            const canvas = await this.html2canvas(element, {
                scale: 2, // High quality
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                windowWidth: element.scrollWidth,
                windowHeight: element.scrollHeight
            });

            // Create PDF
            const doc = this.createPDFInstance({
                orientation: canvas.width > canvas.height ? 'landscape' : 'portrait'
            });

            const imgData = canvas.toDataURL('image/png');
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            
            const imgWidth = pageWidth - (PDF_CONFIG.margins.left + PDF_CONFIG.margins.right);
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            let yPos = PDF_CONFIG.margins.top;

            // Add image (handles multiple pages if needed)
            if (imgHeight <= pageHeight - PDF_CONFIG.margins.top - PDF_CONFIG.margins.bottom) {
                doc.addImage(imgData, 'PNG', PDF_CONFIG.margins.left, yPos, imgWidth, imgHeight);
            } else {
                // Split across multiple pages
                let remainingHeight = imgHeight;
                let sourceY = 0;
                
                while (remainingHeight > 0) {
                    const pageImgHeight = Math.min(
                        remainingHeight,
                        pageHeight - PDF_CONFIG.margins.top - PDF_CONFIG.margins.bottom
                    );
                    
                    doc.addImage(
                        imgData, 
                        'PNG', 
                        PDF_CONFIG.margins.left, 
                        PDF_CONFIG.margins.top,
                        imgWidth,
                        pageImgHeight,
                        undefined,
                        'FAST',
                        0,
                        -sourceY
                    );
                    
                    remainingHeight -= pageImgHeight;
                    sourceY += pageImgHeight;
                    
                    if (remainingHeight > 0) {
                        doc.addPage();
                    }
                }
            }

            doc.save(filename);
            console.log('[PDF] Exported as image:', filename);
        } catch (error) {
            console.error('[PDF] Image export error:', error);
            throw error;
        }
    }

    // ========================================
    // Dashboard Export (IMAGE-BASED - RELIABLE)
    // ========================================
    async exportDashboard(data) {
        if (!this.areDependenciesAvailable()) {
            throw new Error('PDF dependencies not loaded');
        }

        try {
            // ✅ USE IMAGE-BASED EXPORT FOR RELIABILITY
            const filename = `dashboard_${this.getDateString()}.pdf`;
            await this.exportAsImage('dashboardView', filename);
            console.log('[PDF] Dashboard exported successfully');
        } catch (error) {
            console.error('[PDF] Dashboard export error:', error);
            throw error;
        }
    }

    // ========================================
    // Entries List Export (IMAGE-BASED)
    // ========================================
    async exportEntriesList(entries, filters = {}) {
        if (!this.areDependenciesAvailable()) {
            throw new Error('PDF dependencies not loaded');
        }

        try {
            const filename = `entries_${this.getDateString()}.pdf`;
            await this.exportAsImage('entriesView', filename);
            console.log('[PDF] Entries exported successfully');
        } catch (error) {
            console.error('[PDF] Entries export error:', error);
            throw error;
        }
    }

    // ========================================
    // Chart/Heatmap Export (CANVAS-BASED)
    // ========================================
    async exportHeatmap(canvasId, title) {
        if (!this.areDependenciesAvailable()) {
            throw new Error('PDF dependencies not loaded');
        }

        try {
            const canvas = document.getElementById(canvasId);
            if (!canvas) {
                throw new Error(`Canvas not found: ${canvasId}`);
            }

            const doc = this.createPDFInstance({
                orientation: canvas.width > canvas.height ? 'landscape' : 'portrait'
            });

            const imgData = canvas.toDataURL('image/png');
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            
            const maxWidth = pageWidth - (PDF_CONFIG.margins.left + PDF_CONFIG.margins.right);
            const maxHeight = pageHeight - PDF_CONFIG.margins.top - PDF_CONFIG.margins.bottom;

            const imgWidth = Math.min(maxWidth, (canvas.width * maxHeight) / canvas.height);
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            doc.addImage(
                imgData, 
                'PNG', 
                PDF_CONFIG.margins.left, 
                PDF_CONFIG.margins.top, 
                imgWidth, 
                imgHeight
            );

            const filename = `${title}_${this.getDateString()}.pdf`;
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
    getDateString() {
        return new Date().toISOString().slice(0, 10);
    }
}

// ========================================
// Singleton Instance
// ========================================
const pdfExportManager = new PDFExportManager();

export { PDFExportManager };
export default pdfExportManager;
