# Persistent study workspace

The existing `study_state.itemState` remains the private source of truth; this change adds
no account tables and never clears notes, highlights, favorites or old `quiz:*` telemetry.
`intmed-exams.js` owns practice attempts and reports; the educational renderer supplies
stable question IDs and the current payload only when a topic is opened.

- `exam-definition:<UUID>`: one immutable question/option snapshot per topic/type/content version.
- `exam-attempt:<UUID>`: topic, type, causal round, start time and a shared definition ID.
  Repeated attempts do not duplicate full question text or options.
- `exam-answer:<attempt>:<question>`: locked first MCQ choice or submitted KF text, timestamp,
  and automatic versus self-assessed grading mode. MCQ correctness comes from the snapshot.
- `exam-draft:<attempt>:<question>`: saved KF draft before submission.
- `exam-grade:<attempt>:<question>`: first self-assessment (0, 0.5, 1) after KF submission.
- `exam-close:<attempt>`: closes a round on restart. Old keys are retained; a new UUID is used.
- `study-goal`: personal daily active-study minutes target; `plan:<UUID>`: dated topic/time
  tasks with done/deleted flags. Nothing is scheduled or sent to external calendar services.

CAS merging keeps independently written questions/attempts from other devices, the earlier
first response/self-grade, and newer drafts. Attempt ordering uses a causal round before
client time. Two simultaneous resets may create sibling attempts; both remain in history
and ordering consistently selects one current round. No official-test integrity or tamper
resistance is claimed: these are private practice records, and KF is explicitly self-scored.

MCQ choices and KF submissions are restored after navigation/reload. If the content of a
current MCQ changes, the old result is retained and the user is asked to start a new round.
Question snapshots keep old selected/correct options readable in history. Completion and
accuracy have separate bars; ungraded KF responses are excluded from accuracy. A numeric
improvement comparison is shown only for complete consecutive rounds with matching frozen question definitions.
Old quiz telemetry lacks selected choices/attempts and is retained without inventing history.

`intmed-motion.js` enhances native disclosures and existing class-based menus with short
height/opacity transitions and respects reduced-motion preferences. The note/highlight
folds start closed; matching nonempty searches reveal relevant sections. Search is a
centered glass surface. Tag selection remains multi-select in a compact topic-header menu.

Validation: `exams_unit_test.mjs`, expanded `backend_state_test.mjs`, and
`study_workspace_browser_test.mjs` cover first choices, current versus historical scores,
KF drafts/submission/self-grading, restart cancellation, two-device saves, user isolation,
planner persistence, collapsible notes, centered glass search and restrictive script CSP.

Critical responses/self-grades/restarts request an immediate flush. Pending writes show
Saving rather than Online; Online appears only after the pending batch completes. The
browser warns on leaving with unsaved changes where beforeunload is supported; logout
waits for pending notes/writes, with an explicit loss warning if synchronization times out.
This is not an offline cache guarantee: users should wait for Online before leaving.
