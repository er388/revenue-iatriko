/**
 * heatmaps.js - Heatmap Visualization Module
 * Canvas-based heatmap rendering with interactive tooltips
 * Version: 1.0
 */

import { STATE } from './state.js';
import { showToast } from './uiRenderers.js';
import { formatCurrency, escapeHtml } from './utils.js';
import eopyyDeductionsManager from './eopyyClawback.js';

/**
 * Heatmap Manager - Main Class
 */
class HeatmapManager {
    constructor() {
        // Color schemes
        this.colorSchemes = {
            revenue: {
                name: 'Έσοδα',
                colors: ['#10b981', '#34d399', '#fbbf24', '#fb923c', '#ef4444'],
                gradient: 'green-red'
            },
            deductions: {
                name: 'Κρατήσεις',
                colors: ['#3b82f6', '#60a5fa', '#8b5cf6', '#a78bfa', '#ec4899'],
                gradient: 'blue-purple'
            },
            count: {
                name: 'Πλήθος',
                colors: ['#e0f2fe', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7'],
                gradient: 'blue-scale'
            }
        };
        
        // Default settings
        this.settings = {
            cellPadding: 2,
            fontSize: 12,
            minCellSize: 60,
            tooltipDelay: 200,
            exportScale: 2 // For high-res exports
        };
        
        // Active heatmaps registry
        this.activeHeatmaps = {};
        
        console.log('🌡️ HeatmapManager initialized');
    }

    /**
     * Generate Month × Year Heatmap
     * Shows revenue distribution across months and years
     */
    generateMonthYearHeatmap(entries, options = {}) {
        console.log('📅 Generating Month × Year heatmap...');
        
        const { includeParakratisi = false, metric = 'revenue' } = options;
        
        // Group data by year and month
        const data = {};
        const years = new Set();
        const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
        
        entries.forEach(entry => {
            const [month, year] = entry.date.split('/');
            
            if (!data[year]) {
                data[year] = {};
                months.forEach(m => data[year][m] = { value: 0, count: 0 });
            }
            
            years.add(year);
            
            // Calculate value based on metric
            let value;
            if (metric === 'count') {
                value = 1;
            } else {
                const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);
                value = includeParakratisi ? amounts.originalAmount : amounts.finalAmount;
            }
            
            data[year][month].value += value;
            data[year][month].count++;
        });
        
        // Convert to matrix format
        const sortedYears = Array.from(years).sort();
        const matrix = [];
        
        months.forEach((month, monthIndex) => {
            const row = {
                label: this.getMonthLabel(monthIndex + 1),
                monthIndex: monthIndex + 1,
                cells: []
            };
            
            sortedYears.forEach(year => {
                const cellData = data[year][month];
                row.cells.push({
                    year,
                    month,
                    value: cellData.value,
                    count: cellData.count,
                    label: `${this.getMonthLabel(monthIndex + 1)} ${year}`
                });
            });
            
            matrix.push(row);
        });
        
        console.log('✅ Month × Year heatmap generated:', matrix.length, 'rows');
        
        return {
            type: 'month-year',
            title: 'Έσοδα ανά Μήνα × Έτος',
            matrix,
            xLabels: sortedYears,
            yLabels: months.map((m, i) => this.getMonthLabel(i + 1)),
            metric,
            scheme: metric === 'count' ? 'count' : 'revenue'
        };
    }

    /**
     * Generate Source × Month Heatmap
     * Shows which diagnostic centers have revenue in which months
     */
    generateSourceMonthHeatmap(entries, options = {}) {
        console.log('🏥 Generating Source × Month heatmap...');
        
        const { includeParakratisi = false, metric = 'revenue' } = options;
        
        // Group data by source and month
        const data = {};
        const allMonths = new Set();
        
        entries.forEach(entry => {
            const source = entry.source;
            const [month, year] = entry.date.split('/');
            const monthKey = `${month}/${year}`;
            
            if (!data[source]) {
                data[source] = {};
            }
            
            if (!data[source][monthKey]) {
                data[source][monthKey] = { value: 0, count: 0 };
            }
            
            allMonths.add(monthKey);
            
            // Calculate value
            let value;
            if (metric === 'count') {
                value = 1;
            } else {
                const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);
                value = includeParakratisi ? amounts.originalAmount : amounts.finalAmount;
            }
            
            data[source][monthKey].value += value;
            data[source][monthKey].count++;
        });
        
        // Sort months chronologically
        const sortedMonths = Array.from(allMonths).sort((a, b) => {
            const [monthA, yearA] = a.split('/').map(Number);
            const [monthB, yearB] = b.split('/').map(Number);
            if (yearA !== yearB) return yearA - yearB;
            return monthA - monthB;
        });
        
        // Limit to last 12 months if too many
        const displayMonths = sortedMonths.slice(-12);
        
        // Convert to matrix
        const sources = Object.keys(data).sort();
        const matrix = [];
        
        sources.forEach(source => {
            const row = {
                label: source,
                cells: []
            };
            
            displayMonths.forEach(monthKey => {
                const cellData = data[source][monthKey] || { value: 0, count: 0 };
                row.cells.push({
                    source,
                    month: monthKey,
                    value: cellData.value,
                    count: cellData.count,
                    label: `${source} - ${monthKey}`
                });
            });
            
            matrix.push(row);
        });
        
        console.log('✅ Source × Month heatmap generated:', matrix.length, 'sources');
        
        return {
            type: 'source-month',
            title: 'Έσοδα ανά Διαγνωστικό × Μήνα',
            matrix,
            xLabels: displayMonths,
            yLabels: sources,
            metric,
            scheme: metric === 'count' ? 'count' : 'revenue'
        };
    }

    /**
     * Generate Insurance × Month Heatmap
     * Shows insurance distribution over time
     */
    generateInsuranceMonthHeatmap(entries, options = {}) {
        console.log('🏢 Generating Insurance × Month heatmap...');
        
        const { includeParakratisi = false, metric = 'revenue' } = options;
        
        // Group data by insurance and month
        const data = {};
        const allMonths = new Set();
        
        entries.forEach(entry => {
            const insurance = entry.insurance;
            const [month, year] = entry.date.split('/');
            const monthKey = `${month}/${year}`;
            
            if (!data[insurance]) {
                data[insurance] = {};
            }
            
            if (!data[insurance][monthKey]) {
                data[insurance][monthKey] = { value: 0, count: 0 };
            }
            
            allMonths.add(monthKey);
            
            // Calculate value
            let value;
            if (metric === 'count') {
                value = 1;
            } else {
                const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);
                value = includeParakratisi ? amounts.originalAmount : amounts.finalAmount;
            }
            
            data[insurance][monthKey].value += value;
            data[insurance][monthKey].count++;
        });
        
        // Sort months
        const sortedMonths = Array.from(allMonths).sort((a, b) => {
            const [monthA, yearA] = a.split('/').map(Number);
            const [monthB, yearB] = b.split('/').map(Number);
            if (yearA !== yearB) return yearA - yearB;
            return monthA - monthB;
        });
        
        // Limit to last 12 months
        const displayMonths = sortedMonths.slice(-12);
        
        // Convert to matrix
        const insurances = Object.keys(data).sort();
        const matrix = [];
        
        insurances.forEach(insurance => {
            const row = {
                label: insurance,
                cells: []
            };
            
            displayMonths.forEach(monthKey => {
                const cellData = data[insurance][monthKey] || { value: 0, count: 0 };
                row.cells.push({
                    insurance,
                    month: monthKey,
                    value: cellData.value,
                    count: cellData.count,
                    label: `${insurance} - ${monthKey}`
                });
            });
            
            matrix.push(row);
        });
        
        console.log('✅ Insurance × Month heatmap generated:', matrix.length, 'insurances');
        
        return {
            type: 'insurance-month',
            title: 'Έσοδα ανά Ασφάλεια × Μήνα',
            matrix,
            xLabels: displayMonths,
            yLabels: insurances,
            metric,
            scheme: metric === 'count' ? 'count' : 'revenue'
        };
    }

    /**
     * Render heatmap on canvas
     */
    renderCanvas(heatmapData, canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error('Canvas not found:', canvasId);
            return null;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('Canvas context not available');
            return null;
        }
        
        // Store reference
        this.activeHeatmaps[canvasId] = {
            data: heatmapData,
            canvas,
            ctx
        };
        
        // Calculate dimensions
        const { matrix, xLabels, yLabels } = heatmapData;
        const numRows = matrix.length;
        const numCols = matrix[0]?.cells.length || 0;
        
        if (numRows === 0 || numCols === 0) {
            ctx.fillStyle = '#64748b';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Δεν υπάρχουν δεδομένα', canvas.width / 2, canvas.height / 2);
            return null;
        }
        
        // Calculate cell size
        const padding = 80; // For labels
        const availableWidth = canvas.width - padding;
        const availableHeight = canvas.height - padding;
        
        const cellWidth = Math.max(this.settings.minCellSize, availableWidth / numCols);
        const cellHeight = Math.max(this.settings.minCellSize, availableHeight / numRows);
        
        // Set canvas size to fit all cells
        const totalWidth = cellWidth * numCols + padding;
        const totalHeight = cellHeight * numRows + padding;
        
        canvas.width = totalWidth;
        canvas.height = totalHeight;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Get color scale
        const colorScale = this.calculateColorScale(heatmapData);
        
        // Draw cells
        matrix.forEach((row, rowIndex) => {
            row.cells.forEach((cell, colIndex) => {
                const x = padding + colIndex * cellWidth;
                const y = padding + rowIndex * cellHeight;
                
                // Get color
                const color = this.getColorForValue(
                    cell.value,
                    colorScale,
                    heatmapData.scheme
                );
                
                // Draw cell
                ctx.fillStyle = color;
                ctx.fillRect(
                    x + this.settings.cellPadding,
                    y + this.settings.cellPadding,
                    cellWidth - this.settings.cellPadding * 2,
                    cellHeight - this.settings.cellPadding * 2
                );
                
                // Draw border
                ctx.strokeStyle = '#e2e8f0';
                ctx.lineWidth = 1;
                ctx.strokeRect(
                    x + this.settings.cellPadding,
                    y + this.settings.cellPadding,
                    cellWidth - this.settings.cellPadding * 2,
                    cellHeight - this.settings.cellPadding * 2
                );
                
                // Draw value text (if cell is large enough)
                if (cellWidth > 70 && cellHeight > 40) {
                    ctx.fillStyle = this.getTextColor(color);
                    ctx.font = `${this.settings.fontSize}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    const text = heatmapData.metric === 'count' 
                        ? cell.count.toString()
                        : this.formatShortCurrency(cell.value);
                    
                    ctx.fillText(
                        text,
                        x + cellWidth / 2,
                        y + cellHeight / 2
                    );
                }
            });
        });
        
        // Draw X labels (bottom)
        ctx.fillStyle = '#475569';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        
        xLabels.forEach((label, index) => {
            const x = padding + index * cellWidth + cellWidth / 2;
            const y = padding + numRows * cellHeight + 10;
            
            // Rotate text if too long
            if (xLabels.length > 8) {
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(-Math.PI / 4);
                ctx.fillText(label, 0, 0);
                ctx.restore();
            } else {
                ctx.fillText(label, x, y);
            }
        });
        
        // Draw Y labels (left)
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        
        yLabels.forEach((label, index) => {
            const x = padding - 10;
            const y = padding + index * cellHeight + cellHeight / 2;
            
            // Truncate long labels
            const maxLen = 15;
            const displayLabel = label.length > maxLen 
                ? label.substring(0, maxLen - 3) + '...'
                : label;
            
            ctx.fillText(displayLabel, x, y);
        });
        
        // Draw title
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(heatmapData.title, canvas.width / 2, 30);
        
        // Setup tooltip on hover
        this.setupTooltip(canvas, heatmapData, cellWidth, cellHeight, padding);
        
        console.log('🎨 Heatmap rendered on canvas:', canvasId);
        
        return {
            canvas,
            colorScale
        };
    }

    /**
     * Calculate color scale from data
     */
    calculateColorScale(heatmapData) {
        const allValues = heatmapData.matrix.flatMap(row => 
            row.cells.map(cell => cell.value)
        ).filter(v => v > 0);
        
        if (allValues.length === 0) {
            return { min: 0, max: 0, range: 0 };
        }
        
        const min = Math.min(...allValues);
        const max = Math.max(...allValues);
        const range = max - min;
        
        return { min, max, range };
    }

    /**
     * Get color for value based on scale
     */
    getColorForValue(value, scale, scheme = 'revenue') {
        if (value === 0) {
            return '#f1f5f9'; // Light gray for zero
        }
        
        const colors = this.colorSchemes[scheme].colors;
        
        // Normalize value (0-1)
        const normalized = scale.range > 0 
            ? (value - scale.min) / scale.range 
            : 0.5;
        
        // Map to color index
        const index = Math.floor(normalized * (colors.length - 1));
        const clampedIndex = Math.max(0, Math.min(colors.length - 1, index));
        
        return colors[clampedIndex];
    }

    /**
     * Get contrasting text color
     */
    getTextColor(bgColor) {
        // Convert hex to RGB
        const r = parseInt(bgColor.slice(1, 3), 16);
        const g = parseInt(bgColor.slice(3, 5), 16);
        const b = parseInt(bgColor.slice(5, 7), 16);
        
        // Calculate luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        return luminance > 0.5 ? '#0f172a' : '#ffffff';
    }

    /**
     * Setup interactive tooltip
     */
    setupTooltip(canvas, heatmapData, cellWidth, cellHeight, padding) {
        // Remove existing listener
        if (canvas._heatmapMouseMove) {
            canvas.removeEventListener('mousemove', canvas._heatmapMouseMove);
        }
        
        // Create tooltip element if doesn't exist
        let tooltip = document.getElementById('heatmap-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'heatmap-tooltip';
            tooltip.className = 'heatmap-tooltip';
            tooltip.style.cssText = `
                position: fixed;
                display: none;
                background: rgba(15, 23, 42, 0.95);
                color: white;
                padding: 0.75rem;
                border-radius: 0.5rem;
                font-size: 0.875rem;
                pointer-events: none;
                z-index: 10000;
                box-shadow: 0 10px 25px rgba(0,0,0,0.3);
                max-width: 250px;
            `;
            document.body.appendChild(tooltip);
        }
        
        // Mouse move handler
        const handleMouseMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Calculate which cell is hovered
            const col = Math.floor((x - padding) / cellWidth);
            const row = Math.floor((y - padding) / cellHeight);
            
            // Check if valid cell
            if (row >= 0 && row < heatmapData.matrix.length &&
                col >= 0 && col < heatmapData.matrix[row].cells.length) {
                
                const cell = heatmapData.matrix[row].cells[col];
                
                // Show tooltip
                tooltip.style.display = 'block';
                tooltip.style.left = `${e.clientX + 15}px`;
                tooltip.style.top = `${e.clientY + 15}px`;
                
                // Format tooltip content
                const valueText = heatmapData.metric === 'count'
                    ? `${cell.count} εγγραφές`
                    : formatCurrency(cell.value);
                
                tooltip.innerHTML = `
                    <div style="font-weight: 600; margin-bottom: 0.25rem;">
                        ${escapeHtml(cell.label)}
                    </div>
                    <div>${valueText}</div>
                    ${cell.count > 0 && heatmapData.metric !== 'count' 
                        ? `<div style="font-size: 0.75rem; opacity: 0.8; margin-top: 0.25rem;">
                            ${cell.count} εγγραφές • 
                            ${formatCurrency(cell.value / cell.count)} μέσος όρος
                           </div>`
                        : ''
                    }
                `;
            } else {
                tooltip.style.display = 'none';
            }
        };
        
        canvas._heatmapMouseMove = handleMouseMove;
        canvas.addEventListener('mousemove', handleMouseMove);
        
        // Mouse leave handler
        canvas.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
    }

    /**
     * Export heatmap as PNG
     */
    exportHeatmapPNG(canvasId, filename = 'heatmap') {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            showToast('Canvas δεν βρέθηκε', 'error');
            return;
        }
        
        try {
            // Convert to blob
            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.png`;
                link.click();
                URL.revokeObjectURL(url);
                
                showToast('PNG εξήχθη επιτυχώς', 'success');
            });
        } catch (error) {
            console.error('PNG export error:', error);
            showToast('Σφάλμα εξαγωγής PNG', 'error');
        }
    }

    /**
     * Helper: Format short currency (K/M suffix)
     */
    formatShortCurrency(value) {
        if (value >= 1000000) {
            return `€${(value / 1000000).toFixed(1)}M`;
        } else if (value >= 1000) {
            return `€${(value / 1000).toFixed(1)}K`;
        } else {
            return `€${value.toFixed(0)}`;
        }
    }

    /**
     * Helper: Get month label
     */
    getMonthLabel(monthNum) {
        const months = [
            'Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαι', 'Ιουν',
            'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'
        ];
        return months[monthNum - 1] || monthNum.toString();
    }

    /**
     * Get available heatmap types
     */
    getAvailableTypes() {
        return [
            { value: 'month-year', label: 'Μήνας × Έτος', icon: '📅' },
            { value: 'source-month', label: 'Διαγνωστικό × Μήνας', icon: '🏥' },
            { value: 'insurance-month', label: 'Ασφάλεια × Μήνας', icon: '🏢' }
        ];
    }

    /**
     * Destroy active heatmap
     */
    destroy(canvasId) {
        if (this.activeHeatmaps[canvasId]) {
            const canvas = this.activeHeatmaps[canvasId].canvas;
            
            // Remove event listeners
            if (canvas._heatmapMouseMove) {
                canvas.removeEventListener('mousemove', canvas._heatmapMouseMove);
            }
            
            delete this.activeHeatmaps[canvasId];
            console.log('🗑️ Heatmap destroyed:', canvasId);
        }
    }
}

// Create singleton instance
const heatmapManager = new HeatmapManager();

// Export
export default heatmapManager;
export { HeatmapManager };
