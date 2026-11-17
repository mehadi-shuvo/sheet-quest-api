import { describe, expect, it } from 'vitest';
import { budgetTotalLessonFixture } from '../fixtures/budget-total.lesson.fixture';
import { employeePerformanceLessonFixture } from '../fixtures/employee-performance.lesson.fixture';
import { salesAnalysisLessonFixture } from '../fixtures/sales-analysis.lesson.fixture';
import { canonicalWorkbookV1Schema, parsePrivateLessonDefinition, type PrivateLessonDefinition } from '../lesson-definition.schema';
import { evaluateExercise, type ExerciseEvaluationResult } from './exercise-evaluator';
import { FormulaEngine } from './formula-engine';

type CellInput = { formula?: string; value?: boolean | null | number | string };

function submittedBudgetWorkbook(cells: Record<string, CellInput> = {}) {
  const workbook = structuredClone(budgetTotalLessonFixture.starterWorkbook);
  Object.assign(workbook.sheets[0].cells, cells);
  return workbook;
}

function submittedWorkbook(lesson: PrivateLessonDefinition, cells: Record<string, CellInput> = {}) {
  const workbook = structuredClone(lesson.starterWorkbook);
  Object.assign(workbook.sheets[0].cells, cells);
  return workbook;
}

function completed(result: ExerciseEvaluationResult) {
  expect(result.status).toBe('COMPLETED');
  if (result.status !== 'COMPLETED') throw new Error('Expected a completed exercise evaluation.');
  return result;
}

function lessonWith(mutator: (lesson: Record<string, unknown>) => void): PrivateLessonDefinition {
  const lesson = structuredClone(budgetTotalLessonFixture) as unknown as Record<string, unknown>;
  mutator(lesson);
  return parsePrivateLessonDefinition(lesson);
}

function calculation(workbook: unknown, address: string) {
  const parsed = canonicalWorkbookV1Schema.parse(workbook);
  return new FormulaEngine(parsed).calculateCell(parsed.sheets[0].id, address);
}

describe('pure exercise evaluator', () => {
  it('evaluates employee performance with independent AVERAGE and IF requirements', () => {
    const correct = completed(evaluateExercise(employeePerformanceLessonFixture, submittedWorkbook(employeePerformanceLessonFixture, {
      C2: { formula: '=AVERAGE(B2:B4)' }, D2: { formula: '=IF(C2>=80,"On target","Needs support")' },
    })));
    expect(correct).toMatchObject({ earnedScore: 100, passed: true });

    const hardcoded = completed(evaluateExercise(employeePerformanceLessonFixture, submittedWorkbook(employeePerformanceLessonFixture, {
      C2: { value: 250 / 3 }, D2: { formula: '=IF(C2>=80,"On target","Needs support")' },
    })));
    expect(hardcoded).toMatchObject({ earnedScore: 70, passed: false });
    expect(hardcoded.ruleResults[0]).toMatchObject({ feedbackCode: 'INCORRECT', status: 'FAILED' });

    const alternate = completed(evaluateExercise(employeePerformanceLessonFixture, submittedWorkbook(employeePerformanceLessonFixture, {
      C2: { formula: '=AVERAGE(B2:B4)+0' }, D2: { formula: '=IF(C2>=80,"On target","Needs support")' },
    })));
    expect(alternate).toMatchObject({ earnedScore: 100, passed: true });
  });

  it('evaluates sales analysis with a required SUMIF and independent partial credit', () => {
    const correct = completed(evaluateExercise(salesAnalysisLessonFixture, submittedWorkbook(salesAnalysisLessonFixture, {
      C2: { formula: '=SUMIF(A2:A4,"North",B2:B4)' },
    })));
    expect(correct).toMatchObject({ earnedScore: 100, passed: true });

    const hardcoded = completed(evaluateExercise(salesAnalysisLessonFixture, submittedWorkbook(salesAnalysisLessonFixture, { C2: { value: 270 } })));
    expect(hardcoded).toMatchObject({ earnedScore: 55, passed: false });

    const alternate = completed(evaluateExercise(salesAnalysisLessonFixture, submittedWorkbook(salesAnalysisLessonFixture, {
      C2: { formula: '=SUMIF(A2:A4,"North",B2:B4)+0' },
    })));
    expect(alternate).toMatchObject({ earnedScore: 100, passed: true });

    const unsupported = completed(evaluateExercise(salesAnalysisLessonFixture, submittedWorkbook(salesAnalysisLessonFixture, {
      C2: { formula: '=UNKNOWN_FUNCTION(1)' },
    })));
    expect(unsupported).toMatchObject({ earnedScore: 20, passed: false });
  });
  it('independently calculates a correct submission and awards all rule points', () => {
    const result = completed(evaluateExercise(budgetTotalLessonFixture, submittedBudgetWorkbook({ C2: { formula: '=SUM(B2:B4)' } })));
    expect(result).toMatchObject({ earnedScore: 100, maxScore: 100, passed: true });
    expect(result.ruleResults.map((rule) => rule.status)).toEqual(['PASSED', 'PASSED', 'PASSED']);
  });

  it('awards partial credit for an incorrect cell result while preserving independent range evaluation', () => {
    const result = completed(evaluateExercise(budgetTotalLessonFixture, submittedBudgetWorkbook({ C2: { formula: '=SUM(B2:B3)' } })));
    expect(result).toMatchObject({ earnedScore: 60, passed: false });
    expect(result.ruleResults.map((rule) => rule.feedbackCode)).toEqual(['RULE_PASSED', 'INCORRECT', 'RULE_PASSED']);
  });

  it('allows a hardcoded value for a value-only rule but rejects it for FUNCTION_USED', () => {
    const result = completed(evaluateExercise(budgetTotalLessonFixture, submittedBudgetWorkbook({ C2: { value: 850 } })));
    expect(result).toMatchObject({ earnedScore: 60, passed: false });
    expect(result.ruleResults.map((rule) => rule.status)).toEqual(['FAILED', 'PASSED', 'PASSED']);
  });

  it('accepts an alternate valid formula and finds nested functions in the target AST', () => {
    const alternate = completed(
      evaluateExercise(budgetTotalLessonFixture, submittedBudgetWorkbook({ C2: { formula: '=SUM(B2:B3)+B4' } }))
    );
    expect(alternate.earnedScore).toBe(100);

    const nested = completed(
      evaluateExercise(
        budgetTotalLessonFixture,
        submittedBudgetWorkbook({ C2: { formula: '=IF(SUM(B2:B4)>0,SUM(B2:B4),0)' } })
      )
    );
    expect(nested.earnedScore).toBe(100);
  });

  it('does not treat a function name inside a string literal as FUNCTION_USED', () => {
    const result = completed(evaluateExercise(budgetTotalLessonFixture, submittedBudgetWorkbook({ C2: { formula: '="SUM"' } })));
    expect(result.ruleResults[0]).toMatchObject({ feedbackCode: 'INCORRECT', pointsAwarded: 0, status: 'FAILED' });
  });

  it('applies numeric tolerance inclusively and rejects values outside its boundary', () => {
    const toleranceLesson = lessonWith((lesson) => {
      const rules = lesson.evaluationRules as Array<Record<string, unknown>>;
      rules[1] = { ...rules[1], numericTolerance: 0.1 };
    });
    const boundary = completed(
      evaluateExercise(toleranceLesson, submittedBudgetWorkbook({ C2: { formula: '=SUM(B2:B4)+0.1' } }))
    );
    expect(boundary.earnedScore).toBe(100);

    const outside = completed(
      evaluateExercise(toleranceLesson, submittedBudgetWorkbook({ C2: { formula: '=SUM(B2:B4)+0.1001' } }))
    );
    expect(outside).toMatchObject({ earnedScore: 60, passed: false });
  });

  it('compares each RANGE_VALUES cell in row-major order', () => {
    const result = completed(
      evaluateExercise(budgetTotalLessonFixture, submittedBudgetWorkbook({ B3: { value: 251 }, C2: { formula: '=SUM(B2:B4)' } }))
    );
    expect(result).toMatchObject({ earnedScore: 40, passed: false });
    expect(result.ruleResults[2]).toMatchObject({ feedbackCode: 'INCORRECT', pointsAwarded: 0 });
  });

  it('validates untrusted snapshots before evaluation and never accepts client-provided fields', () => {
    const unknownField = { ...submittedBudgetWorkbook(), score: 100 };
    expect(evaluateExercise(budgetTotalLessonFixture, unknownField)).toMatchObject({
      earnedScore: 0,
      feedbackCode: 'INVALID_SUBMISSION',
      status: 'INVALID_SUBMISSION',
    });

    const malformedAddress = submittedBudgetWorkbook();
    malformedAddress.sheets[0].cells = { A0: { value: 1 } };
    expect(evaluateExercise(budgetTotalLessonFixture, malformedAddress)).toMatchObject({
      feedbackCode: 'INVALID_SUBMISSION',
      status: 'INVALID_SUBMISSION',
    });
  });

  it('calculates the documented formula subset and dependency chains', () => {
    const workbook = {
      schemaVersion: 1,
      id: 'formula-test',
      name: 'Formula test',
      sheets: [
        {
          id: 'sheet',
          name: 'Sheet',
          rowCount: 20,
          columnCount: 20,
          cells: {
            A1: { value: 10 },
            A2: { value: 20 },
            A3: { formula: '=SUM(A1:A2)' },
            B1: { value: 4 },
            B2: { value: 5 },
            B3: { value: 4 },
            B4: { formula: '=AVERAGE(B1:B3)' },
            C1: { value: 80 },
            C2: { formula: '=IF(C1>=40,"Pass","Fail")' },
            D1: { value: 'A' },
            D2: { value: 'B' },
            D3: { value: 'A' },
            E1: { value: 10 },
            E2: { value: 20 },
            E3: { value: 30 },
            F1: { formula: '=SUMIF(D1:D3,"A",E1:E3)' },
            G1: { formula: '=A3*2' },
            G2: { formula: '=G1+1' },
          },
        },
      ],
    };
    expect(calculation(workbook, 'A3')).toEqual({ ok: true, value: 30 });
    expect(calculation(workbook, 'B4')).toEqual({ ok: true, value: 13 / 3 });
    expect(calculation(workbook, 'C2')).toEqual({ ok: true, value: 'Pass' });
    const falseCondition = structuredClone(workbook);
    falseCondition.sheets[0].cells.C1 = { value: 30 };
    expect(calculation(falseCondition, 'C2')).toEqual({ ok: true, value: 'Fail' });
    expect(calculation(workbook, 'F1')).toEqual({ ok: true, value: 40 });
    expect(calculation(workbook, 'G2')).toEqual({ ok: true, value: 61 });
  });

  it('resolves relative, absolute, and mixed references from submitted formula text', () => {
    const workbook = submittedBudgetWorkbook({
      C2: { formula: '=$B$2+B3' },
      C3: { formula: '=$B3+B$2' },
      C4: { formula: '=B$2+$B4' },
    });
    expect(calculation(workbook, 'C2')).toEqual({ ok: true, value: 750 });
    expect(calculation(workbook, 'C3')).toEqual({ ok: true, value: 750 });
    expect(calculation(workbook, 'C4')).toEqual({ ok: true, value: 600 });
  });

  it('fails circular, unsupported, out-of-bounds, and oversized formulas safely', () => {
    const circular = submittedBudgetWorkbook({ A1: { formula: '=B1' }, B1: { formula: '=A1' } });
    expect(calculation(circular, 'A1')).toEqual({ error: 'CIRCULAR_REFERENCE', ok: false });

    const unsupported = submittedBudgetWorkbook({ C2: { formula: '=UNKNOWN_FUNCTION(1)' } });
    expect(calculation(unsupported, 'C2')).toEqual({ error: 'UNSUPPORTED_FUNCTION', ok: false });

    const outOfBounds = completed(
      evaluateExercise(budgetTotalLessonFixture, submittedBudgetWorkbook({ C2: { formula: '=G1' } }))
    );
    expect(outOfBounds.ruleResults[0]).toMatchObject({ feedbackCode: 'INVALID_REFERENCE', pointsAwarded: 0 });

    const missingTargetSheet = submittedBudgetWorkbook({ C2: { formula: '=SUM(B2:B4)' } });
    missingTargetSheet.sheets[0].id = 'different-sheet';
    const missingSheet = completed(evaluateExercise(budgetTotalLessonFixture, missingTargetSheet));
    expect(missingSheet.ruleResults[0]).toMatchObject({ feedbackCode: 'INVALID_REFERENCE', pointsAwarded: 0 });

    const maliciousFormula = `=${'1+'.repeat(512)}1`;
    const resourceLimited = completed(
      evaluateExercise(budgetTotalLessonFixture, submittedBudgetWorkbook({ C2: { formula: maliciousFormula } }))
    );
    expect(resourceLimited.ruleResults[0]).toMatchObject({ feedbackCode: 'CALCULATION_LIMIT_REACHED', pointsAwarded: 0 });
  });

  it('returns deterministic, answer-key-free results for identical submissions', () => {
    const submission = submittedBudgetWorkbook({ C2: { formula: '=SUM(B2:B4)' } });
    const first = evaluateExercise(budgetTotalLessonFixture, submission);
    const second = evaluateExercise(budgetTotalLessonFixture, submission);
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toContain('evaluationRules');
    expect(JSON.stringify(first)).not.toContain('expectedValue');
    expect(JSON.stringify(first)).not.toContain('expectedValues');
    expect(JSON.stringify(first)).not.toContain('functionName');
    expect(JSON.stringify(first)).not.toContain('=SUM');
  });
});
