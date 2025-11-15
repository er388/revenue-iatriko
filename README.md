**Ρόλος:** Είσαι ένας έμπειρος full-stack JavaScript developer με εξειδίκευση σε vanilla JS, HTML5, CSS και state management.

**Context:** Θα σου παρέχω 17 αρχεία (JS, css, md και HTML) που αποτελούν μια ολοκληρωμένη web εφαρμογή διαχείρισης εσόδων. Πρέπει να τα διαβάσεις, να τα κατανοήσεις όλα, και να χτίσεις ένα πλήρες νοητικό μοντέλο του πώς αλληλεπιδρούν μεταξύ τους.

**Αποστολή:** Η αποστολή σου είναι να υλοποιήσεις μια μεγάλη λίστα αναβαθμίσεων, νέων λειτουργιών και διορθώσεων. Οι αλλαγές είναι ομαδοποιημένες στις παρακάτω κατηγορίες. Υλοποίησέ τες με ακρίβεια.

---

### 1. 🌟 Υλοποίηση Νέων Λειτουργιών (Tabs "Under Development")

Πέντε καρτέλες είναι ανενεργές. Πρέπει να τις υλοποιήσεις, συνδέοντας τα υπάρχοντα modules (που σου παρέχω) με το UI.

* **Reports (`#reportsView`):** Υλοποίησε την καρτέλα. Πρόσθεσε selectors για επιλογή περιόδου και δημιούργησε πίνακες αναφορών. Υλοποίησε τη δυνατότητα για **ετήσιο report**.
* **Comparison (`#comparisonView`):** Υλοποίησε την καρτέλα. Πρόσθεσε selectors για δύο περιόδους (Period 1, Period 2), εμφάνισε τα KPIs σε side-by-side μορφή και σχεδίασε τα γραφήματα σύγκρισης (το module `comparison.js` υπάρχει).
* **Forecasting (`#forecastingView`):** Υλοποίησε την καρτέλα. Πρόσθεσε selectors για τη μέθοδο (Linear, Seasonal, Holt-Winters) και εμφάνισε το γράφημα πρόβλεψης με τα confidence intervals (το module `forecasting.js` υπάρχει).
* **Heatmaps (`#heatmapsView`):** Υλοποίησε την καρτέλα. Πρόσθεσε ένα `<canvas>` και selectors για τον τύπο του heatmap. Φόρτωσε τα δεδομένα και σχεδίασε το heatmap (το module `charts.js` υπάρχει).
* **Cloud (`#cloudView`):** Υλοποίησε την καρτέλα. Δημιούργησε UI για σύνδεση, αποσύνδεση και διαχείριση αρχείων με **Google Drive, Dropbox και OneDrive** (το module `cloudAdapters.js` υπάρχει).

### 2. ⚙️ Λογική Δεδομένων & Υπολογισμοί

* **Ποσοστά Κρατήσεων:** Κατά την αποθήκευση (νέα ή επεξεργασία) μιας εγγραφής, πρέπει να υπολογίζονται και να **αποθηκεύονται** και τα ποσοστά (π.χ. `parakratisiPercent`) μαζί με την εγγραφή.
* **Εισαγωγή Clawback:** Το Clawback πρέπει να μπορεί να εισαχθεί ως μηνιαίο, τριμηνιαίο, εξαμηνιαίο ή ετήσιο. Τροποποίησε το modal εισαγωγής εγγραφής για να το επιτρέπει.
* **Προεπιλεγμένη Παρακράτηση:** Όλοι οι υπολογισμοί "Τελικού Ποσού" (στο Dashboard, Charts, Reports) πρέπει **από προεπιλογή να ΑΦΑΙΡΟΥΝ την παρακράτηση**. Η επιλογή "Με Παρακράτηση" πρέπει να την *προσθέτει* ξανά (αντίστροφη λογική από την τωρινή).

### 3. 🖥️ Αλλαγές UI/UX (Layout & Στυλ)

* **Dashboard - Μετακίνηση Header:** Το `div` "Επισκόπηση - Όλα - Με Παρακράτηση" πρέπει να μετακινηθεί *κάτω* από τη "Γρήγορη Καταχώριση" και *πάνω* από τα charts/KPIs.
* **Dashboard - Προεπιλογή Φίλτρου:** Στην επισκόπηση, το φίλτρο περιόδου να είναι default στο "Όλα".
* **Dashboard - Προσαρμογή Layout (Drag & Drop):**
    * Όλα τα blocks στην επισκόπηση (Γρήγορη Καταχώριση, KPIs, Charts, Πρόσφατες Εγγραφές) πρέπει να γίνουν μετακινήσιμα (drag-and-drop) ώστε ο χρήστης να αλλάζει τη σειρά τους.
    * Τα μπλε ορθογώνια (KPIs) πρέπει να είναι μετακινήσιμα μεταξύ τους.
* **Dashboard - Redesign KPI Cards:** Άλλαξε το στυλ των KPI cards:
    * Ο τίτλος να είναι στο κέντρο.
    * Το ποσό να είναι αριστερά.
    * Πρόσθεσε εμφάνιση ποσοστού στα δεξιά (π.χ. "xx,xx %").
* **Dashboard - Πρόσφατες Εγγραφές:**
    * Ο τίτλος της στήλης "Ποσό" να γίνει "Τελικό Ποσό".
    * Η στήλη να αντικατοπτρίζει το τελικό ποσό.
    * Διόρθωσε τη στοίχιση των στηλών.
* **Entries View - Κουμπιά CSV:** Οι ετικέτες των δύο κουμπιών CSV πρέπει να γίνουν σαφείς. Άλλαξέ τες σε "Import CSV" και "Export CSV".
* **Entries View - Στήλες Πίνακα:**
    * Ο πίνακας πρέπει να δείχνει τις **επιμέρους κρατήσεις** (Παρακράτηση, ΜΔΕ, Rebate, κλπ.) ως ξεχωριστές στήλες.
    * Διόρθωσε τη στοίχιση όλων των στηλών.
* **Entries View - Σελίδες & Ταξινόμηση:**
    * Πρόσθεσε επιλογή για σελιδοποίηση (25, 50, 75, 100, 150 εγγραφές ανά σελίδα).
    * Κάνε όλες τις επικεφαλίδες του πίνακα clickable για ταξινόμηση (ASC/DESC).
* **Entries View - Φίλτρο "Έως":** Στο φίλτρο "Ποσό Έως", αύξησε το όριο (placeholder και max) σε 9999999.
* **Modals (Παράθυρα):** Όλα τα παράθυρα που ανοίγουν (π.χ. Επεξεργασία Εγγραφής, Import) πρέπει να γίνουν **μετακινήσιμα** και να επιτρέπουν **αλλαγή μεγέθους**.
* **Settings View (Tweaks):**
    * Διέγραψε την επικεφαλίδα "Autosave".
    * Αφαίρεσε τη μαύρη γραμμή κάτω από το κείμενο του autosave.
    * Αφαίρεσε τη γκρι γραμμή στο κάτω μέρος της "Επικίνδυνης Ζώνης".

### 4. 💾 Λογική Backup & Autosave

* **Ρυθμιζόμενο Autosave:** Το όριο των 5 αλλαγών για το autosave πρέπει να είναι ρυθμιζόμενο από τον χρήστη (όπως ζητήθηκε).
* **Αυτόματη Φόρτωση Backup:** Όταν ανοίγει η σελίδα, να ανοίγει αυτόματα ο file browser για να βρει το backup ο χρήστης.
* **Προειδοποίηση κατά το Κλείσιμο:** Αν ο χρήστης πάει να κλείσει τη σελίδα και υπάρχουν αλλαγές που δεν έχουν γίνει backup, να εμφανίζεται προειδοποίηση.

### 5. 📊 Γραφήματα (Charts)

* **Φίλτρα Γραφημάτων:** Πρόσθεσε φίλτρα πάνω από το Pie chart και το γράφημα Εξέλιξης (Διαγνωστικό, Πηγή, Ημερομηνία Μήνας/Έτος, "Με Παρακράτηση").
* **Μηνιαία Εξέλιξη:**
    * Πρόσθεσε γραμμή τάσης (trend line).
    * Πρόσθεσε δυνατότητα "γρήγορης σύγκρισης" (π.χ. % αλλαγή).
    * Πρόσθεσε toggle για εμφάνιση/απόκρυψη επιμέρους δεδομένων (π.χ. cash vs invoice).

### 6. 🐛 Διορθώσεις Σφαλμάτων (Bug Fixes)

* **Επεξεργασία Εγγραφής (Ποσοστά):**
    * Όταν ανοίγει το modal "Επεξεργασία", τα *αποθηκευμένα* ποσοστά πρέπει να εμφανίζονται αμέσως (συνδέεται με το Task 2.1).
    * Διόρθωσε το bug όπου τα ποσοστά από μια εγγραφή "μένουν" στο modal όταν ανοίγεις την επόμενη.
* **Καθαρισμός Quick Add Form:** Μετά από επιτυχή καταχώριση, το πεδίο "Τελικό Ποσό" πρέπει να μηδενίζει.
Φτιάξε σε παρακαλώ αυτά και ό,τι άλλο χρειαστώ θα επανέλθω. Υπενθυμίζω: Δώσε μου μόνο τα αρχεία που χρειάζονται διόρθωση. Επίσης, αφού τελειώσεις, θα ήθελα να μάθω πώς μπορούμε να χρησιμοποιήσουμε AI, για ποιο σκοπό και σε τι θα μας βοηθούσε.


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