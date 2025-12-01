/**
 * forecasting.js - Revenue Forecasting Module
 * Advanced time series forecasting with multiple methods
 * Version: 1.0
 */

import { STATE } from './state.js';
import { showToast } from './uiRenderers.js';
import { formatCurrency, escapeHtml } from './utils.js';
import eopyyDeductionsManager from './eopyyClawback.js';

/**
 * Forecasting Manager - Main Class
 */
class ForecastingManager {
    constructor() {
        this.models = ['linear', 'seasonal', 'holt-winters'];
        this.defaultPeriods = 6;
        this.maxPeriods = 12;
        this.minHistoricalMonths = 6; // Minimum data required
        
        // Holt-Winters default parameters
        this.hwParams = {
            alpha: 0.2,  // Level smoothing
            beta: 0.1,   // Trend smoothing
            gamma: 0.1   // Seasonal smoothing
        };
        
        // Confidence level
        this.confidenceLevel = 0.95; // 95%
        
        console.log('📊 ForecastingManager initialized');
    }

    /**
     * Main entry point: Generate forecast
     * @param {Array} entries - Historical entries
     * @param {string} method - 'linear', 'seasonal', 'holt-winters'
     * @param {number} periods - Number of months to forecast
     * @param {Object} options - Additional options
     * @returns {Object} Forecast result
     */
    generateForecast(entries, method = 'linear', periods = 6, options = {}) {
        console.log(`🔮 Generating ${method} forecast for ${periods} periods...`);
        
        try {
            // Validate inputs
            if (!entries || entries.length === 0) {
                throw new Error('Δεν υπάρχουν δεδομένα για πρόβλεψη');
            }

            if (periods < 1 || periods > this.maxPeriods) {
                throw new Error(`Οι περίοδοι πρέπει να είναι 1-${this.maxPeriods}`);
            }

            // Prepare time series data
            const timeSeries = this.prepareTimeSeries(entries, options);

            if (timeSeries.length < this.minHistoricalMonths) {
                throw new Error(`Απαιτούνται τουλάχιστον ${this.minHistoricalMonths} μήνες δεδομένων`);
            }

            // Select forecasting method
            let forecast;
            switch (method.toLowerCase()) {
                case 'linear':
                    forecast = this.linearRegression(timeSeries, periods);
                    break;
                case 'seasonal':
                    forecast = this.seasonalNaive(timeSeries, periods);
                    break;
                case 'holt-winters':
                    forecast = this.holtWinters(timeSeries, periods, options);
                    break;
                default:
                    throw new Error(`Άγνωστη μέθοδος: ${method}`);
            }

            // Calculate accuracy metrics (if we have validation data)
            const metrics = this.calculateMetrics(timeSeries, forecast);

            // Calculate confidence intervals
            const withConfidence = this.addConfidenceIntervals(forecast, timeSeries);

            console.log('✅ Forecast generated successfully:', withConfidence);

            return {
                success: true,
                method,
                periods,
                historical: timeSeries,
                forecast: withConfidence,
                metrics,
                generated: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Forecast generation error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Prepare time series data from entries
     * @param {Array} entries - Raw entries
     * @param {Object} options - Filtering options
     * @returns {Array} Time series [{date, value, count}]
     */
    prepareTimeSeries(entries, options = {}) {
        const { includeParakratisi = false } = options;

        // Group by month-year
        const grouped = {};

        entries.forEach(entry => {
            const date = entry.date; // Already in MM/YYYY format

            if (!grouped[date]) {
                grouped[date] = {
                    date,
                    total: 0,
                    count: 0
                };
            }

            // Calculate final amount
            const amounts = eopyyDeductionsManager.getAmountsBreakdown(entry);
            const value = includeParakratisi 
                ? amounts.originalAmount 
                : amounts.finalAmount;

            grouped[date].total += value;
            grouped[date].count++;
        });

        // Convert to array and sort by date
        const timeSeries = Object.values(grouped)
            .map(item => ({
                date: item.date,
                value: item.total,
                count: item.count
            }))
            .sort((a, b) => this.compareDates(a.date, b.date));

        console.log('📅 Time series prepared:', timeSeries.length, 'months');
        return timeSeries;
    }

    /**
     * Compare two MM/YYYY dates
     */
    compareDates(dateA, dateB) {
        const [monthA, yearA] = dateA.split('/').map(Number);
        const [monthB, yearB] = dateB.split('/').map(Number);
        
        if (yearA !== yearB) return yearA - yearB;
        return monthA - monthB;
    }

    /**
     * Linear Regression Forecast
     * Simple trend-based prediction
     */
    linearRegression(timeSeries, periods) {
        const n = timeSeries.length;
        const values = timeSeries.map(d => d.value);

        // Calculate linear regression: y = mx + b
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += values[i];
            sumXY += i * values[i];
            sumX2 += i * i;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        console.log(`📈 Linear regression: y = ${slope.toFixed(2)}x + ${intercept.toFixed(2)}`);

        // Generate forecasts
        const forecasts = [];
        const lastDate = timeSeries[n - 1].date;

        for (let i = 1; i <= periods; i++) {
            const predictedValue = slope * (n + i - 1) + intercept;
            const forecastDate = this.addMonths(lastDate, i);

            forecasts.push({
                date: forecastDate,
                value: Math.max(0, predictedValue), // No negative values
                method: 'linear'
            });
        }

        return forecasts;
    }

    /**
     * Seasonal Naive Forecast
     * Repeats last season's pattern
     */
    seasonalNaive(timeSeries, periods) {
        const seasonLength = 12; // Monthly seasonality
        const n = timeSeries.length;

        if (n < seasonLength) {
            console.warn('⚠️ Not enough data for seasonal forecast, using simple naive');
            // Fallback to simple naive (repeat last value)
            const lastValue = timeSeries[n - 1].value;
            const lastDate = timeSeries[n - 1].date;
            
            return Array.from({ length: periods }, (_, i) => ({
                date: this.addMonths(lastDate, i + 1),
                value: lastValue,
                method: 'seasonal'
            }));
        }

        // Use last complete season
        const lastSeason = timeSeries.slice(-seasonLength);
        const forecasts = [];
        const lastDate = timeSeries[n - 1].date;

        for (let i = 0; i < periods; i++) {
            const seasonalIndex = i % seasonLength;
            const seasonalValue = lastSeason[seasonalIndex].value;
            
            forecasts.push({
                date: this.addMonths(lastDate, i + 1),
                value: seasonalValue,
                method: 'seasonal'
            });
        }

        console.log('📊 Seasonal naive forecast generated');
        return forecasts;
    }

    /**
     * Holt-Winters Exponential Smoothing
     * Accounts for level, trend, and seasonality
     */
    holtWinters(timeSeries, periods, options = {}) {
        const { alpha, beta, gamma } = { ...this.hwParams, ...options };
        const seasonLength = 12;
        const n = timeSeries.length;

        if (n < seasonLength * 2) {
            console.warn('⚠️ Not enough data for Holt-Winters, using linear');
            return this.linearRegression(timeSeries, periods);
        }

        const values = timeSeries.map(d => d.value);

        // Initialize components
        let level = values[0];
        let trend = (values[seasonLength] - values[0]) / seasonLength;
        const seasonal = this.initializeSeasonality(values, seasonLength);

        // Arrays to store components
        const levels = [level];
        const trends = [trend];
        const seasonals = [...seasonal];

        // Training phase: fit to historical data
        for (let i = 1; i < n; i++) {
            const seasonalIndex = i % seasonLength;
            
            // Update level
            const prevLevel = level;
            level = alpha * (values[i] - seasonals[seasonalIndex]) + 
                    (1 - alpha) * (prevLevel + trend);
            levels.push(level);

            // Update trend
            trend = beta * (level - prevLevel) + (1 - beta) * trend;
            trends.push(trend);

            // Update seasonal component
            seasonals[seasonalIndex] = gamma * (values[i] - level) + 
                                       (1 - gamma) * seasonals[seasonalIndex];
        }

        // Forecasting phase
        const forecasts = [];
        const lastDate = timeSeries[n - 1].date;

        for (let i = 1; i <= periods; i++) {
            const seasonalIndex = (n + i - 1) % seasonLength;
            const forecastValue = level + i * trend + seasonals[seasonalIndex];

            forecasts.push({
                date: this.addMonths(lastDate, i),
                value: Math.max(0, forecastValue),
                method: 'holt-winters',
                components: {
                    level: level + i * trend,
                    trend: trend,
                    seasonal: seasonals[seasonalIndex]
                }
            });
        }

        console.log('🔄 Holt-Winters forecast generated with params:', { alpha, beta, gamma });
        return forecasts;
    }

    /**
     * Initialize seasonal components (additive decomposition)
     */
    initializeSeasonality(values, seasonLength) {
        const seasonal = new Array(seasonLength).fill(0);
        const numSeasons = Math.floor(values.length / seasonLength);

        if (numSeasons < 2) {
            return seasonal; // Not enough data, return zeros
        }

        // Calculate average for each season position
        for (let i = 0; i < seasonLength; i++) {
            let sum = 0;
            for (let j = 0; j < numSeasons; j++) {
                sum += values[j * seasonLength + i];
            }
            seasonal[i] = sum / numSeasons;
        }

        // Deseasonalize: subtract overall mean
        const overallMean = seasonal.reduce((a, b) => a + b, 0) / seasonLength;
        return seasonal.map(s => s - overallMean);
    }

    /**
     * Add confidence intervals to forecasts
     */
    addConfidenceIntervals(forecasts, historical) {
        const values = historical.map(d => d.value);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        
        // Calculate standard deviation
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        // Z-score for 95% confidence
        const zScore = 1.96;

        return forecasts.map((forecast, index) => {
            // Confidence interval widens with forecast horizon
            const horizonFactor = Math.sqrt(index + 1);
            const margin = zScore * stdDev * horizonFactor;

            return {
                ...forecast,
                lower: Math.max(0, forecast.value - margin),
                upper: forecast.value + margin,
                confidence: this.confidenceLevel
            };
        });
    }

    /**
     * Calculate accuracy metrics
     */
    calculateMetrics(historical, forecast) {
        if (historical.length < 3) {
            return {
                available: false,
                message: 'Ανεπαρκή δεδομένα για υπολογισμό μετρικών'
            };
        }

        // Use last N periods for validation
        const validationSize = Math.min(3, Math.floor(historical.length * 0.2));
        const trainSize = historical.length - validationSize;

        const actual = historical.slice(trainSize).map(d => d.value);
        const predicted = forecast.slice(0, validationSize).map(d => d.value);

        if (predicted.length === 0) {
            return {
                available: false,
                message: 'Δεν υπάρχουν προβλέψεις για σύγκριση'
            };
        }

        // Calculate MAE (Mean Absolute Error)
        const mae = actual.reduce((sum, val, i) => {
            return sum + Math.abs(val - (predicted[i] || 0));
        }, 0) / actual.length;

        // Calculate RMSE (Root Mean Squared Error)
        const mse = actual.reduce((sum, val, i) => {
            return sum + Math.pow(val - (predicted[i] || 0), 2);
        }, 0) / actual.length;
        const rmse = Math.sqrt(mse);

        // Calculate MAPE (Mean Absolute Percentage Error)
        const mape = actual.reduce((sum, val, i) => {
            if (val === 0) return sum;
            return sum + Math.abs((val - (predicted[i] || 0)) / val);
        }, 0) / actual.length * 100;

        console.log('📊 Accuracy metrics:', { mae, rmse, mape });

        return {
            available: true,
            mae,
            rmse,
            mape,
            accuracy: Math.max(0, 100 - mape), // Simple accuracy %
            validationPeriods: validationSize
        };
    }

    /**
     * Add months to MM/YYYY date
     */
    addMonths(dateStr, months) {
        const [month, year] = dateStr.split('/').map(Number);
        
        let newMonth = month + months;
        let newYear = year;

        while (newMonth > 12) {
            newMonth -= 12;
            newYear++;
        }

        while (newMonth < 1) {
            newMonth += 12;
            newYear--;
        }

        return `${String(newMonth).padStart(2, '0')}/${newYear}`;
    }

    /**
     * Visualize forecast with Chart.js
     */
    visualizeForecast(result, canvasId = 'forecastChart') {
        if (!result.success) {
            showToast('Σφάλμα δημιουργίας γραφήματος', 'error');
            return;
        }

        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error('Canvas not found:', canvasId);
            return;
        }

        // Destroy existing chart
        if (STATE.charts[canvasId]) {
            STATE.charts[canvasId].destroy();
        }

        const { historical, forecast } = result;

        // Prepare datasets
        const historicalData = historical.map(d => ({
            x: d.date,
            y: d.value
        }));

        const forecastData = forecast.map(d => ({
            x: d.date,
            y: d.value
        }));

        const upperBoundData = forecast.map(d => ({
            x: d.date,
            y: d.upper || d.value
        }));

        const lowerBoundData = forecast.map(d => ({
            x: d.date,
            y: d.lower || 0
        }));

        // Create chart
        const ctx = canvas.getContext('2d');
        
        STATE.charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Ιστορικά Δεδομένα',
                        data: historicalData,
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        borderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        tension: 0.3,
                        fill: false
                    },
                    {
                        label: 'Πρόβλεψη',
                        data: forecastData,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        tension: 0.3,
                        fill: false
                    },
                    {
                        label: 'Άνω Όριο (95%)',
                        data: upperBoundData,
                        borderColor: 'rgba(16, 185, 129, 0.3)',
                        backgroundColor: 'rgba(16, 185, 129, 0.05)',
                        borderWidth: 1,
                        borderDash: [2, 2],
                        pointRadius: 0,
                        fill: '+1',
                        tension: 0.3
                    },
                    {
                        label: 'Κάτω Όριο (95%)',
                        data: lowerBoundData,
                        borderColor: 'rgba(16, 185, 129, 0.3)',
                        backgroundColor: 'rgba(16, 185, 129, 0.05)',
                        borderWidth: 1,
                        borderDash: [2, 2],
                        pointRadius: 0,
                        fill: false,
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                label += formatCurrency(context.parsed.y);
                                return label;
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: `Πρόβλεψη Εσόδων - ${result.method.toUpperCase()}`,
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'category',
                        title: {
                            display: true,
                            text: 'Μήνας'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Ποσό (€)'
                        },
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    }
                }
            }
        });

        console.log('📊 Forecast chart rendered');
    }

    /**
     * Export forecast to CSV
     */
    exportForecastCSV(result) {
        if (!result.success) {
            showToast('Δεν υπάρχει πρόβλεψη για εξαγωγή', 'error');
            return;
        }

        const { historical, forecast, method, metrics } = result;

        // Build CSV
        const headers = ['Μήνας', 'Τύπος', 'Ποσό', 'Κάτω Όριο', 'Άνω Όριο'];
        const rows = [];

        // Historical data
        historical.forEach(d => {
            rows.push([
                d.date,
                'Ιστορικό',
                d.value.toFixed(2),
                '',
                ''
            ]);
        });

        // Forecast data
        forecast.forEach(d => {
            rows.push([
                d.date,
                'Πρόβλεψη',
                d.value.toFixed(2),
                (d.lower || '').toString(),
                (d.upper || '').toString()
            ]);
        });

        // Add metrics
        rows.push([]);
        rows.push(['Μέθοδος:', method]);
        if (metrics.available) {
            rows.push(['Ακρίβεια:', `${metrics.accuracy.toFixed(2)}%`]);
            rows.push(['MAE:', metrics.mae.toFixed(2)]);
            rows.push(['RMSE:', metrics.rmse.toFixed(2)]);
            rows.push(['MAPE:', `${metrics.mape.toFixed(2)}%`]);
        }

        const csv = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        // Download
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `forecast_${method}_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();

        showToast('CSV εξήχθη επιτυχώς', 'success');
    }

    /**
     * Get available years from entries
     */
    getAvailableYears(entries) {
        const years = new Set();
        entries.forEach(entry => {
            const [, year] = entry.date.split('/');
            years.add(parseInt(year));
        });
        return Array.from(years).sort((a, b) => b - a);
    }
}

// Create singleton instance
const forecastingManager = new ForecastingManager();

// Export
export default forecastingManager;
export { ForecastingManager };
