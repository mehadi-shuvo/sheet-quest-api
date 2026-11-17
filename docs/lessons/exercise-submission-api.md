# Server-authoritative exercise submission API

M02-T03 exposes the private M02-T02 evaluator through the NestJS API. It is deliberately stateless: there is no authentication, database write, attempt history, progress update, or learner UI in this task.

## Lesson registry and visibility boundary

`LessonRegistryService` initializes from server-owned validated fixtures. It parses each private lesson definition during startup and rejects invalid or duplicate IDs before serving requests.

The browser can request only the existing public lesson projection. The private lesson definition, validation rules, expected values/functions, score configuration, and solution formulas remain in the API process. Submission requests contain only a versioned canonical workbook snapshot; client scores, client pass flags, rule results, and answer keys are rejected as unknown fields.

## Endpoints

All product endpoints use the API’s existing `/v1` prefix and work through the Next.js same-origin gateway as `/backend/*`.

### `GET /v1/lessons/:lessonId`

Returns `200` with the learner-safe projection in a response envelope:

```json
{
  "data": {
    "schemaVersion": 1,
    "id": "budget-total",
    "title": "Calculate a budget total",
    "description": "Use SUM to calculate the total of three monthly expenses.",
    "difficulty": "BEGINNER",
    "instructions": ["Review the monthly expenses in cells B2 through B4."],
    "hints": ["SUM can add a continuous range, such as =SUM(B2:B4)."],
    "starterWorkbook": { "schemaVersion": 1, "id": "budget-total-workbook", "name": "Budget total practice", "sheets": [] }
  }
}
```

`404` responses use `{ "error": { "code": "LESSON_NOT_FOUND", "message": "Lesson not found." } }`.

### `POST /v1/lessons/:lessonId/submissions`

Request body is strict and versioned:

```json
{
  "schemaVersion": 1,
  "workbook": {
    "schemaVersion": 1,
    "id": "budget-total-workbook",
    "name": "Budget total practice",
    "sheets": [
      {
        "id": "budget",
        "name": "Budget",
        "rowCount": 20,
        "columnCount": 6,
        "cells": {
          "C2": { "formula": "=SUM(B2:B4)" }
        }
      }
    ]
  }
}
```

Successful `201` responses envelope trusted evaluator output, not echo data:

```json
{
  "data": {
    "schemaVersion": 1,
    "status": "COMPLETED",
    "earnedScore": 100,
    "maxScore": 100,
    "passed": true,
    "ruleResults": [
      { "ruleIndex": 0, "status": "PASSED", "pointsAwarded": 40, "feedbackCode": "RULE_PASSED" }
    ]
  }
}
```

`400` responses use `{ "error": { "code": "INVALID_SUBMISSION", "message": "Submission workbook is invalid." } }`. The request rejects any unknown field, including `earnedScore`, `passed`, `evaluationRules`, and expected-answer fields. An evaluator internal failure is a generic `500` with code `EVALUATION_UNAVAILABLE`; it never contains stack traces or private lesson data.

For these lesson endpoints, the only successful top-level keys are `data` and optional `meta`; error responses use `error` and optional `meta`. Error details are omitted unless a future safe, documented contract requires them.

## Security and operational boundary

- The body parser enforces a 1 MB raw JSON request limit. The canonical schema independently enforces workbook size, sheet, row, column, cell, formula, and string limits.
- The API uses only the server registry’s private lesson and M02-T02’s independent calculation. Browser display values, cached values, scores, pass flags, and rule outcomes have no authority.
- Unsupported, malformed, circular, invalid-reference, or resource-limited formulas earn no points. Safe feedback codes are returned without answer keys.
- This task does not add a rate limiter. Before public exposure, configure a gateway or API rate-limit policy for `POST /v1/lessons/:lessonId/submissions` and use an idempotency key when persistence begins in M03.
- The existing `/health/live` and `/health/ready` endpoints remain outside `/v1` for infrastructure probing.
