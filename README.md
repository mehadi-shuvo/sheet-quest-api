# SheetQuest API

The API is a separate repository. The canonical project roadmap, task board, and execution log live in the private deployment repository at `deploy/README.md` in the combined local checkout.

Before starting work, read that master roadmap in full. Record all task status and execution evidence there; do not create a competing roadmap in this repository.

## Lesson-definition contract

M02-T01 defines the API-owned private lesson JSON schema and its learner-safe public projection in [docs/lessons/lesson-definition-v1.md](docs/lessons/lesson-definition-v1.md). Run `npm test` to validate the contract and sample fixture.

M02-T02 adds the pure server-side evaluator documented in [docs/lessons/exercise-evaluator.md](docs/lessons/exercise-evaluator.md). It has no HTTP, Prisma, or browser dependency.

M02-T03 exposes the learner-safe lesson and server-authoritative submission endpoints documented in [docs/lessons/exercise-submission-api.md](docs/lessons/exercise-submission-api.md). It remains stateless and does not add authentication or persistence.

The three M02 practice lessons and their bounded learning workflows are documented in [docs/lessons/m02-exercise-catalog.md](docs/lessons/m02-exercise-catalog.md).

The application-wide Nest validation and safe error-response boundary are documented in [docs/error-handling.md](docs/error-handling.md).
