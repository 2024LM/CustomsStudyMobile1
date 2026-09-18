# Study Database V3 — Multiple Question Banks

## Architecture
The application owns one protected internal SQLite database. Imported files are data sources only; they never replace or execute as the app database.

### question_banks
Each bank has a stable ID, display name, version, format version, built-in/imported flag, enabled state, import timestamp, and source name.

### questions
Questions belong to a bank through bank_id. external_id only needs to be unique inside that bank. QCM stores one correct answer and three distractors.

### User data
attempts and question_state reference the internal question row_id, so statistics, mistakes and favorites remain separate from the imported file.

### Selection
app_settings.active_bank_id stores the bank selected by the user. Sessions can also reference multiple banks through session_banks for future mixed review.

## Excel import contract
Excel is an interchange format, not the live database. Expected columns:
ID | السؤال | الجواب الصحيح | خيار مضلل 1 | خيار مضلل 2 | خيار مضلل 3 | الشرح | المحور | التاريخ/السنة

Import pipeline:
1. Read into staging memory.
2. Validate required headers, row limits and text lengths.
3. Reject duplicate IDs/options and missing correct answers.
4. Validate four distinct QCM choices.
5. Show preview/errors.
6. Import in one SQLite transaction.
7. Only then allow the bank to become active.

Never execute SQL, formulas, macros, or external links from an imported workbook. Formula cells are treated as unsupported input rather than executed.

## Built-in bank
customs_ma_2026 is the protected built-in bank. The current questions.json is imported into it. Imported banks receive separate IDs and cannot overwrite it.
