# PBS atlas intake — 2026-11-12

This intake adds 19 images to `heme-pbs`: 18 unchanged Commons originals and
one already annotated BCCD example. It supplements the seven curated PBS images
already published in their hematology chapters. All new educational content is
`draft`; visual QA is not independent clinical approval.

## Search and selection

Approximately 26 targeted web searches and more than 35 original page reads
covered normal blood-film components, RBC shape and inclusions, leukocytes,
platelets, annotated images, and microscopy datasets. Discovery included
Commons, Patholines, ASH Image Bank, Pinterest, Hemostasis Today, BCCD, PBC
Barcelona, journal figures and educational references. Search hits alone were
not evidence of a reuse license or a reliable cell identity.

Twenty exact Commons originals were licensed, downloaded, decoded and visually
reviewed. Eighteen were admitted; two remain staged and excluded from generated
public content:

- `pbs-atlas-acanthocyte-field`: repeated/tiled cell clusters, unsuitable as a
  continuous larger blood-film field. The separate Ed Uthman acanthocyte image
  covers this morphology.
- `pbs-atlas-monocyte`: morphology overlaps a band neutrophil; the source's
  monocyte identification is insufficiently certain for this teaching atlas.

The original and cropped versions of the segmented-neutrophil photograph were
deduplicated before intake. The seven earlier allowlist entries were retained.
Exact source-file URLs, attribution, file-level license and dimensions are in
`content/_imports/pbs-open-license.json`; public images retain those credits.
The generated-image bytes equal the canonical originals: no AI microscopy,
upscaling, cropping or replacement labels were used.

## Educational additions and limits

The atlas includes normal/mixed cells, neutrophils, eosinophils, basophils,
lymphocytes and reactive lymphocytes; target, sickle, teardrop, elliptic and
acanthocytic RBCs; rouleaux; Howell–Jolly bodies; and basophilic stippling.
Each has a Persian identification guide and interpretation limits. Four lesson
sections and two tables separate visible objects from a disease diagnosis.

Two retained images have explicit limitations: the reactive-lymphocyte closeup
has limited focus and is only a secondary example; the stippling source's
embedded `1000 µm` scale is inconsistent with cell size and must not be used
for measurement. The scale remains unchanged and the warning is beside it.
Overview/detail Howell–Jolly images are distinct fields, not duplicate files.

The BCCD original example contains green RBC, red WBC and blue Platelets boxes
already embedded in its pixels. These annotations are imperfect, overlapping
in places, and are not verified counts, expert ground truth or a clinical
diagnosis. The repository explicitly declares the dataset MIT; the full
notice is retained in image metadata and `docs/licenses/bccd-MIT.txt`.
Original photographer and clinical acquisition metadata are unknown, and two
upstream source links were unavailable. Attribution does not invent a photographer.

BCCD source revision: `d272fb14cdff6e473fafeeeba32aba5f560e9e43`.
Example SHA-256: `e0de76342d827e997cc35533b973e5cf5f85070d4208fb555845b44abd4af99b`.

## Larger resources found, not imported

- [PBC Barcelona](https://data.mendeley.com/datasets/snkd93bnjr/1), DOI
  `10.17632/snkd93bnjr.1`: 17,092 blood-cell images, 360×363 JPEG, eight cell
  groups, dataset CC BY 4.0. Authors: Andrea Acevedo, Anna Merino, Santiago
  Alférez, Ángel Molina, Laura Boldú and José Rodellar. The approximately
  268 MB archive was not downloaded or counted as atlas content. Group labels
  do not establish per-object bounding boxes or clinical diagnoses.
- [BCCD](https://github.com/Shenggan/BCCD_Dataset): 364 images, 640×480,
  Pascal VOC RBC/WBC/Platelets boxes and an explicit dataset MIT declaration.
  Only its original annotated example was imported in this checkpoint.
- `Blood_smear_labelled.png` was rejected because the derived Michigan slide
  describes CC BY-NC-SA terms while the upload advertises CC BY-SA.
- `Selected_samples_of_peripheral_leukocytes.png` was deferred: source-paper
  license verification incomplete and small composite resolution.
- ASH images require written permission for public network republication;
  Pinterest is discovery rather than source/license evidence. Hemostasis
  Today did not establish reusable microscopy rights. No images from these
  sites were copied into this release.

## Pipeline behavior

The Commons-only importer retains exact-host, exact-path, license, dimensions,
image-decoding and batch-atomicity checks. Downloads now pace requests and
retry HTTP 429 at most three total attempts, respecting bounded Retry-After;
long retry windows abort rather than retry early. No access restriction was
bypassed. Fifteen regression tests cover the importer, including rate limits
and no partial publication. The two rejected files stay unapproved and do not
enter `docs/content/` or the library index.

Structural validation, reproducible generation, unchanged unrelated topic
hashes and browser checks are required before host publication. The quality
audit separately retains draft-review notices and original-file size/resolution
warnings; a successful schema/build does not mean those warnings are resolved.
