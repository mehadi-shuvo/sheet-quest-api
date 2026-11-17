# API error handling

`configureApplication` applies Nest's global `ValidationPipe` and `ApiExceptionFilter` to every API route. The lesson controller alone applies its response interceptor, so unrelated endpoints are not response-wrapped.

Each HTTP request receives a generated `X-Request-ID` response header. One completion log records the request ID, method, route, status code, and duration; it intentionally excludes request bodies and query parameters.

- Lesson `GET` and submission `POST` successes use `{ "data": ... }` (with optional `meta`). Explicit lesson `HttpException` payloads become `{ "error": { "code", "message" } }` while retaining their HTTP status.
- For lesson routes, Nest's default malformed-request envelope becomes `{ "error": { "code": "INVALID_REQUEST", "message": "Request body is invalid." } }`. Malformed and oversized JSON therefore reveal neither parser nor limit details.
- An unexpected lesson exception becomes `{ "error": { "code": "INTERNAL_ERROR", "message": "Internal server error" } }`; no exception message, stack trace, request body, or cause is exposed.
- Non-lesson endpoints preserve their existing explicit response contracts. Their default malformed-request and unexpected-error fallbacks remain safe, but are not migrated by this focused change.
- The filter does not log exceptions. Logging remains the responsibility of the Nest runtime/operational configuration so an error is not logged twice.

The focused HTTP test suite verifies lesson envelopes, malformed JSON safety, explicit lesson exceptions, and unexpected-error non-leakage.
