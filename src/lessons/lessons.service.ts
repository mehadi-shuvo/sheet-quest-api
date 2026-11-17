import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { evaluateExercise, type RuleEvaluationResult } from './evaluation/exercise-evaluator';
import type { PublicLessonDefinition } from './lesson-definition.schema';
import { LessonRegistryService } from './lesson-registry.service';
import { exerciseSubmissionSchema } from './submission.schema';

export type ExerciseSubmissionResponse = {
  earnedScore: number;
  maxScore: number;
  passed: boolean;
  ruleResults: RuleEvaluationResult[];
  schemaVersion: 1;
  status: 'COMPLETED';
};

@Injectable()
export class LessonsService {
  constructor(private readonly registry: LessonRegistryService) {}

  getLesson(lessonId: string): PublicLessonDefinition {
    const lesson = this.registry.getPublic(lessonId);
    if (!lesson) throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Lesson not found.' });
    return lesson;
  }

  submitLesson(lessonId: string, payload: unknown): ExerciseSubmissionResponse {
    const lesson = this.registry.getPrivate(lessonId);
    if (!lesson) throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Lesson not found.' });

    const submission = exerciseSubmissionSchema.safeParse(payload);
    if (!submission.success) {
      throw new BadRequestException({ code: 'INVALID_SUBMISSION', message: 'Submission workbook is invalid.' });
    }

    const result = evaluateExercise(lesson, submission.data.workbook);
    if (result.status === 'INVALID_SUBMISSION') {
      throw new BadRequestException({ code: 'INVALID_SUBMISSION', message: 'Submission workbook is invalid.' });
    }
    if (result.status === 'EVALUATOR_FAILURE') {
      throw new InternalServerErrorException({ code: 'EVALUATION_UNAVAILABLE', message: 'Exercise evaluation is unavailable.' });
    }
    return {
      earnedScore: result.earnedScore,
      maxScore: result.maxScore,
      passed: result.passed,
      ruleResults: result.ruleResults,
      schemaVersion: 1,
      status: 'COMPLETED',
    };
  }
}
