# 🔄 Αλλαγές Συστήματος Κρατήσεων

## 📋 Τι Άλλαξε

### Νέα Δομή Κρατήσεων

#### **ΕΟΠΥΥ (5 πεδία)**:
1. **Παρακράτηση** (€) - Εισπράχθηκε από εξεταζόμενους
2. **ΜΔΕ** (€) - Μηχανισμός Διοικητικής Επίλυσης  
3. **Rebate** (€) - Έκπτωση
4. **Κρατήσεις** (€) - Διάφορες κρατήσεις
5. **Clawback** (€) - Επιστροφή

**Όλα αφαιρούνται από το αρχικό ποσό:**
```
Τελικό Ποσό = Αρχικό - (Παρακράτηση + ΜΔΕ + Rebate + Κρατήσεις + Clawback)
```

#### **Άλλα Ταμεία (1 πεδίο)**:
- **Κρατήσεις** (€) - Γενικές κρατήσεις

```
Τελικό Ποσό = Αρχικό - Κρατήσεις
```

---

## 📊 Νέα Στατιστικά Dashboard

### Main KPIs:
- ✅ Συνολικά Έσοδα
- ✅ ΕΟΠΥΥ (Τελικό)
- ✅ Άλλα Ταμεία
- ✅ Κρατήσεις (Όλες)

### ΕΟΠΥΥ Breakdown (5 KPI Cards):
- 🟡 Παρακράτηση
- 🟣 ΜΔΕ
- 🔴 Rebate
- 🔵 Κρατήσεις
- 🔴 Clawback

### Toggle:
- **"Με Παρακράτηση"**: Εμφανίζει σύνολο **ΜΕ** την παρακράτηση (επειδή εισπράχθηκε)
- **Χωρίς checkbox**: Εμφανίζει σύνολο **ΧΩΡΙΣ** παρακράτηση

---

## 📁 Αρχεία που Άλλαξαν

### 1. **eopyyClawback.js** → **eopyyClawback.js (v2)**
- Μετονομασία: `EopyyDeductionsManager`
- Νέα structure: 5 deductions για ΕΟΠΥΥ
- Νέες μέθοδοι: `getAmountsBreakdown()`, `calculateKPIs()`
- Options: `{includeParakratisi: bool}`

### 2. **index.html (v2)**
- Νέα forms: `quickEopyyDeductions` (5 fields)
- Νέα forms: `modalEopyyDeductions` (5 fields)
- Νέα forms: `quickNonEopyyDeductions` (1 field)
- Νέα forms: `modalNonEopyyDeductions` (1 field)
- 5 KPI cards για ΕΟΠΥΥ breakdown
- Toggle: "Με Παρακράτηση"

### 3. **app.js (v2)**
- Import: `eopyyDeductionsManager` (updated)
- Entry structure: `entry.deductions = {parakratisi, mde, rebate, krathseis, clawback}`
- KPI calculation: `calculateKPIs(entries, {includeParakratisi})`
- Form handlers: `showDeductionFields()`, `showModalDeductionFields()`
- CSV export: Includes all 5 deductions

### 4. **pdfExport.js (v2)**
- Updated: `exportDashboard()` - includes breakdown
- Updated: `exportEntriesList()` - shows deductions
- Uses: `eopyyDeductionsManager.getAmountsBreakdown()`

### 5. **storage.js** - ΟΚ (no changes)
- Saves: `eopyyDeductions` setting

---

## 🧪 Testing Checklist

### ΕΟΠΥΥ Entries
```
✅ Create ΕΟΠΥΥ entry
✅ Add Παρακράτηση: 50€
✅ Add ΜΔΕ: 30€
✅ Add Rebate: 20€
✅ Add Κρατήσεις: 40€
✅ Add Clawback: 60€
✅ Verify: Τελικό = Αρχικό - 200€
✅ Dashboard shows all 5 breakdowns
✅ Toggle "Με Παρακράτηση" changes KPI
```

### Non-ΕΟΠΥΥ Entries
```
✅ Create Ιδιωτική entry
✅ Add Κρατήσεις: 100€
✅ Verify: Τελικό = Αρχικό - 100€
✅ Only 1 field visible
```

### CSV Export
```
✅ Export includes: Παρακράτηση, ΜΔΕ, Rebate, Κρατήσεις, Clawback
✅ Non-ΕΟΠΥΥ: Zeros for ΕΟΠΥΥ fields
```

### PDF Export
```
✅ Dashboard PDF shows breakdown
✅ Entries PDF shows deductions
```

---

## 📦 Deployment

### Αρχεία που πρέπει να αντικαταστήσεις:

1. ✅ **eopyyClawback.js** (ΝΕΟ - v2)
2. ✅ **index.html** (ΝΕΟ - v2)
3. ✅ **app.js** (ΝΕΟ - v2)
4. ✅ **pdfExport.js** (ΝΕΟ - v2)

### Αρχεία που παραμένουν ως έχουν:
- styles.css
- utils.js
- storage.js
- backup.js
- comparison.js
- forecasting.js
- charts.js
- cloudAdapters.js
- csvValidator.js
- cdnChecker.js
- service-worker.js
- oauth-callback.html

---

## 💡 Παραδείγματα Χρήσης

### Scenario 1: ΕΟΠΥΥ Invoice
```javascript
Entry:
- Αρχικό: 1000€
- Παρακράτηση: 100€ (10%)
- ΜΔΕ: 50€ (5%)
- Rebate: 30€ (3%)
- Κρατήσεις: 40€ (4%)
- Clawback: 80€ (8%)

Calculations:
- Σύνολο Κρατήσεων: 300€
- Τελικό Ποσό: 700€
- Τελικό (χωρίς Παρακράτηση): 800€
```

### Scenario 2: Ιδιωτική Ασφάλεια
```javascript
Entry:
- Αρχικό: 500€
- Κρατήσεις: 50€ (10%)

Calculations:
- Σύνολο Κρατήσεων: 50€
- Τελικό Ποσό: 450€
```

---

## 🎯 API Changes

### Old (v1):
```javascript
clawbackManager.applyClawback(entryId, clawbackAmount, clawbackPercent, notes)
```

### New (v2):
```javascript
deductionsManager.applyDeductions(entryId, {
    parakratisi: 100,
    mde: 50,
    rebate: 30,
    krathseis: 40,
    clawback: 80
}, notes)
```

### Get Breakdown:
```javascript
const amounts = deductionsManager.getAmountsBreakdown(entry);
// Returns:
{
    originalAmount: 1000,
    parakratisi: 100,
    mde: 50,
    rebate: 30,
    krathseis: 40,
    clawback: 80,
    totalDeductions: 300,
    finalAmount: 700,
    finalAmountNoParakratisi: 800,
    hasDeductions: true
}
```

### Calculate KPIs:
```javascript
// Without Παρακράτηση
const kpis = deductionsManager.calculateKPIs(entries, {includeParakratisi: false});

// With Παρακράτηση
const kpis = deductionsManager.calculateKPIs(entries, {includeParakratisi: true});
```

---

## ✨ Τελικές Σημειώσεις

**Backward Compatibility**: ❌ NO
- Παλιά δεδομένα θα πρέπει να μεταφερθούν manually
- Backup πριν το update!

**Migration Path**:
1. Export backup (old version)
2. Update files
3. Import backup
4. Add deductions manually για υπάρχουσες εγγραφές

---

**Version:** 2.0 (Advanced Deductions)  
**Last Updated:** 2025-01-12  
**Status:** ✅ Ready for Deployment