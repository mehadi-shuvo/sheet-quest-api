import { z } from 'zod';
import { canonicalWorkbookV1Schema } from './lesson-definition.schema';

export const EXERCISE_SUBMISSION_SCHEMA_VERSION = 1 as const;

export const exerciseSubmissionSchema = z
  .object({
    schemaVersion: z.literal(EXERCISE_SUBMISSION_SCHEMA_VERSION),
    workbook: canonicalWorkbookV1Schema,
  })
  .strict();

export type ExerciseSubmission = z.infer<typeof exerciseSubmissionSchema>;
