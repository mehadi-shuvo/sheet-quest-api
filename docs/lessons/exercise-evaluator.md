# Pure server-side exercise evaluator

M02-T02 adds a deterministic in-process evaluator for the private lesson-definition v1 contract. It has no NestJS controller, database access, authentication, network call, Univer dependency, or browser-calculated input.

`evaluateExercise(privateLesson, submittedWorkbook)` accepts a trusted private definition and an untrusted canonical workbook snapshot. The submitted snapshot is parsed through the strict canonical-workbook-v1 Zod schema before evaluation. Submitted scores, display strings, cached values, rule outcomes, and unknown fields are ignored or rejected.

## Supported grammar and semantics

The evaluator intentionally covers only the M01 formula subset.

| Feature | Server semantics |
| --- | --- |
| Literals | Finite numeric literals, double-quoted strings (with Excel `""` quote escaping), `TRUE`, and `FALSE`. |
| References | Same-sheet uppercase A1 references, including `$A$1`, `$A1`, and `A$1`; dollar markers affect copying in a spreadsheet but not evaluation of submitted formula text. |
| Ranges | Ordered same-sheet A1 ranges such as `B2:B4`. |
| Operators | Unary `+`/`-`; `+`, `-`, `*`, `/`, `^`; comparisons `=`, `<>`, `<`, `<=`, `>`, `>=`; parentheses. |
| Functions | `SUM`, `AVERAGE`, `IF`, and `SUMIF`. Function names are parsed case-insensitively then normalized to uppercase. |
| `SUM` | Adds numeric values; blanks (`null` or unstored cells) count as zero. |
| `AVERAGE` | Averages numeric values and ignores blanks; no numeric values produces a divide-by-zero failure. |
| `IF` | Requires a Boolean comparison result and lazily evaluates only the selected branch. |
| `SUMIF` | Supports two or three arguments. Criteria supports exact primitive equality plus numeric comparison strings such as `">=40"`. |

The evaluator resolves dependency chains with memoization. Formula results are raw primitives only; number formats and display text are intentionally irrelevant to scoring.

Cross-sheet references, external links, named ranges, structured references, dynamic arrays, dates, macros, styles, locale-specific parsing, XLSX, and every function outside the table are unsupported. Unsupported or malformed formulas receive no points; they are never executed as JavaScript.

## Rule behavior and scoring

| Rule | Evaluation |
| --- | --- |
| `CELL_VALUE` | Independently calculates the target and compares the primitive result. Numeric tolerance is inclusive and receives a tiny scale-aware floating-point allowance. A hardcoded correct result can pass this outcome rule. |
| `FUNCTION_USED` | Parses the target cell’s own formula AST and searches that expression, including nested calls. Function text inside a string literal or elsewhere in the workbook does not pass. A hardcoded value always fails. The target must also calculate successfully. |
| `RANGE_VALUES` | Calculates each submitted target-range cell in row-major order and compares each computed primitive result to the private expected matrix. |

Rules are evaluated independently where possible. Passing rules receive their configured points; failed rules receive zero. `earnedScore` is the sum of awarded points, and `passed` is `earnedScore >= passingScore`.

Public evaluation output contains the aggregate score and safe per-rule index/status/feedback code only. It never returns private rule definitions, expected values, expected functions, solution formulas, or workbook values.

## Errors, safety, and resource limits

Learner-caused calculation failures map to safe feedback codes: invalid/unsupported formula, invalid reference, circular reference, or calculation limit reached. Invalid snapshots return `INVALID_SUBMISSION`. An unexpected trusted-definition or internal failure returns `EVALUATOR_FAILURE`; neither result earns points.

The evaluator has no `eval`, `Function`, dynamic imports, or network access. It enforces:

- Existing canonical snapshot limits: 1 MB, 32 sheets, 10,000 populated cells, 1,000 rows, 100 columns, and 8,192 source-formula characters.
- Tighter runtime limits: 1,024 formula characters, 512 tokens, 256 AST nodes, dependency depth 64, 2,000 evaluated cells, and 1,000 cells per formula range.
- Rule-schema limits: at most 20 rules and 100 cells per `RANGE_VALUES` rule.

Circular, missing-sheet, out-of-bounds, malformed, oversized, and unsupported inputs fail safely and deterministically. M02-T03 must invoke this evaluator only with a server-loaded private lesson definition; it must never accept client-provided rules or scores.
