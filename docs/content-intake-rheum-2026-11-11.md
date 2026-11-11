# Rheumatology source intake — 2026-11-11

Six user-supplied Persian question banks are educational source inputs, not authenticated full textbook chapters. New educational material remains `draft` pending teacher approval. No full independent Harrison 2025 or current-guideline verification is claimed.

## Private sources

| Topic | Pages | Actual questions | SHA256 |
|---|---:|---:|---|
| SLE | 28 | 80 | `61a5fcfaf09bd521263efd7babe9381616c71a3b8975b8614552dd73d0a1e94d` |
| Vasculitis | 37 | 73 | `388f78b92f777658520873d5c1ae9bc91ca0596fbbdaa842556200e828f08464` |
| Spondyloarthritis | 21 | 44 | `e5d13548d93cc3302daaa106795aa31eb9f98fa35bb223673a7fec936dbf6f78` |
| Sarcoidosis | 20 | 46 | `f2ccb8aed04a13b67fcbf203fa6e44f4c1ae3fa1078e08c20436686333e11cab` |
| Systemic/other arthritides | 16 | 24 | `6e9b7f5ae95899436e91ff2454ea8961d4a8d533c012f9ce78d2c57ee9be60e3` |
| APS | 14 | 48 | `17388a84ef39f3626ee8a8797fd68800270050e3052aa6b0b067c4f4d7d06a1d` |

Total: 136 parser-counted pages and 315 actual questions. All pages have native text; no source PDF was sent to another provider for OCR. Restarted numbering is qualified by bank/section, never silently merged.

The parser extracted 155 unique image objects across the sources. Many vasculitis/SpA/systemic-arthritis objects are tiny decorative strips, not clinical figures. Meaningful figures are inspected privately and source-linked concepts can become authored text tables. Raw PDFs, figure binaries and extraction caches stay outside public publication; citation alone does not grant reuse rights.

## Content and coverage

Canonical packages: `rheum-sle`, `rheum-vasculitis`, `rheum-spa`, `rheum-sarcoidosis`, `rheum-systemic-arthritis`, `rheum-aps`. Sarcoidosis, systemic/other arthritis and APS receive explicit rheumatology taxonomy entries. Existing SLE content and stable IDs are preserved except documented safety corrections; existing figures are not relabelled or relicensed.

Each package records its source and per-question coverage. Coverage means a question was inspected and mapped to adapted content, consolidation, an existing concept or a review flag—not that every original question was copied into a scored quiz. New MCQs are adapted/authored drafts with one best answer and per-option explanations. Tested facts must also appear in the lesson and supported source evidence.

## Safety boundaries

- Classification criteria are not automatic individual diagnoses; isolated ANA/aPL/ANCA/ACE results are not definitive diagnoses.
- Source keys with question marks, conflicting negations/options or unsupported edition-change explanations remain flagged rather than taught as facts.
- Sarcoidosis: noncaseating granulomas/normal tumour markers do not alone exclude infection or malignancy; severe hypercalcaemia is not treated as a steroid-only shortcut; biopsy sites require clinical context.
- APS: acute thrombosis treatment must not wait for repeat aPL testing, but a single panel is not proof of persistent antibodies; pregnancy/postpartum and arterial/venous scenarios must remain distinct.
- SpA: axial versus peripheral disease, IBD/uveitis comorbidity and treatment classes must not be conflated.
- Vasculitis: infection mimics, organ-threatening disease, induction versus maintenance and GCA visual emergencies require context; conflicting plasma-exchange keys are not universal treatment rules.

## Integrated additions

| Topic | New sections / paragraphs | New cards | New MCQs | New KF cases | New tables |
|---|---:|---:|---:|---:|---:|
| SLE | 10 / 31 | 20 | 15 | 2 | 5 |
| Vasculitis | 14 / 31 | 40 | 20 | 3 | 5 |
| SpA | 10 / 21 | 30 | 15 | 2 | 4 |
| Sarcoidosis | 11 / 24 | 28 | 14 | 2 | 4 |
| Systemic/other arthritides | 12 / 33 | 28 | 14 | 2 | 4 |
| APS | 9 / 25 | 25 | 12 | 2 | 3 |

Total additions: 66 sections/165 paragraphs, 171 cards, 90 MCQs, 13 evolving KF cases and 25 searchable tables/algorithms. Counts are additions, not totals including prior SLE material. No new raw source image is published.

Coverage totals: 220 mapped/supported (56 SLE, 53 vasculitis, 26 SpA, 31 sarcoidosis, 18 systemic arthritis, 36 APS); 95 withheld/requiring review (24,20,18,15,6,12 respectively). Some withheld questions retain separately supported subclaims in the lesson, never the disputed original key as a scored fact.

Independent targeted review prompted provenance fixes for eight SpA printed-key pages, original 1-based APS audit keys, clinical rather than source-key-recall stems, and balanced new SLE answer positions with paired rationales. SLE legacy corrections retain stable IDs and are documented under `intakeReview.legacyCorrections`; the SLICC exception card is explicitly marked legacy-unverified where no supplied page was available. Original source keys are audit data, not approval or adapted assessment keys.

Automated schema/build checks and targeted independent review complement, not replace, teacher review. Strict quality audit can exit nonzero for pending clinical-review notices; four existing SLE image provenance/copyright warnings remain unresolved, not silently relicensed. No complete independent guideline or textbook verification is claimed.
