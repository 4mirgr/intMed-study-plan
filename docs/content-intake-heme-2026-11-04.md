# Hematology PDF intake — 2026-11-04

This is the compact handoff for the nine user-supplied PDFs. Do not reread all files for routine
edits: use the canonical topic, its `sources`/`sourceCoverage`, and only the relevant cached page.
Original PDFs, extracted text, full-page scans and embedded book figures are not public assets.

## Source inventory and destinations

| File | PDF pages | Source questions | Topic | SHA-256 prefix |
| --- | ---: | ---: | --- | --- |
| لوسمی میلوئیدی مزمن (CML)-1 | 11 | 33 | `heme-cml` | `e1a20a57c1bcbc3d` |
| لوسمی لنفوسیتیک مزمن (CLL)-1 | 8 | 19 | `heme-cll` | `eac81243763ce343` |
| AML | 5 | 22 | `heme-aml` | `6c4e36fcf374497f` |
| آنمی آپلاستیک و MDS | 5 | 18 | `heme-mds` | `5e4acb2ab2fb1c35` |
| آنمی و پلی‌سیتمی 2025 | 7 | 16 | `heme-iron-anemia` | `d8b03d16a8443aeb` |
| لنفوم | 7 | 35 | `heme-lymphoma` | `9ed3b982819cfbce` |
| ALL | 1 | 5 | `heme-aml` | `4686f49320137b57` |
| عفونت در بیماران مبتلا به کنسر-1 | 12 | 36 | `heme-cancer-infection` | `d0b8d64dc8140ae8` |
| PV, PMF, ET | 6 | 29 | `heme-mpn` | `5be50acea1f45ac7` |

62 physical pages were examined: 38 have native text; 24 are scanned pages, including blank
page 4 of the aplastic/MDS PDF. These are predominantly historical question banks, not complete
textbook chapters. A filename containing 2025 does not independently verify a textbook edition.
Full hashes, exact source titles and page references remain in each topic's source metadata.
Private extraction location: `.cache/source-extract/<topic>/<hash-prefix>/`.

## Integration result

Eight topics contain 83 lesson sections, 164 flashcards, 204 MCQs, 17 KF/PMP cases and 18 figures
after integration, including preserved legacy material. Net additions are 50 sections, 71 cards,
125 MCQs, 10 KF/PMP cases and eight original SVG teaching algorithms. Existing stable IDs and
previously published figures were preserved. New algorithms appear in the topic and generated
library; their concepts also have a textual teaching equivalent.

AML and ALL remain separate headings in the combined acute-leukemia topic. Aplastic anemia and
MDS remain separately explained within the renamed marrow-failure topic. PV/ET/PMF have their own
MPN topic rather than being misplaced under CML. General erythrocytosis evaluation is covered in
the anemia topic and distinguished from PV-specific management.

## Source-key handling and remaining teacher review

All 213 source question numbers were examined; this does **not** mean 213 unchanged questions
were published. Duplicates were merged, unsafe keys rewritten, and unanswerable raw questions
explicitly excluded. See `sourceCoverage` for the per-question decisions:

- CML/CLL: repair corrupted stems and multiple-answer choices; distinguish historical phase
  definitions from modern guidance, avoid unsafe first-trimester hydroxyurea advice, and never
  treat PET SUV below 5 as a definitive exclusion of Richter transformation.
- AML: raw questions 12, 16 and 19 are excluded from scored assessments because management or
  classification context is insufficient. Their concepts and limitations remain explained.
  All five ALL questions are adapted. A CNS-active TKI is not a replacement for CNS prophylaxis.
- Aplastic/MDS: all 18 are adapted. Questions 7, 13 and 15 explicitly clarify immune status,
  transplant eligibility and hematologic response versus an unproven survival claim.
- General anemia: 13 of 16 source numbers are adapted/merged; raw 5, 6 and 12 are excluded with
  reasons. Hb alone does not dictate IV iron or transfusion, and marrow evaluation is not dismissed
  categorically in PV workup. The older iron-mcq-3 IV-iron key is retained with individualized caveats.
- Lymphoma: all 35 are adapted. Question 5's CNS-risk wording, contradictory viral keys 19/31,
  and question 33's HCL phenotype are explicitly corrected. Established CNS disease requires
  treatment, not merely prophylaxis; the rewritten risk question uses CSF-negative Burkitt.
- Cancer infection: 25 of 36 source numbers are adapted/merged; the other 11 are documented as
  excluded raw/concept-only items. Correct negative blood cultures, vaccine response under B-cell
  suppression, reverse-halo morphology, skin pathergy and antifungal-prophylaxis context.
- MPN: all 29 are adapted. Do not preserve an unsafe universal Hb=12 phlebotomy target; the
  separately cited CYTO-PV evidence supports Hct below 45% specifically for PV. Do not extrapolate
  PV phlebotomy to every secondary erythrocytosis or give blanket perioperative antifibrinolytics.

Supplementary evidence checked separately: CYTO-PV PMID 23216616, ELN CML 2025 PMID 40646132,
PET/Richter meta-analysis PMID 39933018, and ELN AML 2022 PMID 35797463. Do not attribute statements
from these papers to the uploaded PDFs or infer detailed recommendations from an abstract alone.

Cross-topic independent AI review was performed, and actionable findings were corrected. This is
not teacher approval: newly authored or scientifically modified assessments/algorithms remain
`draft`, with visible source/review caveats. Human review of clinical accuracy, historical regimen
applicability and individualized treatment decisions remains required. Legacy audit warnings in
unchanged material are not erased or represented as having received a new approval.

## Reusable checks

Run `content_pipeline.py migrate`, `validate`, `build`, then `check`. Browser checks must derive
expected navigation counts from taxonomy, not a hardcoded 144-topic total. The hematology browser
regression exercises MPN discovery, lesson, original algorithm and its adapted question bank.
Never upload `.cache/` or restore old generated content over newer production topics.
