import { Injectable } from '@nestjs/common';
import { budgetTotalLessonFixture } from './fixtures/budget-total.lesson.fixture';
import { employeePerformanceLessonFixture } from './fixtures/employee-performance.lesson.fixture';
import { salesAnalysisLessonFixture } from './fixtures/sales-analysis.lesson.fixture';
import {
  parsePrivateLessonDefinition,
  toPublicLessonDefinition,
  type PrivateLessonDefinition,
  type PublicLessonDefinition,
} from './lesson-definition.schema';

const LESSON_FIXTURES: readonly unknown[] = [budgetTotalLessonFixture, employeePerformanceLessonFixture, salesAnalysisLessonFixture];

@Injectable()
export class LessonRegistryService {
  private readonly lessons: ReadonlyMap<string, PrivateLessonDefinition>;

  constructor() {
    this.lessons = LessonRegistryService.create(LESSON_FIXTURES);
  }

  static create(definitions: readonly unknown[]): ReadonlyMap<string, PrivateLessonDefinition> {
    const lessons = new Map<string, PrivateLessonDefinition>();
    for (const definition of definitions) {
      const lesson = parsePrivateLessonDefinition(definition);
      if (lessons.has(lesson.id)) throw new Error(`Duplicate lesson fixture id: ${lesson.id}`);
      lessons.set(lesson.id, lesson);
    }
    return lessons;
  }

  getPrivate(lessonId: string): PrivateLessonDefinition | undefined {
    return this.lessons.get(lessonId);
  }

  getPublic(lessonId: string): PublicLessonDefinition | undefined {
    const lesson = this.getPrivate(lessonId);
    return lesson ? toPublicLessonDefinition(lesson) : undefined;
  }
}
