import { describe, expect, it } from 'vitest';
import { budgetTotalLessonFixture } from './fixtures/budget-total.lesson.fixture';
import { employeePerformanceLessonFixture } from './fixtures/employee-performance.lesson.fixture';
import { salesAnalysisLessonFixture } from './fixtures/sales-analysis.lesson.fixture';
import {
  LESSON_DEFINITION_LIMITS,
  parsePrivateLessonDefinition,
  privateLessonDefinitionSchema,
  toPublicLessonDefinition,
} from './lesson-definition.schema';

function fixtureCopy() {
  return structuredClone(budgetTotalLessonFixture);
}

function mutableRules(lesson: ReturnType<typeof fixtureCopy>) {
  return lesson.evaluationRules as unknown as Array<Record<string, unknown>>;
}

describe('private lesson definition schema v1', () => {
  it.each([budgetTotalLessonFixture, employeePerformanceLessonFixture, salesAnalysisLessonFixture])('accepts the published fixture %s.id', (fixture) => {
    expect(privateLessonDefinitionSchema.safeParse(fixture).success).toBe(true);
    expect(fixture.evaluationRules.reduce((total, rule) => total + rule.points, 0)).toBe(fixture.scoring.maxScore);
  });

  it('accepts the complete sample fixture and all three rule contracts', () => {
    const lesson = parsePrivateLessonDefinition(budgetTotalLessonFixture);
    expect(lesson.schemaVersion).toBe(1);
    expect(lesson.evaluationRules.map((rule) => rule.type)).toEqual(['FUNCTION_USED', 'CELL_VALUE', 'RANGE_VALUES']);
    expect(lesson.evaluationRules.reduce((total, rule) => total + rule.points, 0)).toBe(lesson.scoring.maxScore);
  });

  it('formats the employee average output as a readable decimal', () => {
    expect(employeePerformanceLessonFixture.starterWorkbook.sheets[0].cells.C2).toEqual({ numberFormat: '0.00' });
  });

  it.each([
    ['unsupported schema version', (lesson: ReturnType<typeof fixtureCopy>) => ({ ...lesson, schemaVersion: 2 })],
    ['missing required title', (lesson: ReturnType<typeof fixtureCopy>) => {
      const withoutTitle = { ...lesson } as Record<string, unknown>;
      delete withoutTitle.title;
      return withoutTitle;
    }],
    ['unknown private field', (lesson: ReturnType<typeof fixtureCopy>) => ({ ...lesson, hiddenAnswer: '850' })],
  ])('rejects %s', (_name, invalidLesson) => {
    expect(privateLessonDefinitionSchema.safeParse(invalidLesson(fixtureCopy())).success).toBe(false);
  });

  it('rejects malformed and out-of-bounds cell references', () => {
    const malformed = fixtureCopy();
    const malformedRules = mutableRules(malformed);
    malformedRules[0] = {
      ...malformedRules[0],
      target: { sheetId: 'budget', address: 'A0' },
    };
    expect(privateLessonDefinitionSchema.safeParse(malformed).success).toBe(false);

    const outOfBounds = fixtureCopy();
    const outOfBoundsRules = mutableRules(outOfBounds);
    outOfBoundsRules[0] = {
      ...outOfBoundsRules[0],
      target: { sheetId: 'budget', address: 'G1' },
    };
    expect(privateLessonDefinitionSchema.safeParse(outOfBounds).success).toBe(false);
  });

  it('rejects invalid range rules and score configurations', () => {
    const invalidRange = fixtureCopy();
    const invalidRangeRules = mutableRules(invalidRange);
    invalidRangeRules[2] = {
      ...invalidRangeRules[2],
      target: { sheetId: 'budget', range: 'B4:B2' },
    };
    expect(privateLessonDefinitionSchema.safeParse(invalidRange).success).toBe(false);

    const mismatchedRangeValues = fixtureCopy();
    const mismatchedRangeRules = mutableRules(mismatchedRangeValues);
    mismatchedRangeRules[2] = {
      ...mismatchedRangeRules[2],
      expectedValues: [[500, 250, 100]],
    };
    expect(privateLessonDefinitionSchema.safeParse(mismatchedRangeValues).success).toBe(false);

    const invalidScoring = fixtureCopy();
    invalidScoring.scoring = { maxScore: 100, passingScore: 101 };
    expect(privateLessonDefinitionSchema.safeParse(invalidScoring).success).toBe(false);

    const invalidFunction = fixtureCopy();
    const invalidFunctionRules = mutableRules(invalidFunction);
    invalidFunctionRules[0] = {
      ...invalidFunctionRules[0],
      functionName: 'sum',
    };
    expect(privateLessonDefinitionSchema.safeParse(invalidFunction).success).toBe(false);

    const unknownSheet = fixtureCopy();
    const unknownSheetRules = mutableRules(unknownSheet);
    unknownSheetRules[1] = {
      ...unknownSheetRules[1],
      target: { sheetId: 'missing-sheet', address: 'C2' },
    };
    expect(privateLessonDefinitionSchema.safeParse(unknownSheet).success).toBe(false);
  });

  it('rejects oversized learner content and rules that do not deterministically total max score', () => {
    const oversized = fixtureCopy();
    oversized.hints = Array.from({ length: LESSON_DEFINITION_LIMITS.maxHints + 1 }, () => 'Hint');
    expect(privateLessonDefinitionSchema.safeParse(oversized).success).toBe(false);

    const invalidPoints = fixtureCopy();
    const invalidPointsRules = mutableRules(invalidPoints);
    invalidPointsRules[0] = { ...invalidPointsRules[0], points: 39 };
    expect(privateLessonDefinitionSchema.safeParse(invalidPoints).success).toBe(false);
  });
});

describe('public lesson projection', () => {
  it('contains learner-visible data and never exposes rules or scoring', () => {
    const publicLesson = toPublicLessonDefinition(budgetTotalLessonFixture);
    expect(publicLesson).toEqual({
      schemaVersion: 1,
      id: 'budget-total',
      title: 'Calculate a budget total',
      description: 'Use SUM to calculate the total of three monthly expenses.',
      difficulty: 'BEGINNER',
      instructions: [
        'Review the monthly expenses in cells B2 through B4.',
        'In cell C2, use SUM to calculate the monthly total.',
      ],
      starterWorkbook: budgetTotalLessonFixture.starterWorkbook,
      hints: ['SUM can add a continuous range, such as =SUM(B2:B4).'],
    });
    expect(JSON.stringify(publicLesson)).not.toContain('evaluationRules');
    expect(JSON.stringify(publicLesson)).not.toContain('expectedValue');
    expect(JSON.stringify(publicLesson)).not.toContain('expectedValues');
    expect(JSON.stringify(publicLesson)).not.toContain('functionName');
    expect(JSON.stringify(publicLesson)).not.toContain('scoring');
    expect('evaluationRules' in publicLesson).toBe(false);
    expect('scoring' in publicLesson).toBe(false);
  });

  it('fails safely before projection when private content is invalid', () => {
    const invalidLesson = fixtureCopy();
    const invalidRules = mutableRules(invalidLesson);
    invalidRules[1] = {
      ...invalidRules[1],
      expectedValue: { not: 'a primitive' } as never,
    };
    expect(() => toPublicLessonDefinition(invalidLesson)).toThrow();
  });
});
