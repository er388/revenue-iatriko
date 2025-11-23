/**
 * csvValidator.js - Enhanced CSV Validation Module
 * Validation, error detection, ÎºÎ±Î¹ auto-correction Î³Î¹Î± CSV imports
 */

import {
    parseMonthYear,
    isValidMonthYear,
    hasInvalidCharacters,
    isValidAmount,
    escapeHtml
} from './utils.js';

// ========================================
// CSV Validation Rules
// ========================================
const VALIDATION_RULES = {
    date: {
        required: true,
        validator: isValidMonthYear,
        errorMessage: 'ÎœÎ· Î­Î³ÎºÏ…ÏÎ· Î·Î¼ÎµÏÎ¿Î¼Î·Î½Î¯Î± (Î±Ï€Î±Î¹Ï„ÎµÎ¯Ï„Î±Î¹ ÎœÎœ/Î•Î•Î•Î•)',
        autoFix: (value) => {
            // Try to fix common date formats
            if (!value) return null;
            
            // DD/MM/YYYY -> MM/YYYY
            const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/;
            if (ddmmyyyy.test(value)) {
                const [, , mm, yyyy] = value.match(ddmmyyyy);
                return `${mm}/${yyyy}`;
            }
            
            // MM-YYYY -> MM/YYYY
            if (value.includes('-')) {
                return value.replace('-', '/');
            }
            
            // MMYYYY -> MM/YYYY
            if (/^\d{6}$/.test(value)) {
                return `${value.slice(0, 2)}/${value.slice(2)}`;
            }
            
            return null;
        }
    },
    source: {
        required: true,
        validator: (value) => value && value.trim().length > 0,
        errorMessage: 'Î— Ï€Î·Î³Î® ÎµÎ¯Î½Î±Î¹ Ï…Ï€Î¿Ï‡ÏÎµÏ‰Ï„Î¹ÎºÎ®',
        autoFix: null
    },
    insurance: {
        required: true,
        validator: (value) => value && value.trim().length > 0,
        errorMessage: 'Î— Î±ÏƒÏ†Î¬Î»ÎµÎ¹Î± ÎµÎ¯Î½Î±Î¹ Ï…Ï€Î¿Ï‡ÏÎµÏ‰Ï„Î¹ÎºÎ®',
        autoFix: null
    },
    type: {
        required: true,
        validator: (value) => {
            if (!value) return false;
            const normalized = value.toLowerCase().trim();
            return normalized.includes('Î¼ÎµÏ„ÏÎ·Ï„') || 
                   normalized.includes('cash') || 
                   normalized.includes('Ï„Î¹Î¼Î¿Î»') || 
                   normalized.includes('invoice');
        },
        errorMessage: 'ÎœÎ· Î­Î³ÎºÏ…ÏÎ¿Ï‚ Ï„ÏÏ€Î¿Ï‚ (ÎœÎµÏ„ÏÎ·Ï„Î¬ Î® Î¤Î¹Î¼Î¿Î»ÏŒÎ³Î¹Î±)',
        autoFix: (value) => {
            if (!value) return null;
            const normalized = value.toLowerCase().trim();
            if (normalized.includes('Î¼ÎµÏ„ÏÎ·Ï„') || normalized.includes('cash')) {
                return 'cash';
            }
            if (normalized.includes('Ï„Î¹Î¼Î¿Î»') || normalized.includes('invoice')) {
                return 'invoice';
            }
            return null;
        }
    },
    amount: {
        required: true,
        validator: isValidAmount,
        errorMessage: 'ÎœÎ· Î­Î³ÎºÏ…ÏÎ¿ Ï€Î¿ÏƒÏŒ',
        autoFix: (value) => {
            if (!value) return null;
            
            // Remove currency symbols and spaces
            let cleaned = String(value)
                .replace(/[â‚¬$Â£]/g, '')
                .replace(/\s/g, '')
                .trim();
            
            // Handle Greek number format (1.234,56 -> 1234.56)
            if (cleaned.includes(',') && cleaned.includes('.')) {
                // Assume Greek format
                cleaned = cleaned.replace(/\./g, '').replace(',', '.');
            } else if (cleaned.includes(',')) {
                // Could be decimal comma
                cleaned = cleaned.replace(',', '.');
            }
            
            const num = parseFloat(cleaned);
            return isNaN(num) ? null : num;
        }
    }
};

// ========================================
// CSV Validator Class
// ========================================
class CSVValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.autoFixes = [];
    }

    /**
     * Validate entire CSV data
     * @param {Array} rows - Parsed CSV rows
     * @param {Object} columnMapping - Column indices mapping
     * @returns {Object}
     */
    validate(rows, columnMapping) {
        this.errors = [];
        this.warnings = [];
        this.autoFixes = [];

        const validatedRows = [];
        const headers = Object.keys(columnMapping);

        rows.forEach((row, rowIndex) => {
            const rowErrors = [];
            const rowWarnings = [];
            const rowFixes = [];
            const validatedRow = { ...row, _rowIndex: rowIndex, _valid: true };

            // Validate each required field
            Object.entries(columnMapping).forEach(([field, columnIndex]) => {
                if (VALIDATION_RULES[field]) {
                    const value = row[headers[columnIndex]];
                    const result = this.validateField(field, value, rowIndex);

                    if (!result.valid) {
                        rowErrors.push(result.error);
                        validatedRow._valid = false;
                    }

                    if (result.warning) {
                        rowWarnings.push(result.warning);
                    }

                    if (result.autoFixed) {
                        rowFixes.push(result.autoFixed);
                        validatedRow[field] = result.fixedValue;
                    } else {
                        validatedRow[field] = value;
                    }
                }
            });

            // Additional validations
            const additionalValidation = this.validateRowLogic(validatedRow, rowIndex);
            if (additionalValidation.errors.length > 0) {
                rowErrors.push(...additionalValidation.errors);
                validatedRow._valid = false;
            }
            if (additionalValidation.warnings.length > 0) {
                rowWarnings.push(...additionalValidation.warnings);
            }

            validatedRow._errors = rowErrors;
            validatedRow._warnings = rowWarnings;
            validatedRow._fixes = rowFixes;

            this.errors.push(...rowErrors);
            this.warnings.push(...rowWarnings);
            this.autoFixes.push(...rowFixes);

            validatedRows.push(validatedRow);
        });

        return {
            valid: this.errors.length === 0,
            rows: validatedRows,
            summary: {
                totalRows: rows.length,
                validRows: validatedRows.filter(r => r._valid).length,
                invalidRows: validatedRows.filter(r => !r._valid).length,
                totalErrors: this.errors.length,
                totalWarnings: this.warnings.length,
                totalAutoFixes: this.autoFixes.length
            },
            errors: this.errors,
            warnings: this.warnings,
            autoFixes: this.autoFixes
        };
    }

    /**
     * Validate single field
     * @private
     */
    validateField(fieldName, value, rowIndex) {
        const rule = VALIDATION_RULES[fieldName];
        const result = {
            valid: false,
            error: null,
            warning: null,
            autoFixed: false,
            fixedValue: value
        };

        // Check if empty
        if (!value || String(value).trim() === '') {
            if (rule.required) {
                result.error = {
                    row: rowIndex + 1,
                    field: fieldName,
                    value: value,
                    message: rule.errorMessage
                };
            }
            return result;
        }

        // Validate
        if (!rule.validator(value)) {
            // Try auto-fix
            if (rule.autoFix) {
                const fixed = rule.autoFix(value);
                if (fixed !== null && rule.validator(fixed)) {
                    result.valid = true;
                    result.autoFixed = true;
                    result.fixedValue = fixed;
                    result.warning = {
                        row: rowIndex + 1,
                        field: fieldName,
                        message: `Î‘Ï…Ï„ÏŒÎ¼Î±Ï„Î· Î´Î¹ÏŒÏÎ¸Ï‰ÏƒÎ·: "${value}" â†’ "${fixed}"`
                    };
                    return result;
                }
            }

            result.error = {
                row: rowIndex + 1,
                field: fieldName,
                value: value,
                message: rule.errorMessage
            };
            return result;
        }

        result.valid = true;
        return result;
    }

    /**
     * Validate row logic (cross-field validation)
     * @private
     */
    validateRowLogic(row, rowIndex) {
        const errors = [];
        const warnings = [];

        // Check for empty rows
        const fieldCount = Object.keys(row).filter(k => !k.startsWith('_') && row[k]).length;
        if (fieldCount === 0) {
            warnings.push({
                row: rowIndex + 1,
                message: 'ÎšÎµÎ½Î® Î³ÏÎ±Î¼Î¼Î® - Î¸Î± Ï€Î±ÏÎ±Î»ÎµÎ¹Ï†Î¸ÎµÎ¯'
            });
        }

        // Check for invalid characters
        Object.entries(row).forEach(([field, value]) => {
            if (field.startsWith('_')) return;
            
            if (value && hasInvalidCharacters(String(value))) {
                warnings.push({
                    row: rowIndex + 1,
                    field,
                    message: 'Î ÎµÏÎ¹Î­Ï‡ÎµÎ¹ Î¼Î· Î­Î³ÎºÏ…ÏÎ¿Ï…Ï‚ Ï‡Î±ÏÎ±ÎºÏ„Î®ÏÎµÏ‚ (emoji, ÎµÎ¹Î´Î¹ÎºÎ¬ ÏƒÏÎ¼Î²Î¿Î»Î±)'
                });
            }
        });

        // Check for suspiciously large amounts
        if (row.amount && parseFloat(row.amount) > 1000000) {
            warnings.push({
                row: rowIndex + 1,
                field: 'amount',
                message: 'Î Î¿Î»Ï Î¼ÎµÎ³Î¬Î»Î¿ Ï€Î¿ÏƒÏŒ (>1Mâ‚¬) - ÎµÏ€Î±Î»Î·Î¸ÎµÏÏƒÏ„Îµ'
            });
        }

        return { errors, warnings };
    }

    /**
     * Generate validation report HTML
     * @param {Object} validationResult - Validation result
     * @returns {string}
     */
    generateReportHTML(validationResult) {
        let html = '<div class="validation-report">';

        // Summary
        html += '<div class="validation-summary">';
        html += `<h4>Î ÎµÏÎ¯Î»Î·ÏˆÎ· Validation</h4>`;
        html += `<p><strong>Î£ÏÎ½Î¿Î»Î¿ Î“ÏÎ±Î¼Î¼ÏŽÎ½:</strong> ${validationResult.summary.totalRows}</p>`;
        html += `<p><strong>ÎˆÎ³ÎºÏ…ÏÎµÏ‚:</strong> <span class="text-success">${validationResult.summary.validRows}</span></p>`;
        html += `<p><strong>ÎœÎ· ÎˆÎ³ÎºÏ…ÏÎµÏ‚:</strong> <span class="text-danger">${validationResult.summary.invalidRows}</span></p>`;
        html += `<p><strong>Î£Ï†Î¬Î»Î¼Î±Ï„Î±:</strong> ${validationResult.summary.totalErrors}</p>`;
        html += `<p><strong>Î ÏÎ¿ÎµÎ¹Î´Î¿Ï€Î¿Î¹Î®ÏƒÎµÎ¹Ï‚:</strong> ${validationResult.summary.totalWarnings}</p>`;
        html += `<p><strong>Î‘Ï…Ï„ÏŒÎ¼Î±Ï„ÎµÏ‚ Î”Î¹Î¿ÏÎ¸ÏŽÏƒÎµÎ¹Ï‚:</strong> ${validationResult.summary.totalAutoFixes}</p>`;
        html += '</div>';

        // Errors
        if (validationResult.errors.length > 0) {
            html += '<div class="validation-errors">';
            html += '<h4>Î£Ï†Î¬Î»Î¼Î±Ï„Î±</h4>';
            html += '<ul>';
            validationResult.errors.forEach(error => {
                html += `<li class="error-item">`;
                html += `<strong>Î“ÏÎ±Î¼Î¼Î® ${error.row}:</strong> `;
                html += `${escapeHtml(error.message)}`;
                if (error.value) {
                    html += ` (Î¤Î¹Î¼Î®: "${escapeHtml(String(error.value))}")`;
                }
                html += `</li>`;
            });
            html += '</ul>';
            html += '</div>';
        }

        // Warnings
        if (validationResult.warnings.length > 0) {
            html += '<div class="validation-warnings">';
            html += '<h4>Î ÏÎ¿ÎµÎ¹Î´Î¿Ï€Î¿Î¹Î®ÏƒÎµÎ¹Ï‚</h4>';
            html += '<ul>';
            validationResult.warnings.forEach(warning => {
                html += `<li class="warning-item">`;
                html += `<strong>Î“ÏÎ±Î¼Î¼Î® ${warning.row}:</strong> `;
                html += `${escapeHtml(warning.message)}`;
                html += `</li>`;
            });
            html += '</ul>';
            html += '</div>';
        }

        // Auto-fixes
        if (validationResult.autoFixes.length > 0) {
            html += '<div class="validation-fixes">';
            html += '<h4>Î‘Ï…Ï„ÏŒÎ¼Î±Ï„ÎµÏ‚ Î”Î¹Î¿ÏÎ¸ÏŽÏƒÎµÎ¹Ï‚</h4>';
            html += '<ul>';
            validationResult.autoFixes.forEach(fix => {
                html += `<li class="fix-item">`;
                html += `<strong>Î“ÏÎ±Î¼Î¼Î® ${fix.row}:</strong> `;
                html += `${escapeHtml(fix.message)}`;
                html += `</li>`;
            });
            html += '</ul>';
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    /**
     * Highlight problematic rows ÏƒÏ„Î¿ preview table
     * @param {Object} validationResult - Validation result
     * @returns {Array}
     */
    getHighlightedRows(validationResult) {
        return validationResult.rows.map(row => ({
            ...row,
            _highlight: !row._valid ? 'error' : row._warnings.length > 0 ? 'warning' : null
        }));
    }
}

// ========================================
// Singleton Instance
// ========================================
const csvValidator = new CSVValidator();

// ========================================
// Exports
// ========================================
export { CSVValidator, VALIDATION_RULES };
export default csvValidator;