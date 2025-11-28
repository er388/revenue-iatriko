/**
 * forecasting.js - Revenue Forecasting Module
 * Linear Regression, Seasonal Naive, Holt-Winters methods
 * Version: 2.0 (Complete)
 */

import { STATE } from './state.js';
import eopyyDeductionsManager from './eopyyClawback.js';
import { 
    formatCurrency, 
    parseMonthYear, 
    formatMonthYear,
    compareDates
} from './utils.js';

// ========================================
// Configuration
// ========================================
const FORECAST_CONFIG = {
    methods: {
        linear: 'Linear Regression',
        seasonal: 'Seasonal Naive',
        holtwinters: 'Holt-Winters'
    },
    defaultPeriods: 6, // Forecast 6 months ahead
    minDataPoints: 6, // Minimum historical data required
    confidenceLevel: 0.95, // 95% confidence interval
    alpha: 0.3, // Holt-Winters smoothing parameter (level)
    beta: 0.1,  // Holt-Winters smoothing parameter (trend)
    gamma: 0.3  // Holt-Winters smoothing parameter (seasonal)
};

// ========================================
// Forecasting Manager Class
// ========================================
class ForecastingManager {
    constructor() {
        this.lastForecast = null;
    }

    /**
     * Generate forecast
     * @param {Object} options - Forecast options
     * @returns {Object} Forecast data
     */
    generateForecast(options = {}) {
        const {
            method = 'linear',
            periods = FORECAST_CONFIG.defaultPeriods,
            includeParakratisi = false,
            startDate = null,
            endDate = null
        } = options;

        // Prepare historical data
        const historical = this.prepareHistoricalData(startDate, endDate, includeParakratisi);

        if (historical.length < FORECAST_CONFIG.minDataPoints) {
            return {
                error: true,
                message: `Απαιτούνται τουλάχιστον ${FORECAST_CONFIG.minDataPoints} μήνες δεδομένων για πρόβλεψη`
            };
        }

        // Generate forecast based on method
        let forecast;
        switch (method) {
            case 'linear':
                forecast = this.linearRegression(historical, periods);
                break;
            case 'seasonal':
                forecast = this.seasonalNaive(historical, periods);
                break;
            case 'holtwinters':
                forecast = this.holtWinters(historical, periods);
                break;
            default:
                throw new Error(`Unknown forecasting method: ${method}`);
        }

        // Calculate accuracy metrics
        const accuracy = this.calculateAccuracy(historical);

        // Calculate confidence intervals
        forecast.predictions.forEach(pred => {
            const ci = this.calculateConfidenceInterval(
                pred.value,
                accuracy.mse,
                FORECAST_CONFIG.confidenceLevel
            );
            pred.lower = ci.lower;
            pred.upper = ci.upper;
        });

        const result = {
            method,
            methodName: FORECAST_CONFIG.methods[method],
            historical,
            predictions: forecast.predictions,
            accuracy,
            metadata: {
                dataPoints: historical.length,
                forecastPeriods: periods,
                generatedAt: Date.now()
            }
        };

        this.lastForecast = result;
        return result;
    }

    /**
     * Prepare historical data
     * @param {string} startDate - Start date (MM/YYYY)
     * @param {string} endDate - End date (MM/YYYY)
     * @param {boolean} includeParakratisi - Include parakratisi
     * @returns {Array} Historical data points
     * @private
     */
    prepareHistoricalData(startDate, endDate, includeParakratisi) {
        let entries = [...STATE.entries];

        // Filter by date range if provided
        if (startDate) {
            entries = entries.filter(e => compareDates(e.date, startDate) >= 0);
        }
        if (endDate) {
            entries = entries.filter(e => compareDates(e.date, endDate) <= 0);
        }

        // Group by month
        const monthlyData = new Map();
        entries.forEach(entry => {
            if (!monthlyData.has(entry.date)) {
                monthlyData.set(entry.date, []);
            }
            monthlyData.get(entry.date).push(entry);
        });

        // Calculate monthly totals
        const historical = [];
        for (const [date, monthEntries] of monthlyData.entries()) {
            const kpis = eopyyDeductionsManager.calculateKPIs(monthEntries, { includeParakratisi });
            historical.push({
                date,
                value: kpis.total,
                count: monthEntries.length
            });
        }

        // Sort by date
        historical.sort((a, b) => compareDates(a.date, b.date));

        return historical;
    }

    /**
     * Linear Regression forecast
     * @param {Array} historical - Historical data
     * @param {number} periods - Periods to forecast
     * @returns {Object} Forecast result
     * @private
     */
    linearRegression(historical, periods) {
        const n = historical.length;
        const x = Array.from({ length: n }, (_, i) => i);
        const y = historical.map(h => h.value);

        // Calculate slope and intercept
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // Generate predictions
        const predictions = [];
        const lastDate = historical[historical.length - 1].date;
        let currentDate = this.incrementMonth(lastDate);

        for (let i = 0; i < periods; i++) {
            const xValue = n + i;
            const predicted = slope * xValue + intercept;

            predictions.push({
                date: currentDate,
                value: Math.max(0, predicted), // Ensure non-negative
                method: 'linear'
            });

            currentDate = this.incrementMonth(currentDate);
        }

        return { predictions, slope, intercept };
    }

    /**
     * Seasonal Naive forecast
     * @param {Array} historical - Historical data
     * @param {number} periods - Periods to forecast
     * @returns {Object} Forecast result
     * @private
     */
    seasonalNaive(historical, periods) {
        const seasonLength = 12; // 12 months seasonality
        const predictions = [];
        const lastDate = historical[historical.length - 1].date;
        let currentDate = this.incrementMonth(lastDate);

        for (let i = 0; i < periods; i++) {
            // Use value from same month last year
            const seasonIndex = (historical.length - seasonLength + (i % seasonLength)) % historical.length;
            const seasonalValue = historical[Math.max(0, seasonIndex)].value;

            predictions.push({
                date: currentDate,
                value: seasonalValue,
                method: 'seasonal'
            });

            currentDate = this.incrementMonth(currentDate);
        }

        return { predictions };
    }

    /**
     * Holt-Winters Exponential Smoothing
     * @param {Array} historical - Historical data
     * @param {number} periods - Periods to forecast
     * @returns {Object} Forecast result
     * @private
     */
    holtWinters(historical, periods) {
        const { alpha, beta, gamma } = FORECAST_CONFIG;
        const seasonLength = 12;
        const n = historical.length;

        if (n < seasonLength * 2) {
            // Not enough data for Holt-Winters, fallback to linear
            console.warn('[Forecast] Insufficient data for Holt-Winters, using linear regression');
            return this.linearRegression(historical, periods);
        }

        // Initialize components
        let level = historical[0].value;
        let trend = (historical[seasonLength].value - historical[0].value) / seasonLength;
        const seasonal = Array(seasonLength).fill(0);

        // Calculate initial seasonal components
        for (let i = 0; i < seasonLength; i++) {
            seasonal[i] = historical[i].value / (level + trend * i) || 1;
        }

        // Apply Holt-Winters smoothing
        const smoothed = [];
        for (let i = 0; i < n; i++) {
            const seasonalIndex = i % seasonLength;
            const forecast = (level + trend) * seasonal[seasonalIndex];

            // Update components
            const oldLevel = level;
            level = alpha * (historical[i].value / seasonal[seasonalIndex]) + (1 - alpha) * (level + trend);
            trend = beta * (level - oldLevel) + (1 - beta) * trend;
            seasonal[seasonalIndex] = gamma * (historical[i].value / level) + (1 - gamma) * seasonal[seasonalIndex];

            smoothed.push(forecast);
        }

        // Generate predictions
        const predictions = [];
        const lastDate = historical[historical.length - 1].date;
        let currentDate = this.incrementMonth(lastDate);

        for (let i = 0; i < periods; i++) {
            const seasonalIndex = (n + i) % seasonLength;
            const predicted = (level + trend * (i + 1)) * seasonal[seasonalIndex];

            predictions.push({
                date: currentDate,
                value: Math.max(0, predicted),
                method: 'holtwinters'
            });

            currentDate = this.incrementMonth(currentDate);
        }

        return { predictions, level, trend, seasonal };
    }

    /**
     * Calculate accuracy metrics (MAE, MSE, MAPE)
     * @param {Array} historical - Historical data
     * @returns {Object} Accuracy metrics
     * @private
     */
    calculateAccuracy(historical) {
        if (historical.length < 3) {
            return { mae: 0, mse: 0, mape: 0, rmse: 0 };
        }

        // Use last 20% of data for validation
        const splitIndex = Math.floor(historical.length * 0.8);
        const train = historical.slice(0, splitIndex);
        const test = historical.slice(splitIndex);

        // Generate predictions for test period
        const forecast = this.linearRegression(train, test.length);
        const predictions = forecast.predictions;

        // Calculate errors
        let sumAbsError = 0;
        let sumSqError = 0;
        let sumPercError = 0;

        test.forEach((actual, i) => {
            const predicted = predictions[i]?.value || 0;
            const error = actual.value - predicted;
            const absError = Math.abs(error);
            const percError = actual.value > 0 ? (absError / actual.value) * 100 : 0;

            sumAbsError += absError;
            sumSqError += error * error;
            sumPercError += percError;
        });

        const mae = sumAbsError / test.length;
        const mse = sumSqError / test.length;
        const mape = sumPercError / test.length;
        const rmse = Math.sqrt(mse);

        return { mae, mse, mape, rmse };
    }

    /**
     * Calculate confidence interval
     * @param {number} prediction - Predicted value
     * @param {number} mse - Mean squared error
     * @param {number} confidence - Confidence level (0-1)
     * @returns {Object} Confidence interval
     * @private
     */
    calculateConfidenceInterval(prediction, mse, confidence) {
        // Z-score for 95% confidence: 1.96
        const zScore = confidence === 0.95 ? 1.96 : 2.576; // 99% = 2.576
        const margin = zScore * Math.sqrt(mse);

        return {
            lower: Math.max(0, prediction - margin),
            upper: prediction + margin
        };
    }

    /**
     * Increment month (MM/YYYY)
     * @param {string} date - Date string
     * @returns {string} Next month
     * @private
     */
    incrementMonth(date) {
        const parsed = parseMonthYear(date);
        if (!parsed) return date;

        let { month, year } = parsed;
        month++;

        if (month > 12) {
            month = 1;
            year++;
        }

        return formatMonthYear(month, year);
    }

    /**
     * Get last forecast
     * @returns {Object|null} Last forecast
     */
    getLastForecast() {
        return this.lastForecast;
    }

    /**
     * Export forecast to CSV
     * @param {Object} forecast - Forecast data
     * @returns {string} CSV content
     */
    exportToCSV(forecast) {
        let csv = [];

        // Header
        csv.push('# ΠΡΟΒΛΕΨΗ ΕΣΟΔΩΝ');
        csv.push(`# Μέθοδος: ${forecast.methodName}`);
        csv.push(`# Ιστορικά δεδομένα: ${forecast.historical.length} μήνες`);
        csv.push(`# Πρόβλεψη: ${forecast.predictions.length} μήνες`);
        csv.push('');

        // Historical data
        csv.push('ΙΣΤΟΡΙΚΑ ΔΕΔΟΜΕΝΑ');
        csv.push('Ημερομηνία,Έσοδα');
        forecast.historical.forEach(h => {
            csv.push(`${h.date},${h.value.toFixed(2)}`);
        });
        csv.push('');

        // Predictions
        csv.push('ΠΡΟΒΛΕΨΕΙΣ');
        csv.push('Ημερομηνία,Πρόβλεψη,Κάτω Όριο (95%),Άνω Όριο (95%)');
        forecast.predictions.forEach(p => {
            csv.push(`${p.date},${p.value.toFixed(2)},${p.lower.toFixed(2)},${p.upper.toFixed(2)}`);
        });
        csv.push('');

        // Accuracy
        if (forecast.accuracy) {
            csv.push('ΜΕΤΡΙΚΕΣ ΑΚΡΙΒΕΙΑΣ');
            csv.push(`MAE (Mean Absolute Error),${forecast.accuracy.mae.toFixed(2)}`);
            csv.push(`MSE (Mean Squared Error),${forecast.accuracy.mse.toFixed(2)}`);
            csv.push(`RMSE (Root Mean Squared Error),${forecast.accuracy.rmse.toFixed(2)}`);
            csv.push(`MAPE (Mean Absolute Percentage Error),${forecast.accuracy.mape.toFixed(2)}%`);
        }

        return csv.join('\n');
    }
}

// ========================================
// Singleton Instance
// ========================================
const forecastingManager = new ForecastingManager();

// ========================================
// Export
// ========================================
export { ForecastingManager, FORECAST_CONFIG };
export default forecastingManager;