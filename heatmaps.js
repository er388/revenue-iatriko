/**
 * heatmaps.js - Heatmap Visualization Module
 * Generate interactive heatmaps for revenue data
 * Version: 1.0
 */

import { STATE } from './state.js';
import eopyyDeductionsManager from './eopyyClawback.js';
import { formatCurrency, parseMonthYear, compareDates } from './utils.js';

// ========================================
// Configuration
// ========================================
const HEATMAP_CONFIG = {
    cellSize: 60,
    cellPadding: 2,
    fontSize: {
        label: 12,
        value: 10,
        axis: 11
    },
    colors: {
        min: '#e0f2fe', // Light blue
        mid: '#3b82f6', // Blue
        max: '#1e40af', // Dark blue
        text: '#1f2937',
        textLight: '#ffffff',
        border: '#e5e7eb',
        hover: '#fbbf24'
    },
    months: ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαι', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']
};

// ========================================
// Heatmap Manager Class
// ========================================
class HeatmapManager {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.data = null;
        this.hoveredCell = null;
    }

    /**
     * Generate month × year heatmap
     * @param {string} canvasId - Canvas element ID
     * @param {Object} options - Options
     * @returns {boolean} Success
     */
    generateMonthYearHeatmap(canvasId, options = {}) {
        const { includeParakratisi = false } = options;

        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error('[Heatmap] Canvas not found:', canvasId);
            return false;
        }

        this.ctx = this.canvas.getContext('2d');

        // Prepare data
        this.data = this.prepareMonthYearData(includeParakratisi);

        if (this.data.values.length === 0) {
            this.drawEmptyState('Δεν υπάρχουν δεδομένα');
            return false;
        }

        // Calculate canvas size
        const width = (this.data.years.length * HEATMAP_CONFIG.cellSize) + 100;
        const height = (12 * HEATMAP_CONFIG.cellSize) + 80;

        this.canvas.width = width;
        this.canvas.height = height;

        // Draw heatmap
        this.drawMonthYearHeatmap();

        // Add interactivity
        this.setupInteractivity();

        return true;
    }

    /**
     * Generate source × month heatmap
     * @param {string} canvasId - Canvas element ID
     * @param {number} year - Year to display
     * @param {Object} options - Options
     * @returns {boolean} Success
     */
    generateSourceMonthHeatmap(canvasId, year, options = {}) {
        const { includeParakratisi = false } = options;

        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error('[Heatmap] Canvas not found:', canvasId);
            return false;
        }

        this.ctx = this.canvas.getContext('2d');

        // Prepare data
        this.data = this.prepareSourceMonthData(year, includeParakratisi);

        if (this.data.values.length === 0) {
            this.drawEmptyState(`Δεν υπάρχουν δεδομένα για το ${year}`);
            return false;
        }

        // Calculate canvas size
        const width = (12 * HEATMAP_CONFIG.cellSize) + 200;
        const height = (this.data.sources.length * HEATMAP_CONFIG.cellSize) + 80;

        this.canvas.width = width;
        this.canvas.height = height;

        // Draw heatmap
        this.drawSourceMonthHeatmap();

        // Add interactivity
        this.setupInteractivity();

        return true;
    }

    /**
     * Prepare month × year data
     * @param {boolean} includeParakratisi - Include parakratisi
     * @returns {Object} Prepared data
     * @private
     */
    prepareMonthYearData(includeParakratisi) {
        const dataMap = new Map();
        const years = new Set();

        STATE.entries.forEach(entry => {
            const parsed = parseMonthYear(entry.date);
            if (!parsed) return;

            const key = `${parsed.month}-${parsed.year}`;
            years.add(parsed.year);

            if (!dataMap.has(key)) {
                dataMap.set(key, []);
            }

            dataMap.get(key).push(entry);
        });

        const yearsList = Array.from(years).sort((a, b) => a - b);
        const values = [];

        for (let month = 1; month <= 12; month++) {
            for (const year of yearsList) {
                const key = `${month}-${year}`;
                const entries = dataMap.get(key) || [];
                const kpis = eopyyDeductionsManager.calculateKPIs(entries, { includeParakratisi });

                values.push({
                    month,
                    year,
                    value: kpis.total,
                    count: entries.length
                });
            }
        }

        return {
            years: yearsList,
            values,
            min: Math.min(...values.map(v => v.value)),
            max: Math.max(...values.map(v => v.value))
        };
    }

    /**
     * Prepare source × month data
     * @param {number} year - Year
     * @param {boolean} includeParakratisi - Include parakratisi
     * @returns {Object} Prepared data
     * @private
     */
    prepareSourceMonthData(year, includeParakratisi) {
        const dataMap = new Map();
        const sources = new Set();

        STATE.entries.forEach(entry => {
            const parsed = parseMonthYear(entry.date);
            if (!parsed || parsed.year !== year) return;

            const key = `${entry.source}-${parsed.month}`;
            sources.add(entry.source);

            if (!dataMap.has(key)) {
                dataMap.set(key, []);
            }

            dataMap.get(key).push(entry);
        });

        const sourcesList = Array.from(sources).sort();
        const values = [];

        for (const source of sourcesList) {
            for (let month = 1; month <= 12; month++) {
                const key = `${source}-${month}`;
                const entries = dataMap.get(key) || [];
                const kpis = eopyyDeductionsManager.calculateKPIs(entries, { includeParakratisi });

                values.push({
                    source,
                    month,
                    value: kpis.total,
                    count: entries.length
                });
            }
        }

        return {
            sources: sourcesList,
            values,
            min: Math.min(...values.map(v => v.value)),
            max: Math.max(...values.map(v => v.value))
        };
    }

    /**
     * Draw month × year heatmap
     * @private
     */
    drawMonthYearHeatmap() {
        const ctx = this.ctx;
        const startX = 80;
        const startY = 50;

        // Clear canvas
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw title
        ctx.font = `bold ${HEATMAP_CONFIG.fontSize.label + 2}px sans-serif`;
        ctx.fillStyle = HEATMAP_CONFIG.colors.text;
        ctx.textAlign = 'left';
        ctx.fillText('Μηνιαία Έσοδα (ανά Έτος)', 20, 25);

        // Draw year labels (top)
        ctx.font = `${HEATMAP_CONFIG.fontSize.axis}px sans-serif`;
        ctx.textAlign = 'center';
        this.data.years.forEach((year, i) => {
            const x = startX + (i * HEATMAP_CONFIG.cellSize) + (HEATMAP_CONFIG.cellSize / 2);
            ctx.fillText(year, x, 40);
        });

        // Draw month labels (left)
        ctx.textAlign = 'right';
        HEATMAP_CONFIG.months.forEach((month, i) => {
            const y = startY + (i * HEATMAP_CONFIG.cellSize) + (HEATMAP_CONFIG.cellSize / 2) + 4;
            ctx.fillText(month, 70, y);
        });

        // Draw cells
        this.data.values.forEach(cell => {
            const monthIndex = cell.month - 1;
            const yearIndex = this.data.years.indexOf(cell.year);

            const x = startX + (yearIndex * HEATMAP_CONFIG.cellSize) + HEATMAP_CONFIG.cellPadding;
            const y = startY + (monthIndex * HEATMAP_CONFIG.cellSize) + HEATMAP_CONFIG.cellPadding;
            const size = HEATMAP_CONFIG.cellSize - (HEATMAP_CONFIG.cellPadding * 2);
            const color = this.getHeatColor(cell.value, this.data.min, this.data.max);
            
            // Draw cell
            ctx.fillStyle = color;
            ctx.fillRect(x, y, size, size);
            
            // Draw border
            ctx.strokeStyle = HEATMAP_CONFIG.colors.border;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, size, size);
            
            // Draw value (if cell is large enough)
            if (size > 40) {
                ctx.fillStyle = this.getTextColor(color);
                ctx.font = `${HEATMAP_CONFIG.fontSize.value}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(
                    formatCurrency(cell.value).replace('€ ', ''),
                    x + size / 2,
                    y + size / 2 + 4
                );
            }
        });
    }

    /**
     * Draw source × month heatmap
     * @private
     */
    drawSourceMonthHeatmap() {
        const ctx = this.ctx;
        const startX = 200;
        const startY = 50;

        // Clear canvas
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw title
        ctx.font = `bold ${HEATMAP_CONFIG.fontSize.label + 2}px sans-serif`;
        ctx.fillStyle = HEATMAP_CONFIG.colors.text;
        ctx.textAlign = 'left';
        ctx.fillText('Έσοδα ανά Διαγνωστικό (Μηνιαίως)', 20, 25);

        // Draw month labels (top)
        ctx.font = `${HEATMAP_CONFIG.fontSize.axis}px sans-serif`;
        ctx.textAlign = 'center';
        HEATMAP_CONFIG.months.forEach((month, i) => {
            const x = startX + (i * HEATMAP_CONFIG.cellSize) + (HEATMAP_CONFIG.cellSize / 2);
            ctx.fillText(month, x, 40);
        });

        // Draw source labels (left)
        ctx.textAlign = 'right';
        this.data.sources.forEach((source, i) => {
            const y = startY + (i * HEATMAP_CONFIG.cellSize) + (HEATMAP_CONFIG.cellSize / 2) + 4;
            const truncated = source.length > 25 ? source.substring(0, 22) + '...' : source;
            ctx.fillText(truncated, 190, y);
        });

        // Draw cells
        this.data.values.forEach(cell => {
            const sourceIndex = this.data.sources.indexOf(cell.source);
            const monthIndex = cell.month - 1;

            const x = startX + (monthIndex * HEATMAP_CONFIG.cellSize) + HEATMAP_CONFIG.cellPadding;
            const y = startY + (sourceIndex * HEATMAP_CONFIG.cellSize) + HEATMAP_CONFIG.cellPadding;
            const size = HEATMAP_CONFIG.cellSize - (HEATMAP_CONFIG.cellPadding * 2);

            const color = this.getHeatColor(cell.value, this.data.min, this.data.max);
            
            // Draw cell
            ctx.fillStyle = color;
            ctx.fillRect(x, y, size, size);
            
            // Draw border
            ctx.strokeStyle = HEATMAP_CONFIG.colors.border;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, size, size);
            
            // Draw value (if significant)
            if (cell.value > 0 && size > 40) {
                ctx.fillStyle = this.getTextColor(color);
                ctx.font = `${HEATMAP_CONFIG.fontSize.value}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(
                    formatCurrency(cell.value).replace('€ ', ''),
                    x + size / 2,
                    y + size / 2 + 4
                );
            }
        });
    }

    /**
     * Get heat color based on value
     * @param {number} value - Value
     * @param {number} min - Min value
     * @param {number} max - Max value
     * @returns {string} Hex color
     * @private
     */
    getHeatColor(value, min, max) {
        if (value === 0) return '#f9fafb'; // Empty cell
        
        const range = max - min;
        const normalized = range > 0 ? (value - min) / range : 0;
        
        // Color gradient: light blue → blue → dark blue
        if (normalized < 0.33) {
            return this.interpolateColor(
                HEATMAP_CONFIG.colors.min,
                '#93c5fd',
                normalized / 0.33
            );
        } else if (normalized < 0.66) {
            return this.interpolateColor(
                '#93c5fd',
                HEATMAP_CONFIG.colors.mid,
                (normalized - 0.33) / 0.33
            );
        } else {
            return this.interpolateColor(
                HEATMAP_CONFIG.colors.mid,
                HEATMAP_CONFIG.colors.max,
                (normalized - 0.66) / 0.34
            );
        }
    }

    /**
     * Interpolate between two hex colors
     * @param {string} color1 - Start color
     * @param {string} color2 - End color
     * @param {number} factor - 0-1
     * @returns {string} Hex color
     * @private
     */
    interpolateColor(color1, color2, factor) {
        const c1 = this.hexToRgb(color1);
        const c2 = this.hexToRgb(color2);
        
        const r = Math.round(c1.r + (c2.r - c1.r) * factor);
        const g = Math.round(c1.g + (c2.g - c1.g) * factor);
        const b = Math.round(c1.b + (c2.b - c1.b) * factor);
        
        return `rgb(${r}, ${g}, ${b})`;
    }

    /**
     * Convert hex to RGB
     * @param {string} hex - Hex color
     * @returns {Object} RGB object
     * @private
     */
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    /**
     * Get text color (light/dark) based on background
     * @param {string} bgColor - Background color
     * @returns {string} Text color
     * @private
     */
    getTextColor(bgColor) {
        const rgb = bgColor.match(/\d+/g);
        if (!rgb) return HEATMAP_CONFIG.colors.text;
        
        const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
        return brightness > 155 ? HEATMAP_CONFIG.colors.text : HEATMAP_CONFIG.colors.textLight;
    }

    /**
     * Setup interactivity (hover tooltips)
     * @private
     */
    setupInteractivity() {
        if (!this.canvas) return;

        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const cell = this.getCellAtPosition(x, y);
            
            if (cell) {
                this.canvas.style.cursor = 'pointer';
                this.showTooltip(e, cell);
            } else {
                this.canvas.style.cursor = 'default';
                this.hideTooltip();
            }
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.hideTooltip();
        });
    }

    /**
     * Get cell at mouse position
     * @param {number} x - Mouse X
     * @param {number} y - Mouse Y
     * @returns {Object|null} Cell data
     * @private
     */
    getCellAtPosition(x, y) {
        // Implementation depends on heatmap type
        // For now, return null (can be enhanced)
        return null;
    }

    /**
     * Show tooltip
     * @param {Event} e - Mouse event
     * @param {Object} cell - Cell data
     * @private
     */
    showTooltip(e, cell) {
        // Create or update tooltip element
        let tooltip = document.getElementById('heatmapTooltip');
        
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'heatmapTooltip';
            tooltip.style.cssText = `
                position: fixed;
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 0.5rem 0.75rem;
                border-radius: 0.5rem;
                font-size: 0.875rem;
                pointer-events: none;
                z-index: 10000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            `;
            document.body.appendChild(tooltip);
        }

        tooltip.innerHTML = `
            <strong>${cell.label || 'N/A'}</strong><br>
            ${formatCurrency(cell.value)}<br>
            <small>${cell.count || 0} εγγραφές</small>
        `;

        tooltip.style.left = `${e.clientX + 15}px`;
        tooltip.style.top = `${e.clientY + 15}px`;
        tooltip.style.display = 'block';
    }

    /**
     * Hide tooltip
     * @private
     */
    hideTooltip() {
        const tooltip = document.getElementById('heatmapTooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }

    /**
     * Draw empty state
     * @param {string} message - Message
     * @private
     */
    drawEmptyState(message) {
        const ctx = this.ctx;
        
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        ctx.font = `${HEATMAP_CONFIG.fontSize.label}px sans-serif`;
        ctx.fillStyle = HEATMAP_CONFIG.colors.text;
        ctx.textAlign = 'center';
        ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2);
    }
}

// ========================================
// Singleton Instance
// ========================================
const heatmapManager = new HeatmapManager();

// ========================================
// Export
// ========================================
export { HeatmapManager, HEATMAP_CONFIG };
export default heatmapManager;