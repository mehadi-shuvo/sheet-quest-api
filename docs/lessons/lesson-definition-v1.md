# Lesson definition v1

`PrivateLessonDefinitionV1` is the API-owned content contract for one SheetQuest spreadsheet lesson. It is parsed with the strict Zod schema in `src/lessons/lesson-definition.schema.ts` before the content can be used. This is a content-validation contract, not an evaluator or submission API.

## Versioning and ownership

- `schemaVersion` is currently the literal `1`. Other versions are rejected.
- The API owns private lesson definitions and rule configuration. The web application must receive only the explicit public projection.
- `starterWorkbook` exactly follows the existing canonical workbook snapshot v1 boundary: ordered sheets, address-keyed primitive/formula cells, and number formats. It contains no Univer snapshots, calculated-value cache, or vendor-specific workbook type.
- A future incompatible shape must use a new schema version and an explicit API migration/reader. Existing published version-1 definitions remain immutable; do not reinterpret them in place.

## Private contract

Required private fields are `schemaVersion`, `id`, `title`, `description`, `difficulty`, `instructions`, `starterWorkbook`, `hints`, `scoring`, and `evaluationRules`.

`scoring.maxScore` is a positive integer and rule `points` must sum to it exactly. `passingScore` is an integer from zero through `maxScore`. This gives later evaluation deterministic score accounting without implementing evaluation in this task.

The discriminated rule union is private:

| Rule | Required configuration | Intended later evaluation semantics |
| --- | --- | --- |
| `CELL_VALUE` | unique rule ID, points, sheet/cell target, expected primitive value, optional numeric tolerance | Compare the calculated target value to the expected value; tolerance applies only to numbers. |
| `FUNCTION_USED` | unique rule ID, points, sheet/cell target, uppercase function name | Inspect the target formula for the required function. |
| `RANGE_VALUES` | unique rule ID, points, sheet/range target, exact matrix of expected primitive values | Compare every cell in the target range against its positional expected value. |

M02-T02 implements the documented rule semantics as a pure server-side evaluator; see [exercise-evaluator.md](exercise-evaluator.md). There is still no submission endpoint, database persistence, authentication, or UI in this milestone task.

## Validation limits

- Workbook v1: 32 sheets, 10,000 populated cells, 1,000 rows, 100 columns, 1 MB serialized data, 8,192 formula characters, and 32,768-character strings.
- Lesson: kebab-case IDs of 3–64 characters; title up to 160 characters; description up to 1,000 characters; 1–12 instructions; up to 5 hints; up to 20 rules; score values up to 1,000.
- Cell references use uppercase A1 notation. Ranges use ordered uppercase A1 notation such as `B2:B4`, must be inside their declared sheet, and `RANGE_VALUES` is limited to 100 cells with an exactly matching expected-value matrix.
- Every object is strict. Unknown properties, malformed references, unknown sheets, duplicate rule IDs, unsupported versions, invalid scoring, and invalid workbook content are rejected.

## Public projection

`toPublicLessonDefinition` returns only `schemaVersion`, learner-visible metadata, instructions, hints, and the starter workbook. It intentionally omits `evaluationRules`, expected values/functions, and `scoring`.

M02-T03 must keep that separation at the HTTP boundary: the client may submit a canonical workbook snapshot, but it must never send the authoritative lesson definition, rules, expected answers, or a trusted score.
