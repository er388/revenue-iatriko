/**
 * forecasting.js - Revenue Forecasting Module
 * Client-side forecasting Î¼Îµ Linear Regression, Seasonal Naive, Holt-Winters
 */

import {
    parseMonthYear,
    formatMonthYear,
    groupBy,
    sumBy,
    compareDates
} from './utils.js';

// ========================================
// Forecasting Methods
// ========================================

/**
 * Linear Regression Forecasting
 * Î‘Ï€Î»ÏŒ Î³ÏÎ±Î¼Î¼Î¹ÎºÏŒ Î¼Î¿Î½Ï„Î­Î»Î¿: y = mx + b
 */
class LinearRegressionForecast {
    constructor(historicalData) {
        this.data = historicalData; // [{date, value}]
        this.slope = 0;
        this.intercept = 0;
        this.trained = false;
    }

    /**
     * Train Ï„Î¿ Î¼Î¿Î½Ï„Î­Î»Î¿
     */
    train() {
        const n = this.data.length;
        if (n < 2) throw new Error('Not enough data for linear regression (need at least 2 points)');

        // Assign x values (0, 1, 2, ...)
        const xValues = this.data.map((_, i) => i);
        const yValues = this.data.map(d => d.value);

        // Calculate means
        const xMean = xValues.reduce((a, b) => a + b, 0) / n;
        const yMean = yValues.reduce((a, b) => a + b, 0) / n;

        // Calculate slope and intercept
        let numerator = 0;
        let denominator = 0;

        for (let i = 0; i < n; i++) {
            numerator += (xValues[i] - xMean) * (yValues[i] - yMean);
            denominator += Math.pow(xValues[i] - xMean, 2);
        }

        this.slope = denominator !== 0 ? numerator / denominator : 0;
        this.intercept = yMean - this.slope * xMean;
        this.trained = true;
    }

    /**
     * Predict future values
     * @param {number} periods - Number of periods ahead
     * @returns {Array}
     */
    predict(periods) {
        if (!this.trained) this.train();

        const lastIndex = this.data.length - 1;
        const predictions = [];

        for (let i = 1; i <= periods; i++) {
            const x = lastIndex + i;
            const value = this.slope * x + this.intercept;
            
            // Generate date (assume monthly)
            const lastDate = parseMonthYear(this.data[this.data.length - 1].date);
            let month = lastDate.month + i;
            let year = lastDate.year;
            
            while (month > 12) {
                month -= 12;
                year++;
            }

            predictions.push({
                date: formatMonthYear(month, year),
                value: Math.max(0, value), // No negative forecasts
                method: 'linear-regression'
            });
        }

        return predictions;
    }

    /**
     * Calculate confidence intervals (Î±Ï€Î»Î¿Ï€Î¿Î¹Î·Î¼Î­Î½Î¿)
     * @param {Array} predictions - Predictions
     * @returns {Array}
     */
    calculateConfidenceIntervals(predictions) {
        // Simple approach: use historical standard deviation
        const values = this.data.map(d => d.value);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        return predictions.map((pred, i) => {
            // Uncertainty increases with time
            const factor = 1 + (i * 0.1); // 10% increase per period
            const margin = stdDev * factor * 1.96; // 95% confidence

            return {
                ...pred,
                lower: Math.max(0, pred.value - margin),
                upper: pred.value + margin
            };
        });
    }
}

/**
 * Seasonal Naive Forecasting
 * Î§ÏÎ·ÏƒÎ¹Î¼Î¿Ï€Î¿Î¹ÎµÎ¯ Ï„Î¹Î¼Î­Ï‚ Î±Ï€ÏŒ Ï„Î·Î½ Î¯Î´Î¹Î± Ï€ÎµÏÎ¯Î¿Î´Î¿ Ï€ÏÎ¿Î·Î³Î¿ÏÎ¼ÎµÎ½Î¿Ï… Î­Ï„Î¿Ï…Ï‚
 */
class SeasonalNaiveForecast {
    constructor(historicalData) {
        this.data = historicalData; // [{date, value}]
    }

    /**
     * Predict future values
     * @param {number} periods - Number of periods ahead
     * @returns {Array}
     */
    predict(periods) {
        const predictions = [];

        for (let i = 1; i <= periods; i++) {
            const lastDate = parseMonthYear(this.data[this.data.length - 1].date);
            let month = lastDate.month + i;
            let year = lastDate.year;
            
            while (month > 12) {
                month -= 12;
                year++;
            }

            const forecastDate = formatMonthYear(month, year);

            // Find same month last year
            const lastYearDate = formatMonthYear(month, year - 1);
            const lastYearData = this.data.find(d => d.date === lastYearDate);

            const value = lastYearData ? lastYearData.value : 0;

            predictions.push({
                date: forecastDate,
                value,
                method: 'seasonal-naive'
            });
        }

        return predictions;
    }

    /**
     * Calculate confidence intervals
     * @param {Array} predictions - Predictions
     * @returns {Array}
     */
    calculateConfidenceIntervals(predictions) {
        // For seasonal naive, use historical seasonal variation
        const monthlyVariation = this.calculateSeasonalVariation();

        return predictions.map(pred => {
            const { month } = parseMonthYear(pred.date);
            const variation = monthlyVariation[month] || 0;
            const margin = variation * 1.96; // 95% confidence

            return {
                ...pred,
                lower: Math.max(0, pred.value - margin),
                upper: pred.value + margin
            };
        });
    }

    /**
     * Calculate seasonal variation per month
     * @private
     */
    calculateSeasonalVariation() {
        const grouped = groupBy(this.data, d => {
            const { month } = parseMonthYear(d.date);
            return month;
        });

        const variation = {};
        
        for (const [month, items] of Object.entries(grouped)) {
            if (items.length < 2) {
                variation[month] = 0;
                continue;
            }

            const values = items.map(d => d.value);
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
            variation[month] = Math.sqrt(variance);
        }

        return variation;
    }
}

/**
 * Holt-Winters Exponential Smoothing (Simplified)
 * Triple exponential smoothing Î³Î¹Î± trend ÎºÎ±Î¹ seasonality
 */
class HoltWintersForecast {
    constructor(historicalData, seasonLength = 12) {
        this.data = historicalData;
        this.seasonLength = seasonLength; // 12 Î³Î¹Î± Î¼Î·Î½Î¹Î±Î¯Î± Î´ÎµÎ´Î¿Î¼Î­Î½Î±
        this.alpha = 0.3; // Level smoothing
        this.beta = 0.1;  // Trend smoothing
        this.gamma = 0.2; // Seasonal smoothing
        
        this.level = 0;
        this.trend = 0;
        this.seasonals = [];
    }

    /**
     * Initialize components
     * @private
     */
    initialize() {
        const n = this.data.length;
        if (n < this.seasonLength * 2) {
            throw new Error(`Need at least ${this.seasonLength * 2} data points for Holt-Winters`);
        }

        // Initialize level (average of first season)
        this.level = this.data.slice(0, this.seasonLength)
            .reduce((sum, d) => sum + d.value, 0) / this.seasonLength;

        // Initialize trend (average difference between first two seasons)
        const firstSeason = this.data.slice(0, this.seasonLength)
            .reduce((sum, d) => sum + d.value, 0) / this.seasonLength;
        const secondSeason = this.data.slice(this.seasonLength, this.seasonLength * 2)
            .reduce((sum, d) => sum + d.value, 0) / this.seasonLength;
        this.trend = (secondSeason - firstSeason) / this.seasonLength;

        // Initialize seasonal components
        this.seasonals = [];
        for (let i = 0; i < this.seasonLength; i++) {
            let seasonalSum = 0;
            let count = 0;
            
            for (let j = i; j < n; j += this.seasonLength) {
                if (j < n) {
                    seasonalSum += this.data[j].value / this.level;
                    count++;
                }
            }
            
            this.seasonals[i] = count > 0 ? seasonalSum / count : 1;
        }
    }

    /**
     * Train model
     */
    train() {
        this.initialize();

        for (let i = 0; i < this.data.length; i++) {
            const value = this.data[i].value;
            const seasonalIdx = i % this.seasonLength;
            
            const prevLevel = this.level;
            const prevTrend = this.trend;
            
            // Update level
            this.level = this.alpha * (value / this.seasonals[seasonalIdx]) +
                        (1 - this.alpha) * (prevLevel + prevTrend);
            
            // Update trend
            this.trend = this.beta * (this.level - prevLevel) +
                        (1 - this.beta) * prevTrend;
            
            // Update seasonal
            this.seasonals[seasonalIdx] = this.gamma * (value / this.level) +
                                         (1 - this.gamma) * this.seasonals[seasonalIdx];
        }
    }

    /**
     * Predict future values
     * @param {number} periods - Number of periods ahead
     * @returns {Array}
     */
    predict(periods) {
        this.train();

        const predictions = [];
        const lastDate = parseMonthYear(this.data[this.data.length - 1].date);

        for (let i = 1; i <= periods; i++) {
            const seasonalIdx = (this.data.length + i - 1) % this.seasonLength;
            const forecast = (this.level + i * this.trend) * this.seasonals[seasonalIdx];

            let month = lastDate.month + i;
            let year = lastDate.year;
            
            while (month > 12) {
                month -= 12;
                year++;
            }

            predictions.push({
                date: formatMonthYear(month, year),
                value: Math.max(0, forecast),
                method: 'holt-winters'
            });
        }

        return predictions;
    }

    /**
     * Calculate confidence intervals
     * @param {Array} predictions - Predictions
     * @returns {Array}
     */
    calculateConfidenceIntervals(predictions) {
        // Calculate forecast error from training
        const errors = [];
        
        for (let i = this.seasonLength; i < this.data.length; i++) {
            const actual = this.data[i].value;
            const seasonalIdx = i % this.seasonLength;
            const fitted = (this.level + (i - this.data.length) * this.trend) * this.seasonals[seasonalIdx];
            errors.push(Math.abs(actual - fitted));
        }

        const mse = errors.reduce((sum, e) => sum + e * e, 0) / errors.length;
        const stdError = Math.sqrt(mse);

        return predictions.map((pred, i) => {
            const factor = 1 + (i * 0.1);
            const margin = stdError * factor * 1.96;

            return {
                ...pred,
                lower: Math.max(0, pred.value - margin),
                upper: pred.value + margin
            };
        });
    }
}

// ========================================
// Forecast Manager
// ========================================
class ForecastManager {
    constructor(entries) {
        this.entries = entries;
    }

    /**
     * Prepare historical data Î³Î¹Î± forecasting
     * @param {string} startDate - Start date (optional)
     * @param {string} endDate - End date (optional)
     * @returns {Array}
     */
    prepareHistoricalData(startDate = null, endDate = null) {
        let filtered = this.entries;

        if (startDate) {
            filtered = filtered.filter(e => compareDates(e.date, startDate) >= 0);
        }
        if (endDate) {
            filtered = filtered.filter(e => compareDates(e.date, endDate) <= 0);
        }

        // Group by month and sum
        const grouped = groupBy(filtered, 'date');
        const monthlyData = Object.entries(grouped)
            .map(([date, items]) => ({
                date,
                value: sumBy(items, e => parseFloat(e.netAmount) || parseFloat(e.amount))
            }))
            .sort((a, b) => compareDates(a.date, b.date));

        return monthlyData;
    }

    /**
     * Generate forecast
     * @param {string} method - 'linear', 'seasonal', 'holt-winters'
     * @param {number} periods - Number of periods ahead
     * @param {Object} options - Additional options
     * @returns {Object}
     */
    generateForecast(method = 'linear', periods = 6, options = {}) {
        const historicalData = this.prepareHistoricalData(options.startDate, options.endDate);

        if (historicalData.length < 2) {
            throw new Error('Insufficient historical data for forecasting');
        }

        let forecaster;
        let predictions;
        let confidenceIntervals;

        switch (method) {
            case 'linear':
                forecaster = new LinearRegressionForecast(historicalData);
                predictions = forecaster.predict(periods);
                confidenceIntervals = forecaster.calculateConfidenceIntervals(predictions);
                break;

            case 'seasonal':
                forecaster = new SeasonalNaiveForecast(historicalData);
                predictions = forecaster.predict(periods);
                confidenceIntervals = forecaster.calculateConfidenceIntervals(predictions);
                break;

            case 'holt-winters':
                try {
                    forecaster = new HoltWintersForecast(historicalData, options.seasonLength || 12);
                    predictions = forecaster.predict(periods);
                    confidenceIntervals = forecaster.calculateConfidenceIntervals(predictions);
                } catch (error) {
                    // Fallback to linear if not enough data
                    console.warn('Holt-Winters failed, falling back to linear regression', error);
                    forecaster = new LinearRegressionForecast(historicalData);
                    predictions = forecaster.predict(periods);
                    confidenceIntervals = forecaster.calculateConfidenceIntervals(predictions);
                }
                break;

            default:
                throw new Error('Unknown forecasting method');
        }

        return {
            method,
            historical: historicalData,
            predictions: confidenceIntervals,
            summary: this.generateSummary(historicalData, confidenceIntervals, method)
        };
    }

    /**
     * Generate textual summary
     * @param {Array} historical - Historical data
     * @param {Array} predictions - Predictions with intervals
     * @param {string} method - Method used
     * @returns {string}
     */
    generateSummary(historical, predictions, method) {
        const lastActual = historical[historical.length - 1].value;
        const firstPrediction = predictions[0].value;
        const avgPrediction = predictions.reduce((sum, p) => sum + p.value, 0) / predictions.length;

        const change = ((firstPrediction - lastActual) / lastActual) * 100;

        const methodNames = {
            'linear': 'Î“ÏÎ±Î¼Î¼Î¹ÎºÎ® Î Î±Î»Î¹Î½Î´ÏÏŒÎ¼Î·ÏƒÎ·',
            'seasonal': 'Î•Ï€Î¿Ï‡Î¹ÎºÎ® Î ÏÏŒÎ²Î»ÎµÏˆÎ·',
            'holt-winters': 'Holt-Winters'
        };

        let summary = `ÎœÎ­Î¸Î¿Î´Î¿Ï‚: ${methodNames[method] || method}\n\n`;

        if (change > 5) {
            summary += `ðŸ“ˆ Î‘Î½Î±Î¼Î­Î½ÎµÏ„Î±Î¹ Î±ÏÎ¾Î·ÏƒÎ· ÎµÏƒÏŒÎ´Ï‰Î½ ÎºÎ±Ï„Î¬ ${change.toFixed(1)}% Ï„Î¿Î½ ÎµÏ€ÏŒÎ¼ÎµÎ½Î¿ Î¼Î®Î½Î±.\n`;
        } else if (change < -5) {
            summary += `ðŸ“‰ Î‘Î½Î±Î¼Î­Î½ÎµÏ„Î±Î¹ Î¼ÎµÎ¯Ï‰ÏƒÎ· ÎµÏƒÏŒÎ´Ï‰Î½ ÎºÎ±Ï„Î¬ ${Math.abs(change).toFixed(1)}% Ï„Î¿Î½ ÎµÏ€ÏŒÎ¼ÎµÎ½Î¿ Î¼Î®Î½Î±.\n`;
        } else {
            summary += `âž¡ï¸ Î‘Î½Î±Î¼Î­Î½ÎµÏ„Î±Î¹ ÏƒÏ„Î±Î¸ÎµÏÏŒÏ„Î·Ï„Î± ÎµÏƒÏŒÎ´Ï‰Î½ (${Math.abs(change).toFixed(1)}% Î´Î¹Î±ÎºÏÎ¼Î±Î½ÏƒÎ·).\n`;
        }

        summary += `\nÎœÎ­ÏƒÎ¿Ï‚ ÏŒÏÎ¿Ï‚ Ï€ÏÏŒÎ²Î»ÎµÏˆÎ·Ï‚ Î³Î¹Î± Ï„Î¿Ï…Ï‚ ÎµÏ€ÏŒÎ¼ÎµÎ½Î¿Ï…Ï‚ ${predictions.length} Î¼Î®Î½ÎµÏ‚: ${avgPrediction.toFixed(2)} â‚¬\n`;

        // Confidence note
        const avgConfidence = predictions.reduce((sum, p) => sum + (p.upper - p.lower), 0) / predictions.length;
        summary += `\nÎ”Î¹Î¬ÏƒÏ„Î·Î¼Î± ÎµÎ¼Ï€Î¹ÏƒÏ„Î¿ÏƒÏÎ½Î·Ï‚: Â±${avgConfidence.toFixed(2)} â‚¬ (95%)`;

        return summary;
    }

    /**
     * Compare methods
     * @param {number} periods - Periods to forecast
     * @returns {Object}
     */
    compareAllMethods(periods = 6) {
        const methods = ['linear', 'seasonal', 'holt-winters'];
        const results = {};

        for (const method of methods) {
            try {
                results[method] = this.generateForecast(method, periods);
            } catch (error) {
                console.warn(`Method ${method} failed:`, error);
                results[method] = { error: error.message };
            }
        }

        return results;
    }
}

// ========================================
// Exports
// ========================================
export {
    ForecastManager,
    LinearRegressionForecast,
    SeasonalNaiveForecast,
    HoltWintersForecast
};
export default ForecastManager;