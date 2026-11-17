import { describe, expect, it } from 'vitest';
import { budgetTotalLessonFixture } from './fixtures/budget-total.lesson.fixture';
import { employeePerformanceLessonFixture } from './fixtures/employee-performance.lesson.fixture';
import { salesAnalysisLessonFixture } from './fixtures/sales-analysis.lesson.fixture';
import { LessonRegistryService } from './lesson-registry.service';

describe('LessonRegistryService', () => {
  it('rejects invalid private fixtures during registry initialization', () => {
    expect(() => LessonRegistryService.create([{ ...budgetTotalLessonFixture, schemaVersion: 2 }])).toThrow();
  });

  it('rejects duplicate stable lesson ids during registry initialization', () => {
    expect(() => LessonRegistryService.create([budgetTotalLessonFixture, budgetTotalLessonFixture])).toThrow(/Duplicate lesson fixture id/);
  });

  it('serves all three published fixture ids through private and public projections', () => {
    const registry = new LessonRegistryService();
    for (const fixture of [budgetTotalLessonFixture, employeePerformanceLessonFixture, salesAnalysisLessonFixture]) {
      expect(registry.getPrivate(fixture.id)?.id).toBe(fixture.id);
      expect(registry.getPublic(fixture.id)).toMatchObject({ id: fixture.id, schemaVersion: 1 });
    }
  });
});
