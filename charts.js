/**
 * charts.js - Advanced Charts & Heatmaps Module
 * Heatmaps για εποχικότητα, trend charts, comparison charts
 */

import {
    parseMonthYear,
    formatCurrency,
    groupBy,
    sumBy,
    escapeHtml
} from './utils.js';

// ========================================
// Heatmap Generator
// ========================================
class HeatmapGenerator {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) throw new Error('Canvas not found');
        
        this.ctx = this.canvas.getContext('2d');
        this.options = {
            cellWidth: options.cellWidth || 60,
            cellHeight: options.cellHeight || 40,
            padding: options.padding || 50,
            colorScheme: options.colorScheme || 'blue-red',
            showValues: options.showValues !== false,
            title: options.title || '',
            ...options
        };

        this.data = [];
        this.hoveredCell = null;
        
        this.setupInteractivity();
    }

    /**
     * Setup mouse interactivity
     * @private
     */
    setupInteractivity() {
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            this.handleHover(x, y);
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.hoveredCell = null;
            this.hideTooltip();
        });
    }

    /**
     * Handle mouse hover
     * @private
     */
    handleHover(x, y) {
        const padding = this.options.padding;
        const cellWidth = this.options.cellWidth;
        const cellHeight = this.options.cellHeight;

        // Find which cell is hovered
        for (let i = 0; i < this.data.length; i++) {
            const cell = this.data[i];
            const cellX = padding + cell.col * cellWidth;
            const cellY = padding + cell.row * cellHeight;

            if (x >= cellX && x <= cellX + cellWidth &&
                y >= cellY && y <= cellY + cellHeight) {
                this.hoveredCell = cell;
                this.showTooltip(x, y, cell);
                return;
            }
        }

        this.hoveredCell = null;
        this.hideTooltip();
    }

    /**
     * Show tooltip
     * @private
     */
    showTooltip(x, y, cell) {
        let tooltip = document.getElementById('heatmap-tooltip');
        
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'heatmap-tooltip';
            tooltip.style.position = 'fixed';
            tooltip.style.background = 'rgba(0, 0, 0, 0.8)';
            tooltip.style.color = 'white';
            tooltip.style.padding = '8px 12px';
            tooltip.style.borderRadius = '4px';
            tooltip.style.fontSize = '12px';
            tooltip.style.pointerEvents = 'none';
            tooltip.style.zIndex = '10000';
            document.body.appendChild(tooltip);
        }

        tooltip.innerHTML = `
            <div><strong>${escapeHtml(cell.label)}</strong></div>
            <div>${formatCurrency(cell.value)}</div>
        `;

        const rect = this.canvas.getBoundingClientRect();
        tooltip.style.left = (rect.left + x + 10) + 'px';
        tooltip.style.top = (rect.top + y + 10) + 'px';
        tooltip.style.display = 'block';
    }

    /**
     * Hide tooltip
     * @private
     */
    hideTooltip() {
        const tooltip = document.getElementById('heatmap-tooltip');
        if (tooltip) tooltip.style.display = 'none';
    }

    /**
     * Generate color από value
     * @private
     */
    getColor(value, min, max) {
        if (max === min) return '#cccccc';

        const normalized = (value - min) / (max - min);

        if (this.options.colorScheme === 'blue-red') {
            // Blue (low) to Red (high)
            const r = Math.round(normalized * 255);
            const b = Math.round((1 - normalized) * 255);
            return `rgb(${r}, 100, ${b})`;
        } else if (this.options.colorScheme === 'green-red') {
            // Green (low) to Red (high)
            const r = Math.round(normalized * 255);
            const g = Math.round((1 - normalized) * 255);
            return `rgb(${r}, ${g}, 50)`;
        } else {
            // Grayscale
            const gray = Math.round(normalized * 200 + 55);
            return `rgb(${gray}, ${gray}, ${gray})`;
        }
    }

    /**
     * Draw heatmap
     * @param {Array} data - [{row, col, value, label}]
     */
    draw(data) {
        this.data = data;

        if (data.length === 0) {
            this.ctx.fillStyle = '#666';
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Δεν υπάρχουν δεδομένα', this.canvas.width / 2, this.canvas.height / 2);
            return;
        }

        // Calculate dimensions
        const maxRow = Math.max(...data.map(d => d.row));
        const maxCol = Math.max(...data.map(d => d.col));
        const values = data.map(d => d.value);
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);

        const padding = this.options.padding;
        const cellWidth = this.options.cellWidth;
        const cellHeight = this.options.cellHeight;

        // Set canvas size
        this.canvas.width = padding * 2 + (maxCol + 1) * cellWidth + 100;
        this.canvas.height = padding * 2 + (maxRow + 1) * cellHeight;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw title
        if (this.options.title) {
            this.ctx.fillStyle = '#333';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(this.options.title, this.canvas.width / 2, 25);
        }

        // Draw cells
        data.forEach(cell => {
            const x = padding + cell.col * cellWidth;
            const y = padding + cell.row * cellHeight;
            const color = this.getColor(cell.value, minValue, maxValue);

            // Draw cell
            this.ctx.fillStyle = color;
            this.ctx.fillRect(x, y, cellWidth, cellHeight);

            // Draw border
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x, y, cellWidth, cellHeight);

            // Draw value text (if enabled)
            if (this.options.showValues && cellWidth > 50) {
                this.ctx.fillStyle = normalized > 0.5 ? '#fff' : '#000';
                this.ctx.font = '11px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                
                const text = cell.value > 1000 
                    ? (cell.value / 1000).toFixed(1) + 'K'
                    : cell.value.toFixed(0);
                
                this.ctx.fillText(text, x + cellWidth / 2, y + cellHeight / 2);
            }
        });

        // Draw row labels
        const rowLabels = [...new Set(data.map(d => d.rowLabel))];
        this.ctx.fillStyle = '#333';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'middle';
        
        rowLabels.forEach((label, i) => {
            this.ctx.fillText(label, padding - 10, padding + i * cellHeight + cellHeight / 2);
        });

        // Draw column labels
        const colLabels = [...new Set(data.map(d => d.colLabel))];
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        
        colLabels.forEach((label, i) => {
            this.ctx.save();
            this.ctx.translate(padding + i * cellWidth + cellWidth / 2, padding - 10);
            this.ctx.rotate(-Math.PI / 4);
            this.ctx.fillText(label, 0, 0);
            this.ctx.restore();
        });

        // Draw color legend
        this.drawLegend(minValue, maxValue);
    }

    /**
     * Draw color legend
     * @private
     */
    drawLegend(minValue, maxValue) {
        const legendWidth = 200;
        const legendHeight = 20;
        const legendX = this.canvas.width - legendWidth - 20;
        const legendY = 20;

        // Draw gradient
        const gradient = this.ctx.createLinearGradient(legendX, 0, legendX + legendWidth, 0);
        
        if (this.options.colorScheme === 'blue-red') {
            gradient.addColorStop(0, 'rgb(0, 100, 255)');
            gradient.addColorStop(1, 'rgb(255, 100, 0)');
        } else if (this.options.colorScheme === 'green-red') {
            gradient.addColorStop(0, 'rgb(0, 255, 50)');
            gradient.addColorStop(1, 'rgb(255, 0, 50)');
        } else {
            gradient.addColorStop(0, 'rgb(55, 55, 55)');
            gradient.addColorStop(1, 'rgb(255, 255, 255)');
        }

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(legendX, legendY, legendWidth, legendHeight);

        // Draw border
        this.ctx.strokeStyle = '#333';
        this.ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);

        // Draw labels
        this.ctx.fillStyle = '#333';
        this.ctx.font = '10px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(formatCurrency(minValue), legendX, legendY + legendHeight + 15);
        this.ctx.textAlign = 'right';
        this.ctx.fillText(formatCurrency(maxValue), legendX + legendWidth, legendY + legendHeight + 15);
    }
}

// ========================================
// Heatmap Data Processor
// ========================================
class HeatmapDataProcessor {
    constructor(entries) {
        this.entries = entries;
    }

    /**
     * Generate Month × Year heatmap data
     * @returns {Array}
     */
    generateMonthYearHeatmap() {
        // Group by date
        const grouped = groupBy(this.entries, 'date');

        const data = [];
        const yearSet = new Set();
        const monthNames = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

        Object.entries(grouped).forEach(([date, items]) => {
            const { month, year } = parseMonthYear(date);
            yearSet.add(year);

            const value = sumBy(items, e => parseFloat(e.netAmount) || parseFloat(e.amount));

            data.push({
                row: month - 1,
                col: year,
                rowLabel: monthNames[month - 1],
                colLabel: year.toString(),
                value,
                label: `${monthNames[month - 1]} ${year}: ${formatCurrency(value)}`
            });
        });

        // Remap columns to 0-indexed
        const years = Array.from(yearSet).sort();
        const yearToCol = {};
        years.forEach((year, i) => {
            yearToCol[year] = i;
        });

        data.forEach(cell => {
            cell.col = yearToCol[cell.col];
        });

        return data;
    }

    /**
     * Generate Source × Month heatmap data
     * @param {number} year - Year to analyze (optional)
     * @returns {Array}
     */
    generateSourceMonthHeatmap(year = null) {
        let filtered = this.entries;

        if (year) {
            filtered = filtered.filter(e => {
                const { year: entryYear } = parseMonthYear(e.date);
                return entryYear === year;
            });
        }

        const grouped = {};
        const sources = new Set();
        const monthNames = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

        filtered.forEach(entry => {
            const { month } = parseMonthYear(entry.date);
            const key = `${entry.source}_${month}`;
            sources.add(entry.source);

            if (!grouped[key]) {
                grouped[key] = {
                    source: entry.source,
                    month,
                    value: 0
                };
            }

            grouped[key].value += parseFloat(entry.netAmount) || parseFloat(entry.amount);
        });

        const sourcesArray = Array.from(sources).sort();
        const sourceToRow = {};
        sourcesArray.forEach((source, i) => {
            sourceToRow[source] = i;
        });

        const data = Object.values(grouped).map(item => ({
            row: sourceToRow[item.source],
            col: item.month - 1,
            rowLabel: item.source,
            colLabel: monthNames[item.month - 1],
            value: item.value,
            label: `${item.source} - ${monthNames[item.month - 1]}: ${formatCurrency(item.value)}`
        }));

        return data;
    }

    /**
     * Generate Insurance × Month heatmap data
     * @param {number} year - Year to analyze (optional)
     * @returns {Array}
     */
    generateInsuranceMonthHeatmap(year = null) {
        let filtered = this.entries;

        if (year) {
            filtered = filtered.filter(e => {
                const { year: entryYear } = parseMonthYear(e.date);
                return entryYear === year;
            });
        }

        const grouped = {};
        const insurances = new Set();
        const monthNames = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

        filtered.forEach(entry => {
            const { month } = parseMonthYear(entry.date);
            const key = `${entry.insurance}_${month}`;
            insurances.add(entry.insurance);

            if (!grouped[key]) {
                grouped[key] = {
                    insurance: entry.insurance,
                    month,
                    value: 0
                };
            }

            grouped[key].value += parseFloat(entry.netAmount) || parseFloat(entry.amount);
        });

        const insurancesArray = Array.from(insurances).sort();
        const insuranceToRow = {};
        insurancesArray.forEach((insurance, i) => {
            insuranceToRow[insurance] = i;
        });

        const data = Object.values(grouped).map(item => ({
            row: insuranceToRow[item.insurance],
            col: item.month - 1,
            rowLabel: item.insurance,
            colLabel: monthNames[item.month - 1],
            value: item.value,
            label: `${item.insurance} - ${monthNames[item.month - 1]}: ${formatCurrency(item.value)}`
        }));

        return data;
    }
}

// ========================================
// Comparison Charts (Chart.js wrapper)
// ========================================
class ComparisonCharts {
    /**
     * Create side-by-side comparison chart
     * @param {string} canvasId - Canvas ID
     * @param {Object} comparison - Comparison data
     */
    static createComparisonChart(canvasId, comparison) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        const { period1, period2 } = comparison;

        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Συνολικά', 'Μετρητά', 'Τιμολόγια', 'Κρατήσεις'],
                datasets: [
                    {
                        label: period1.label,
                        data: [
                            period1.kpis.total,
                            period1.kpis.cash,
                            period1.kpis.invoices,
                            period1.kpis.retentions
                        ],
                        backgroundColor: 'rgba(54, 162, 235, 0.7)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    },
                    {
                        label: period2.label,
                        data: [
                            period2.kpis.total,
                            period2.kpis.cash,
                            period2.kpis.invoices,
                            period2.kpis.retentions
                        ],
                        backgroundColor: 'rgba(255, 99, 132, 0.7)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: value => formatCurrency(value)
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: context => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`
                        }
                    }
                }
            }
        });
    }

    /**
     * Create trend comparison line chart
     * @param {string} canvasId - Canvas ID
     * @param {Object} comparison - Comparison with trend data
     */
    static createTrendChart(canvasId, trendData1, trendData2, labels) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Περίοδος 1',
                        data: trendData1,
                        borderColor: 'rgba(54, 162, 235, 1)',
                        backgroundColor: 'rgba(54, 162, 235, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Περίοδος 2',
                        data: trendData2,
                        borderColor: 'rgba(255, 99, 132, 1)',
                        backgroundColor: 'rgba(255, 99, 132, 0.1)',
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: value => formatCurrency(value)
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: context => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`
                        }
                    }
                }
            }
        });
    }

    /**
     * Create forecast chart with confidence intervals
     * @param {string} canvasId - Canvas ID
     * @param {Object} forecastData - Forecast data
     */
    static createForecastChart(canvasId, forecastData) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        const { historical, predictions } = forecastData;

        const historicalDates = historical.map(d => d.date);
        const historicalValues = historical.map(d => d.value);

        const predictionDates = predictions.map(p => p.date);
        const predictionValues = predictions.map(p => p.value);
        const upperBound = predictions.map(p => p.upper);
        const lowerBound = predictions.map(p => p.lower);

        const allDates = [...historicalDates, ...predictionDates];

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: allDates,
                datasets: [
                    {
                        label: 'Ιστορικά Δεδομένα',
                        data: [...historicalValues, ...Array(predictions.length).fill(null)],
                        borderColor: 'rgba(54, 162, 235, 1)',
                        backgroundColor: 'rgba(54, 162, 235, 0.1)',
                        pointRadius: 4,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Πρόβλεψη',
                        data: [...Array(historical.length).fill(null), ...predictionValues],
                        borderColor: 'rgba(255, 99, 132, 1)',
                        backgroundColor: 'rgba(255, 99, 132, 0.1)',
                        borderDash: [5, 5],
                        pointRadius: 4,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Άνω Όριο (95%)',
                        data: [...Array(historical.length).fill(null), ...upperBound],
                        borderColor: 'rgba(255, 99, 132, 0.3)',
                        backgroundColor: 'rgba(255, 99, 132, 0.05)',
                        fill: '+1',
                        pointRadius: 0,
                        borderDash: [2, 2]
                    },
                    {
                        label: 'Κάτω Όριο (95%)',
                        data: [...Array(historical.length).fill(null), ...lowerBound],
                        borderColor: 'rgba(255, 99, 132, 0.3)',
                        backgroundColor: 'rgba(255, 99, 132, 0.05)',
                        pointRadius: 0,
                        borderDash: [2, 2]
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: value => formatCurrency(value)
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: context => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`
                        }
                    }
                }
            }
        });
    }
}

// ========================================
// Exports
// ========================================
export {
    HeatmapGenerator,
    HeatmapDataProcessor,
    ComparisonCharts
};

export default {
    HeatmapGenerator,
    HeatmapDataProcessor,
    ComparisonCharts
};