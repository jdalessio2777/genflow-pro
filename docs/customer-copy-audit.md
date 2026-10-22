# Customer copy audit (A6) + job on customer copy (B3)

Rule: customer-facing output never prints a "—"/"-" placeholder, "undefined",
"null", "NaN", "$NaN" or "Invalid Date". A row whose value is missing is hidden
(label and value). Money is never invented: a missing line price prints blank,
not "$0.00". Totals treat a missing component as 0 (same as
`invoiceTotalCents`, so the printed Total always equals the sum).

Guarded by `src/test/customerCopyAudit.test.js` (sparse + full fixtures for
every template and both PDFs).

## A6: fields that could print blank or a placeholder

| Output | Field | Before | After |
|---|---|---|---|
| Quote email | Service Type (`job.job_type`) | "—" when null (Quote Builder always passes `null`); "Quote" for legacy type; raw unknown values | Row shown only for a real service type (`SERVICE_TYPES`); hidden for empty / `quote` / unknown |
| Quote email | Quote # (`job.id`) | Empty value cell when no id | Row hidden |
| Quote email | Line Qty | "—" for every labor line (QuoteBuilder passes `qty: "—"`) | Blank cell (dash / "null" / "undefined" quantities print nothing) |
| Quote email | Line Amount | "$0.00" when amount missing, "$NaN" for non-numeric | Blank cell |
| Quote email | Greeting | "Hi ," when customer has no name; crash when `customer`/`job` null | "Hi there,"; null customer/job tolerated |
| Appointment confirmation | Date | "**—**" when no `scheduled_date`; "Invalid Date" for a bad value | Date line hidden; label becomes "Time on Site" |
| Appointment confirmation | Arrival time | "Arrival time: —" | Line hidden |
| Appointment confirmation | Service Type | "—" when null; "Quote" for legacy | Row shown only for a real service type; the generator line moves to its own "Generator" row (or is hidden when there is none) |
| Appointment confirmation | Technician | blank if `techFirstName` was whitespace | "our technician" |
| Appointment confirmation | Greeting | "Hi ," | "Hi there," |
| Completion email (legacy `completionEmailHTML`) | Service (`job.title`) | Empty value cell | Row hidden; label now "Job" |
| Completion email | Date | "Invalid Date" for a bad `completed_date` | Row hidden |
| Completion email | Part line | "Filter ×" when quantity null; "$0.00" when price missing | "Filter"; blank amount |
| Completion email | Labor line amount | "$0.00" when `total_price` null | Blank |
| Invoice (email summary + InvoiceDetail print + InvoicePDF send) | Invoice number (header) | Empty line | Line hidden |
| Invoice | Invoice date (header) | "—" when `created_date` missing | Line hidden |
| Invoice | Bill To name | Empty bold line when customer and `invoice.customer_name` both empty | Line hidden |
| Invoice (>$0) | Generator model | "—" when no customer / no model | Model line hidden; box titled "PAYMENT" when no generator on file (it still carries the paid/unpaid line) |
| Invoice ($0) | Generator model | "—" | Model line hidden; whole box hidden when no generator on file |
| Invoice ($0) | Rate of a "No charge" line | "—" | Blank |
| Invoice | Line Qty | Blank / raw value | Blank for null/dash; escaped value otherwise |
| Invoice | Line Rate | "$0.00" when `unit_price` null (legacy flat-rate rows), "$NaN" for junk | `total / quantity` when both known, else blank |
| Invoice | Line Amount | "$0.00" when `total` null | Blank |
| Invoice | Totals (Parts/Labor/Subtotal/Total) | "$NaN" for a non-numeric stored value | Treated as 0 (matches `invoiceTotalCents`) |
| Invoice | Paid line / paid box | "PAID — Invalid Date"; " · Cash" with leading separator | "PAID (Cash)"; separators only between present values |
| Invoice print view | `<title>` | "Invoice  — GenShield" when no number | "Invoice — GenShield" |
| InvoicePDF send | Subject | "Invoice null — GenShield" / "Invoice undefined — GenShield" when no number | "Invoice — GenShield" |
| Payment receipt | Invoice number | "Invoice " (empty) | Line hidden |
| Payment receipt | Payment method | "—" when no method | Row hidden |
| Payment receipt | Date | "Invalid Date" for bad `paid_date` | Row hidden |
| Job summary email subjects (`buildSubject`) | Invoice number | "Receipt — Invoice  — GenShield" / "Invoice  — GenShield" | "Receipt — GenShield" / "Invoice — GenShield" |
| Checklist summary (InvoicePDF email) | Title | Empty `<h2>` when `template_name` null | "Service Checklist" |
| Checklist summary | Section header | Empty dark bar; headers with no answered rows under them | Printed only when labelled and a row under it prints |
| Checklist summary | Answers | "NaN"/"null" strings, "a,b" arrays, "[object Object]", photo URLs | Hidden / "a, b" / hidden / "Photo on file" (same rules as the PDF) |
| Checklist PDF | Completed date (header + row) | "-" when no date | Hidden |
| Checklist PDF | Answers | `JSON.stringify` of objects; "null"/"NaN" strings | Row hidden |
| Checklist PDF | Section bar | Empty bar when label blank | Skipped |
| Checklist PDF | Info box | Empty grey box when every value missing | No box |
| Agreement PDF | Address / Generator / Serial No. | "-" | Row hidden |
| Agreement PDF | Start Date / Expires | "-" | Row hidden |
| Agreement PDF | Header "Signed …" | "Signed -" | Sublabel hidden |
| Agreement PDF | Signature lines | "Customer signature - " / "Signed electronically on -" | "Customer signature" / "Signed electronically" |
| Agreement PDF | Document title | "Maintenance Agreement -" | "Maintenance Agreement" |
| Membership welcome email (MembershipAgreement.jsx, now `membershipWelcomeEmailHTML`) | Greeting | "Hi ," | "Hi there," |
| Membership welcome email | Plan includes | Unescaped | Escaped; list hidden when empty |
| Renewal email | Greeting / plan / expiry | "Hi ,", " Maintenance Agreement", "Expires Invalid Date" | "Hi there,", "Your Maintenance Agreement", Expires line hidden |
| Service History print (CustomerDetail) | Service Summary cell | "—" when no summary | Blank cell (a table cell cannot be removed) |
| Service History print | First Service / Most Recent | "—" boxes when no completed jobs | Boxes hidden (only "Total Service Visits") |
| Service History print | Dates | "Invalid Date" for a bad date | Falls back to `created_date`, else blank |
| Service History print | Generator | "Not specified" | Model line hidden; box hidden when no generator data |
| Service History print | Customer name / `<title>` | Empty line, "Service History — " | Hidden, "Service History" |

## B3: job title + customer-facing description

Fields: `jobs.title` ("JOB") and `jobs.customer_description` ("DESCRIPTION OF
WORK"). `jobs.invoice_notes` stays the "SERVICE SUMMARY" block. Never shown:
`jobs.notes`, `generator_notes`, `quote_notes`, customer notes. Each row hidden
when empty; both hidden when there is no job (standalone invoice).

| Output | Where | Data source |
|---|---|---|
| Combined completion / resend email | Below Bill To / Generator, above line items | `api/send-job-summary.js` selects `jobs.*` → `buildJobSummaryEmail` now passes `job` to `jobSummaryEmailHTML` |
| Payment receipt email | Below the "Payment received" header | same (`kind: 'receipt'`) |
| Job email with no invoice | After the greeting (plus the Service Summary) | same |
| Invoice print (InvoiceDetail) | Same place as the email | `invoiceJob` (`db.Job.filter` = `select *`) passed as `job` |
| Invoice email (InvoicePDF "send") | Same place | `invoiceJob` passed as `job`; Send disabled while the job is loading |
| Service History print | "Job" column: title, then "DESCRIPTION OF WORK"; Service Summary column = `invoice_notes` only | `customerJobsQuery` (`select *`) |
| Checklist PDF | Info box rows "Job" + "Description of Work" | job row from send-job-summary |
| Legacy `completionEmailHTML` | "Job" + "Description of Work" rows | caller's job |

## Needs a change in files this task could not edit

- `src/pages/QuoteBuilder.jsx` line ~146: passes `qty: "—"` for labor lines and
  `job: { id, job_type: null }`. The template now prints both as blank / hides
  the Service Type row, so no customer-visible problem remains; the cleaner fix
  is `qty: ""` there and passing the chosen `job_type` (A5).
- `src/pages/DocumentFill.jsx` `window.print()` of a completed checklist prints
  the on-screen form and was not audited here.
