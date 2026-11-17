# M02 exercise catalog

The three M02 fixtures are server-owned private lesson definitions. Learners receive only their public projections from `GET /v1/lessons/:lessonId`; rules, expected values, scoring, and answer formulas remain in the API process.

| Lesson ID / route | Learning objective | Learner workflow | Server checks |
| --- | --- | --- | --- |
| `budget-total` / `/practice/lessons/budget-total` | Use `SUM` for a monthly total. | Sum three expense values in `C2`. | Requires `SUM`, total 850, and unchanged inputs. |
| `employee-performance` / `/practice/lessons/employee-performance` | Use `AVERAGE` and `IF` to summarize a scorecard. | Calculate the average in `C2`, then produce the threshold status in `D2`. | Separately requires `AVERAGE`, average `250/3` within tolerance, `IF`, and `On target`. A hardcoded average cannot pass because the required-function points keep it below the 80-point passing threshold. |
| `sales-analysis` / `/practice/lessons/sales-analysis` | Use `SUMIF` to total a category. | Total North-region sales in `C2`. | Requires `SUMIF`, total 270, and unchanged inputs. A hardcoded 270 cannot pass the 70-point threshold. |

All three routes use the existing dynamic lesson player, canonical workbook v1, and lesson-scoped browser-local draft key. The player validates a saved draft before restoration, preserves edits on retry, and confirmed reset removes the matching local draft before restoring the public starter workbook.

This catalog does not claim account-level progress, cross-device synchronization, cross-tab conflict resolution, or broad spreadsheet-function support.
