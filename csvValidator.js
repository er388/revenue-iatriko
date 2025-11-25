/**
 * csvValidator.js - CSV Import Validator
 * Enhanced validation with auto-fix capabilities
 * Version: 2.0 (Complete)
 */

import { isValidMonthYear, parseMonthYear, formatMonthYear, sanitizeText } from './utils.js';

// ========================================
// Configuration
// ========================================
const CSV_CONFIG = {
    requiredColumns: ['date', 'source', 'insurance', 'type', 'amount'],
    optionalColumns: ['notes', 'krathseis', 'krathseisPercent'],
    dateFormats: [
        /^\d{2}\/\d{4}$/, // MM/YYYY
        /^\d{1,2}\/\d{4}$/, // M/YYYY
        /^\d{4}-\d{2}$/, // YYYY-MM (ISO)
        /^\d{2}-\d{4}$/ // MM-YYYY
    ],
    typeValues: ['cash', 'invoice', 'μετρητά', 'τιμολόγια', 'τιμολογια'],
    maxFieldLength: 200,
    maxNoteLength: 500,
    encodings: ['UTF-8', 'ISO-8859-7', 'Windows-1253']
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
     * Validate CSV data
     * @param {Array} rows - Parsed CSV rows
     * @param {Object} columnMapping - Column name mapping
     * @returns {Object} Validation result
     */
    validate(rows, columnMapping = null) {
        this.errors = [];
        this.warnings = [];
        this.autoFixes = [];

        if (!rows || rows.length === 0) {
            this.errors.push({
                type: 'EMPTY_FILE',
                message: 'Το CSV αρχείο είναι κενό',
                row: null
            });
            return this.buildResult(rows);
        }

        // Detect and normalize headers
        const headers = this.normalizeHeaders(Object.keys(rows[0]));
        const mapping = columnMapping || this.detectColumnMapping(headers);

        // Validate structure
        this.validateStructure(headers, mapping);

        // Validate each row
        const validatedRows = [];
        rows.forEach((row, index) => {
            const validatedRow = this.validateRow(row, mapping, index + 1);
            if (validatedRow) {
                validatedRows.push(validatedRow);
            }
        });

        return this.buildResult(validatedRows);
    }

    /**
     * Normalize headers (trim, lowercase, remove special chars)
     * @param {Array} headers - Raw headers
     * @returns {Array} Normalized headers
     * @private
     */
    normalizeHeaders(headers) {
        return headers.map(h => {
            const normalized = h.trim()
                .toLowerCase()
                .replace(/\s+/g, '_')
                .replace(/[^\w\u0370-\u03FF\u1F00-\u1FFF]/g, '');
            
            if (normalized !== h) {
                this.autoFixes.push({
                    type: 'HEADER_NORMALIZED',
                    original: h,
                    fixed: normalized
                });
            }
            
            return normalized;
        });
    }

    /**
     * Detect column mapping from headers
     * @param {Array} headers - Normalized headers
     * @returns {Object} Column mapping
     * @private
     */
    detectColumnMapping(headers) {
        const mapping = {};

        // Common Greek/English column name variations
        const mappings = {
            date: ['date', 'ημερομηνία', 'ημερομηνια', 'ημ/νια', 'ημνια', 'month', 'μηνας'],
            source: ['source', 'διαγνωστικό', 'διαγνωστικο', 'πηγή', 'πηγη', 'κέντρο', 'κεντρο'],
            insurance: ['insurance', 'ασφάλεια', 'ασφαλεια', 'ταμείο', 'ταμειο'],
            type: ['type', 'τύπος', 'τυπος', 'είδος', 'ειδος'],
            amount: ['amount', 'ποσό', 'ποσο', 'αξία', 'αξια', 'value'],
            notes: ['notes', 'σημειώσεις', 'σημειωσεις', 'παρατηρήσεις', 'παρατηρησεις'],
            krathseis: ['krathseis', 'κρατήσεις', 'κρατησεις', 'deductions'],
            krathseisPercent: ['krathseis_percent', 'κρατησεις_%', 'deduction_%']
        };

        headers.forEach(header => {
            for (const [key, variations] of Object.entries(mappings)) {
                if (variations.some(v => header.includes(v))) {
                    mapping[key] = header;
                    break;
                }
            }
        });

        return mapping;
    }

    /**
     * Validate CSV structure (required columns)
     * @param {Array} headers - Headers
     * @param {Object} mapping - Column mapping
     * @private
     */
    validateStructure(headers, mapping) {
        const missingRequired = CSV_CONFIG.requiredColumns.filter(col => !mapping[col]);

        if (missingRequired.length > 0) {
            this.errors.push({
                type: 'MISSING_COLUMNS',
                message: `Λείπουν υποχρεωτικές στήλες: ${missingRequired.join(', ')}`,
                row: null,
                details: { missing: missingRequired }
            });
        }
    }

    /**
     * Validate single row
     * @param {Object} row - Raw row data
     * @param {Object} mapping - Column mapping
     * @param {number} rowIndex - Row number (1-based)
     * @returns {Object|null} Validated row or null if invalid
     * @private
     */
    validateRow(row, mapping, rowIndex) {
        const validated = {};
        let hasErrors = false;

        // Validate date
        const dateResult = this.validateDate(row[mapping.date], rowIndex);
        if (dateResult.error) {
            hasErrors = true;
        } else {
            validated.date = dateResult.value;
        }

        // Validate source
        const sourceResult = this.validateText(row[mapping.source], 'source', rowIndex);
        if (sourceResult.error) {
            hasErrors = true;
        } else {
            validated.source = sourceResult.value;
        }

        // Validate insurance
        const insuranceResult = this.validateText(row[mapping.insurance], 'insurance', rowIndex);
        if (insuranceResult.error) {
            hasErrors = true;
        } else {
            validated.insurance = insuranceResult.value;
        }

        // Validate type
        const typeResult = this.validateType(row[mapping.type], rowIndex);
        if (typeResult.error) {
            hasErrors = true;
        } else {
            validated.type = typeResult.value;
        }

        // Validate amount
        const amountResult = this.validateAmount(row[mapping.amount], rowIndex);
        if (amountResult.error) {
            hasErrors = true;
        } else {
            validated.amount = amountResult.value;
        }

        // Optional fields
        if (mapping.notes) {
            validated.notes = this.sanitizeNotes(row[mapping.notes]);
        }

        if (mapping.krathseis) {
            const krathseisResult = this.validateAmount(row[mapping.krathseis], rowIndex, true);
            if (!krathseisResult.error) {
                validated.krathseis = krathseisResult.value;
            }
        }

        if (mapping.krathseisPercent) {
            const percentResult = this.validatePercent(row[mapping.krathseisPercent], rowIndex, true);
            if (!percentResult.error) {
                validated.krathseisPercent = percentResult.value;
            }
        }

        return hasErrors ? null : validated;
    }

    /**
     * Validate date field
     * @param {string} value - Date value
     * @param {number} rowIndex - Row number
     * @returns {Object} Validation result
     * @private
     */
    validateDate(value, rowIndex) {
        if (!value || value.trim() === '') {
            this.errors.push({
                type: 'MISSING_DATE',
                message: `Γραμμή ${rowIndex}: Λείπει η ημερομηνία`,
                row: rowIndex
            });
            return { error: true };
        }

        const trimmed = value.trim();

        // Check if already valid MM/YYYY
        if (isValidMonthYear(trimmed)) {
            return { value: trimmed };
        }

        // Try to auto-fix common formats
        let fixed = null;

        // M/YYYY → MM/YYYY
        if (/^\d{1}\/\d{4}$/.test(trimmed)) {
            fixed = '0' + trimmed;
        }
        // YYYY-MM → MM/YYYY
        else if (/^\d{4}-\d{2}$/.test(trimmed)) {
            const [year, month] = trimmed.split('-');
            fixed = `${month}/${year}`;
        }
        // MM-YYYY → MM/YYYY
        else if (/^\d{2}-\d{4}$/.test(trimmed)) {
            fixed = trimmed.replace('-', '/');
        }

        if (fixed && isValidMonthYear(fixed)) {
            this.autoFixes.push({
                type: 'DATE_FORMAT',
                row: rowIndex,
                original: trimmed,
                fixed
            });
            return { value: fixed };
        }

        this.errors.push({
            type: 'INVALID_DATE',
            message: `Γραμμή ${rowIndex}: Μη έγκυρη ημερομηνία "${trimmed}"`,
            row: rowIndex
        });
        return { error: true };
    }

    /**
     * Validate text field
     * @param {string} value - Text value
     * @param {string} fieldName - Field name
     * @param {number} rowIndex - Row number
     * @returns {Object} Validation result
     * @private
     */
    validateText(value, fieldName, rowIndex) {
        if (!value || value.trim() === '') {
            this.errors.push({
                type: 'MISSING_FIELD',
                message: `Γραμμή ${rowIndex}: Λείπει το πεδίο "${fieldName}"`,
                row: rowIndex,
                field: fieldName
            });
            return { error: true };
        }

        let cleaned = value.trim();

        // Check length
        if (cleaned.length > CSV_CONFIG.maxFieldLength) {
            cleaned = cleaned.substring(0, CSV_CONFIG.maxFieldLength);
            this.warnings.push({
                type: 'FIELD_TRUNCATED',
                message: `Γραμμή ${rowIndex}: Το πεδίο "${fieldName}" περικόπηκε στους ${CSV_CONFIG.maxFieldLength} χαρακτήρες`,
                row: rowIndex,
                field: fieldName
            });
        }

        // Sanitize
        cleaned = sanitizeText(cleaned);

        if (cleaned !== value.trim()) {
            this.autoFixes.push({
                type: 'TEXT_SANITIZED',
                row: rowIndex,
                field: fieldName,
                original: value.trim(),
                fixed: cleaned
            });
        }

        return { value: cleaned };
    }

    /**
     * Validate type field
     * @param {string} value - Type value
     * @param {number} rowIndex - Row number
     * @returns {Object} Validation result
     * @private
     */
    validateType(value, rowIndex) {
        if (!value || value.trim() === '') {
            this.errors.push({
                type: 'MISSING_TYPE',
                message: `Γραμμή ${rowIndex}: Λείπει ο τύπος`,
                row: rowIndex
            });
            return { error: true };
        }

        const normalized = value.trim().toLowerCase();

        // Map to standard values
        if (['cash', 'μετρητά', 'μετρητα'].includes(normalized)) {
            if (normalized !== 'cash') {
                this.autoFixes.push({
                    type: 'TYPE_NORMALIZED',
                    row: rowIndex,
                    original: value,
                    fixed: 'cash'
                });
            }
            return { value: 'cash' };
        }

        if (['invoice', 'τιμολόγια', 'τιμολογια', 'τιμολόγιο', 'τιμολογιο'].includes(normalized)) {
            if (normalized !== 'invoice') {
                this.autoFixes.push({
                    type: 'TYPE_NORMALIZED',
                    row: rowIndex,
                    original: value,
                    fixed: 'invoice'
                });
            }
            return { value: 'invoice' };
        }

        this.errors.push({
            type: 'INVALID_TYPE',
            message: `Γραμμή ${rowIndex}: Μη έγκυρος τύπος "${value}"`,
            row: rowIndex
        });
        return { error: true };
    }

    /**
     * Validate amount field
     * @param {string|number} value - Amount value
     * @param {number} rowIndex - Row number
     * @param {boolean} optional - Is optional field
     * @returns {Object} Validation result
     * @private
     */
    validateAmount(value, rowIndex, optional = false) {
        if (!value || value === '') {
            if (optional) {
                return { value: 0 };
            }
            this.errors.push({
                type: 'MISSING_AMOUNT',
                message: `Γραμμή ${rowIndex}: Λείπει το ποσό`,
                row: rowIndex
            });
            return { error: true };
        }

        // Clean amount string (remove €, spaces, commas)
        let cleaned = value.toString()
            .replace(/€/g, '')
            .replace(/\s/g, '')
            .replace(/\./g, '') // Remove thousand separators
            .replace(/,/g, '.'); // Replace decimal comma with dot

        const amount = parseFloat(cleaned);

        if (isNaN(amount)) {
            if (optional) {
                return { value: 0 };
            }
            this.errors.push({
                type: 'INVALID_AMOUNT',
                message: `Γραμμή ${rowIndex}: Μη έγκυρο ποσό "${value}"`,
                row: rowIndex
            });
            return { error: true };
        }

        if (amount < 0) {
            this.warnings.push({
                type: 'NEGATIVE_AMOUNT',
                message: `Γραμμή ${rowIndex}: Αρνητικό ποσό "${amount}"`,
                row: rowIndex
            });
        }

        if (cleaned !== value.toString()) {
            this.autoFixes.push({
                type: 'AMOUNT_CLEANED',
                row: rowIndex,
                original: value,
                fixed: amount.toFixed(2)
            });
        }

        return { value: amount };
    }

    /**
     * Validate percent field
     * @param {string|number} value - Percent value
     * @param {number} rowIndex - Row number
     * @param {boolean} optional - Is optional field
     * @returns {Object} Validation result
     * @private
     */
    validatePercent(value, rowIndex, optional = false) {
        if (!value || value === '') {
            return { value: 0 };
        }

        const cleaned = value.toString().replace(/%/g, '').replace(/,/g, '.').trim();
        const percent = parseFloat(cleaned);

        if (isNaN(percent)) {
            if (optional) {
                return { value: 0 };
            }
            this.warnings.push({
                type: 'INVALID_PERCENT',
                message: `Γραμμή ${rowIndex}: Μη έγκυρο ποσοστό "${value}"`,
                row: rowIndex
            });
            return { value: 0 };
        }

        if (percent < 0 || percent > 100) {
            this.warnings.push({
                type: 'PERCENT_OUT_OF_RANGE',
                message: `Γραμμή ${rowIndex}: Ποσοστό εκτός ορίων (0-100): ${percent}`,
                row: rowIndex
            });
        }

        return { value: percent };
    }

    /**
     * Sanitize notes field
     * @param {string} value - Notes value
     * @returns {string} Sanitized notes
     * @private
     */
    sanitizeNotes(value) {
        if (!value) return '';

        let cleaned = value.trim();

        if (cleaned.length > CSV_CONFIG.maxNoteLength) {
            cleaned = cleaned.substring(0, CSV_CONFIG.maxNoteLength);
        }

        return sanitizeText(cleaned);
    }

    /**
     * Build validation result
     * @param {Array} rows - Validated rows
     * @returns {Object} Result object
     * @private
     */
    buildResult(rows) {
        return {
            valid: this.errors.length === 0,
            rows: rows,
            summary: {
                totalRows: rows.length,
                validRows: rows.length,
                invalidRows: 0,
                totalErrors: this.errors.length,
                totalWarnings: this.warnings.length,
                totalAutoFixes: this.autoFixes.length
            },
            errors: this.errors,
            warnings: this.warnings,
            autoFixes: this.autoFixes
        };
    }
}

// ========================================
// Singleton Instance
// ========================================
const csvValidator = new CSVValidator();

// ========================================
// Export
// ========================================
export { CSVValidator, CSV_CONFIG };
export default csvValidator;
