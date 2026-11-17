import {
  canonicalWorkbookV1Schema,
  privateLessonDefinitionSchema,
  type EvaluationRule,
  type PrivateLessonDefinition,
} from '../lesson-definition.schema';
import { FormulaEngine, type CellCalculation, type FormulaErrorCode } from './formula-engine';
import { astContainsFunction, parseFormula } from './formula-parser';

type Scalar = boolean | null | number | string;
type SubmittedWorkbook = ReturnType<typeof canonicalWorkbookV1Schema.parse>;

export type RuleFeedbackCode =
  | 'CALCULATION_LIMIT_REACHED'
  | 'CIRCULAR_REFERENCE'
  | 'INCORRECT'
  | 'INVALID_FORMULA'
  | 'INVALID_REFERENCE'
  | 'RULE_PASSED'
  | 'UNSUPPORTED_FORMULA';

export type RuleEvaluationResult = {
  feedbackCode: RuleFeedbackCode;
  pointsAwarded: number;
  ruleIndex: number;
  status: 'FAILED' | 'PASSED';
};

export type ExerciseEvaluationResult =
  | {
      earnedScore: number;
      maxScore: number;
      passed: boolean;
      ruleResults: RuleEvaluationResult[];
      status: 'COMPLETED';
    }
  | {
      earnedScore: 0;
      feedbackCode: 'INVALID_SUBMISSION';
      maxScore: number;
      passed: false;
      ruleResults: [];
      status: 'INVALID_SUBMISSION';
    }
  | {
      earnedScore: 0;
      feedbackCode: 'EVALUATOR_FAILURE';
      maxScore: 0;
      passed: false;
      ruleResults: [];
      status: 'EVALUATOR_FAILURE';
    };

function columnIndex(label: string) {
  return [...label].reduce((result, character) => result * 26 + character.charCodeAt(0) - 64, 0);
}

function columnLabel(index: number) {
  let value = index;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function rangeAddresses(range: string) {
  const match = /^([A-Z]+)([1-9]\d*):([A-Z]+)([1-9]\d*)$/.exec(range);
  if (!match) return [];
  const startColumn = columnIndex(match[1]);
  const startRow = Number(match[2]);
  const endColumn = columnIndex(match[3]);
  const endRow = Number(match[4]);
  const addresses: string[][] = [];
  for (let row = startRow; row <= endRow; row += 1) {
    const cells: string[] = [];
    for (let column = startColumn; column <= endColumn; column += 1) cells.push(`${columnLabel(column)}${row}`);
    addresses.push(cells);
  }
  return addresses;
}

function failureFeedback(error: FormulaErrorCode): RuleFeedbackCode {
  switch (error) {
    case 'CIRCULAR_REFERENCE':
      return 'CIRCULAR_REFERENCE';
    case 'INVALID_REFERENCE':
    case 'OUT_OF_BOUNDS_REFERENCE':
      return 'INVALID_REFERENCE';
    case 'RESOURCE_LIMIT':
      return 'CALCULATION_LIMIT_REACHED';
    case 'UNSUPPORTED_FEATURE':
    case 'UNSUPPORTED_FUNCTION':
      return 'UNSUPPORTED_FORMULA';
    case 'DIVIDE_BY_ZERO':
    case 'INVALID_FORMULA':
      return 'INVALID_FORMULA';
  }
}

function ruleFailure(ruleIndex: number, feedbackCode: RuleFeedbackCode): RuleEvaluationResult {
  return { feedbackCode, pointsAwarded: 0, ruleIndex, status: 'FAILED' };
}

function calculationValue(calculation: CellCalculation, ruleIndex: number): Scalar | RuleEvaluationResult {
  if (calculation.ok) return calculation.value;
  return ruleFailure(ruleIndex, failureFeedback(calculation.error));
}

function isRuleFailure(value: Scalar | RuleEvaluationResult): value is RuleEvaluationResult {
  return typeof value === 'object' && value !== null && 'feedbackCode' in value;
}

function valuesMatch(actual: Scalar, expected: Scalar, numericTolerance?: number) {
  if (typeof actual !== typeof expected) return false;
  if (typeof actual === 'number' && typeof expected === 'number') {
    const tolerance = numericTolerance ?? 0;
    const roundingAllowance = Number.EPSILON * Math.max(1, Math.abs(actual), Math.abs(expected));
    return Math.abs(actual - expected) <= tolerance + roundingAllowance;
  }
  return actual === expected;
}

function evaluateCellValueRule(
  rule: Extract<EvaluationRule, { type: 'CELL_VALUE' }>,
  ruleIndex: number,
  engine: FormulaEngine
): RuleEvaluationResult {
  const actual = calculationValue(engine.calculateCell(rule.target.sheetId, rule.target.address), ruleIndex);
  if (isRuleFailure(actual)) return actual;
  return valuesMatch(actual, rule.expectedValue, rule.numericTolerance)
    ? { feedbackCode: 'RULE_PASSED', pointsAwarded: rule.points, ruleIndex, status: 'PASSED' }
    : ruleFailure(ruleIndex, 'INCORRECT');
}

function evaluateFunctionUsedRule(
  rule: Extract<EvaluationRule, { type: 'FUNCTION_USED' }>,
  ruleIndex: number,
  engine: FormulaEngine,
  workbook: SubmittedWorkbook
): RuleEvaluationResult {
  const calculated = calculationValue(engine.calculateCell(rule.target.sheetId, rule.target.address), ruleIndex);
  if (isRuleFailure(calculated)) return calculated;

  const sheet = workbook.sheets.find((candidate) => candidate.id === rule.target.sheetId);
  const formula = sheet?.cells[rule.target.address]?.formula;
  if (!formula) return ruleFailure(ruleIndex, 'INCORRECT');
  try {
    return astContainsFunction(parseFormula(formula), rule.functionName)
      ? { feedbackCode: 'RULE_PASSED', pointsAwarded: rule.points, ruleIndex, status: 'PASSED' }
      : ruleFailure(ruleIndex, 'INCORRECT');
  } catch {
    return ruleFailure(ruleIndex, 'INVALID_FORMULA');
  }
}

function evaluateRangeValuesRule(
  rule: Extract<EvaluationRule, { type: 'RANGE_VALUES' }>,
  ruleIndex: number,
  engine: FormulaEngine
): RuleEvaluationResult {
  const addresses = rangeAddresses(rule.target.range);
  for (let row = 0; row < addresses.length; row += 1) {
    for (let column = 0; column < addresses[row].length; column += 1) {
      const actual = calculationValue(engine.calculateCell(rule.target.sheetId, addresses[row][column]), ruleIndex);
      if (isRuleFailure(actual)) return actual;
      if (!valuesMatch(actual, rule.expectedValues[row][column])) return ruleFailure(ruleIndex, 'INCORRECT');
    }
  }
  return { feedbackCode: 'RULE_PASSED', pointsAwarded: rule.points, ruleIndex, status: 'PASSED' };
}

function evaluateRule(rule: EvaluationRule, ruleIndex: number, engine: FormulaEngine, workbook: SubmittedWorkbook) {
  switch (rule.type) {
    case 'CELL_VALUE':
      return evaluateCellValueRule(rule, ruleIndex, engine);
    case 'FUNCTION_USED':
      return evaluateFunctionUsedRule(rule, ruleIndex, engine, workbook);
    case 'RANGE_VALUES':
      return evaluateRangeValuesRule(rule, ruleIndex, engine);
  }
}

/**
 * Evaluates a trusted, already-authored private lesson against an untrusted
 * canonical workbook snapshot. The returned result intentionally excludes
 * answer keys, rule configuration, formulas, and expected values.
 */
export function evaluateExercise(
  privateLesson: PrivateLessonDefinition,
  submittedWorkbook: unknown
): ExerciseEvaluationResult {
  const validatedLesson = privateLessonDefinitionSchema.safeParse(privateLesson);
  if (!validatedLesson.success) {
    return {
      earnedScore: 0,
      feedbackCode: 'EVALUATOR_FAILURE',
      maxScore: 0,
      passed: false,
      ruleResults: [],
      status: 'EVALUATOR_FAILURE',
    };
  }
  const validatedWorkbook = canonicalWorkbookV1Schema.safeParse(submittedWorkbook);
  if (!validatedWorkbook.success) {
    return {
      earnedScore: 0,
      feedbackCode: 'INVALID_SUBMISSION',
      maxScore: validatedLesson.data.scoring.maxScore,
      passed: false,
      ruleResults: [],
      status: 'INVALID_SUBMISSION',
    };
  }

  try {
    const engine = new FormulaEngine(validatedWorkbook.data);
    const ruleResults = validatedLesson.data.evaluationRules.map((rule, index) =>
      evaluateRule(rule, index, engine, validatedWorkbook.data)
    );
    const earnedScore = ruleResults.reduce((total, result) => total + result.pointsAwarded, 0);
    return {
      earnedScore,
      maxScore: validatedLesson.data.scoring.maxScore,
      passed: earnedScore >= validatedLesson.data.scoring.passingScore,
      ruleResults,
      status: 'COMPLETED',
    };
  } catch {
    return {
      earnedScore: 0,
      feedbackCode: 'EVALUATOR_FAILURE',
      maxScore: 0,
      passed: false,
      ruleResults: [],
      status: 'EVALUATOR_FAILURE',
    };
  }
}
