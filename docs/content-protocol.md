# IntMed content protocol

This is the active, reusable protocol for creating or revising a topic. It intentionally
contains rules, not session history.

## Language and teaching rules

- In Persian medical prose use «کبد», never «جگر» for the liver. Proper names such as
  Peutz–Jeghers are exempt.
- Keep paired flashcards consistently front → back and verify that the answer is not placed
  on the front.
- Persian sentences containing English terms must remain grammatically complete Persian.
- For English sources, write dense board-relevant teaching prose rather than a near-verbatim
  translation. Every tested fact must still be traceable to the lesson.
- Keep drug names, abbreviations, eponyms, and technical terms in English when an invented
  Persian translation would be unnatural.
- Medical accuracy, question quality, and image interpretation require human review even
  when automated validation passes.

## Source and figure handling

- Record source references beside the smallest practical content unit with `sourceRefs`.
  A reference should include `sourceId` and, when known, `page` or `pages`.
- Inspect figures embedded inside PDF/PPTX files as well as separately attached images.
- Convert algorithms and information diagrams to prose or markdown tables when that keeps
  all information. Retain clinical photographs, raw tracings, plots, and curves as images.
- Extract original PDF images with PyMuPDF; do not screenshot whole pages when the embedded
  image can be extracted directly.
- Compress photographs as JPEG and flat-color line art as palette PNG. Verify the result
  visually and keep an explicit source/copyright note.
- Canonical source JSON may contain a data URI during authoring. The build externalizes it
  into `docs/content/images/`; published per-topic JSON must not contain base64 image data.

## Per-topic workflow

1. Cache source extraction:
   `python3 scripts/content_pipeline.py extract-pdf TOPIC_ID SOURCE.pdf`
2. Create a new topic when needed:
   `python3 scripts/content_pipeline.py init-topic CATEGORY TOPIC_ID --label "عنوان"`
3. Edit only `content/<category>/<topic-id>/data.json` and relevant source assets.
4. Add stable `id` values and `sourceRefs` to lesson sections/paragraphs, tables, images,
   flashcards, MCQs, and KF/PMP cases. The migration command can fill missing stable IDs but
   cannot invent page references.
5. Validate:
   `python3 scripts/content_pipeline.py validate`
6. Review flashcard direction, Persian grammar around English terms, medical accuracy,
   answer keys, and retained figures manually.
7. Build generated site data:
   `python3 scripts/content_pipeline.py build`
8. Verify generated output is current:
   `python3 scripts/content_pipeline.py check`
9. Serve `docs/` locally and smoke-test the changed topic before publishing.

Taxonomy changes belong only in `content/taxonomy.json`. Never add a second hardcoded topic
list to HTML. Generated files under `docs/content/` are replaced by the build.
