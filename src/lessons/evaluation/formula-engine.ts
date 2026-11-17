import type { z } from 'zod';
import { canonicalWorkbookV1Schema } from '../lesson-definition.schema';
import {
  DEFAULT_FORMULA_PARSE_LIMITS,
  FormulaParseError,
  parseFormula,
  type FormulaAst,
  type FormulaParseLimits,
} from './formula-parser';

type CanonicalWorkbook = z.infer<typeof canonicalWorkbookV1Schema>;
type Scalar = boolean | null | number | string;
type EvaluatedValue = Scalar | Scalar[];

export type FormulaErrorCode =
  | 'CIRCULAR_REFERENCE'
  | 'DIVIDE_BY_ZERO'
  | 'INVALID_FORMULA'
  | 'INVALID_REFERENCE'
  | 'OUT_OF_BOUNDS_REFERENCE'
  | 'RESOURCE_LIMIT'
  | 'UNSUPPORTED_FEATURE'
  | 'UNSUPPORTED_FUNCTION';

export type CellCalculation =
  | { ok: true; value: Scalar }
  | { error: FormulaErrorCode; ok: false };

export const DEFAULT_FORMULA_EVALUATION_LIMITS = {
  ...DEFAULT_FORMULA_PARSE_LIMITS,
  maxCellEvaluations: 2_000,
  maxDependencyDepth: 64,
  maxRangeCells: 1_000,
} as const;

export type FormulaEvaluationLimits = FormulaParseLimits & {
  maxCellEvaluations: number;
  maxDependencyDepth: number;
  maxRangeCells: number;
};

class FormulaEvaluationError extends Error {
  constructor(public readonly code: FormulaErrorCode) {
    super(code);
    this.name = 'FormulaEvaluationError';
  }
}

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

function coordinates(address: string) {
  const match = /^([A-Z]+)([1-9]\d*)$/.exec(address);
  if (!match) throw new FormulaEvaluationError('INVALID_REFERENCE');
  return { column: columnIndex(match[1]), row: Number(match[2]) };
}

function cellKey(sheetId: string, address: string) {
  return `${sheetId}:${address}`;
}

function formulaError(error: unknown): FormulaEvaluationError {
  if (error instanceof FormulaEvaluationError) return error;
  if (error instanceof FormulaParseError) return new FormulaEvaluationError(error.code);
  return new FormulaEvaluationError('INVALID_FORMULA');
}

function exactEqual(left: Scalar, right: Scalar) {
  return left === right;
}

function scalar(value: EvaluatedValue): Scalar {
  if (Array.isArray(value)) throw new FormulaEvaluationError('UNSUPPORTED_FEATURE');
  return value;
}

function asNumber(value: Scalar) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new FormulaEvaluationError('INVALID_FORMULA');
  return value;
}

function flatten(values: EvaluatedValue[]) {
  return values.flatMap((value) => (Array.isArray(value) ? value : [value]));
}

function sum(values: Scalar[]) {
  return values.reduce<number>((total, value) => total + (value === null ? 0 : asNumber(value)), 0);
}

function average(values: Scalar[]) {
  const numericValues = values.filter((value): value is number => typeof value === 'number');
  if (numericValues.length === 0) throw new FormulaEvaluationError('DIVIDE_BY_ZERO');
  return numericValues.reduce((total, value) => total + value, 0) / numericValues.length;
}

function compareCriteria(value: Scalar, criteria: Scalar) {
  if (typeof criteria !== 'string') return exactEqual(value, criteria);
  const comparison = /^(<=|>=|<>|=|<|>)(-?(?:\d+\.?\d*|\.\d+))$/.exec(criteria);
  if (!comparison) return exactEqual(value, criteria);
  if (typeof value !== 'number') return false;
  const target = Number(comparison[2]);
  switch (comparison[1]) {
    case '<=':
      return value <= target;
    case '>=':
      return value >= target;
    case '<>':
      return value !== target;
    case '=':
      return value === target;
    case '<':
      return value < target;
    case '>':
      return value > target;
    default:
      return false;
  }
}

export class FormulaEngine {
  private readonly calculations = new Map<string, CellCalculation>();
  private readonly evaluating = new Set<string>();
  private readonly formulas = new Map<string, FormulaAst>();
  private readonly sheets = new Map<string, CanonicalWorkbook['sheets'][number]>();
  private cellEvaluationCount = 0;

  constructor(
    private readonly workbook: CanonicalWorkbook,
    private readonly limits: FormulaEvaluationLimits = DEFAULT_FORMULA_EVALUATION_LIMITS
  ) {
    for (const sheet of workbook.sheets) this.sheets.set(sheet.id, sheet);
  }

  calculateCell(sheetId: string, address: string): CellCalculation {
    try {
      return { ok: true, value: this.calculateCellValue(sheetId, address, 0) };
    } catch (error) {
      return { error: formulaError(error).code, ok: false };
    }
  }

  private calculateCellValue(sheetId: string, address: string, depth: number): Scalar {
    const key = cellKey(sheetId, address);
    const cached = this.calculations.get(key);
    if (cached) {
      if (cached.ok) return cached.value;
      throw new FormulaEvaluationError(cached.error);
    }
    if (depth > this.limits.maxDependencyDepth) throw new FormulaEvaluationError('RESOURCE_LIMIT');
    if (this.cellEvaluationCount >= this.limits.maxCellEvaluations) throw new FormulaEvaluationError('RESOURCE_LIMIT');
    if (this.evaluating.has(key)) throw new FormulaEvaluationError('CIRCULAR_REFERENCE');

    const sheet = this.sheets.get(sheetId);
    if (!sheet) throw new FormulaEvaluationError('INVALID_REFERENCE');
    const { column, row } = coordinates(address);
    if (row > sheet.rowCount || column > sheet.columnCount) throw new FormulaEvaluationError('OUT_OF_BOUNDS_REFERENCE');

    this.cellEvaluationCount += 1;
    this.evaluating.add(key);
    try {
      const cell = sheet.cells[address];
      const value = cell?.formula
        ? scalar(this.evaluateAst(this.parse(cell.formula), sheetId, depth + 1))
        : (cell?.value ?? null);
      this.calculations.set(key, { ok: true, value });
      return value;
    } catch (error) {
      const normalized = formulaError(error);
      this.calculations.set(key, { error: normalized.code, ok: false });
      throw normalized;
    } finally {
      this.evaluating.delete(key);
    }
  }

  private evaluateAst(ast: FormulaAst, sheetId: string, depth: number): EvaluatedValue {
    if (depth > this.limits.maxDependencyDepth) throw new FormulaEvaluationError('RESOURCE_LIMIT');
    switch (ast.type) {
      case 'literal':
        return ast.value;
      case 'cell':
        return this.calculateCellValue(sheetId, ast.address, depth + 1);
      case 'range':
        return this.calculateRange(sheetId, ast.start, ast.end, depth + 1);
      case 'unary': {
        const value = asNumber(scalar(this.evaluateAst(ast.operand, sheetId, depth + 1)));
        return ast.operator === '-' ? -value : value;
      }
      case 'binary':
        return this.evaluateBinary(ast, sheetId, depth + 1);
      case 'function':
        return this.evaluateFunction(ast, sheetId, depth + 1);
    }
  }

  private calculateRange(sheetId: string, start: string, end: string, depth: number): Scalar[] {
    const first = coordinates(start);
    const last = coordinates(end);
    const sheet = this.sheets.get(sheetId);
    if (!sheet) throw new FormulaEvaluationError('INVALID_REFERENCE');
    if (first.row > last.row || first.column > last.column) throw new FormulaEvaluationError('INVALID_REFERENCE');
    if (last.row > sheet.rowCount || last.column > sheet.columnCount) throw new FormulaEvaluationError('OUT_OF_BOUNDS_REFERENCE');
    const count = (last.row - first.row + 1) * (last.column - first.column + 1);
    if (count > this.limits.maxRangeCells) throw new FormulaEvaluationError('RESOURCE_LIMIT');

    const values: Scalar[] = [];
    for (let row = first.row; row <= last.row; row += 1) {
      for (let column = first.column; column <= last.column; column += 1) {
        values.push(this.calculateCellValue(sheetId, `${columnLabel(column)}${row}`, depth + 1));
      }
    }
    return values;
  }

  private evaluateBinary(ast: Extract<FormulaAst, { type: 'binary' }>, sheetId: string, depth: number): Scalar {
    const left = scalar(this.evaluateAst(ast.left, sheetId, depth + 1));
    const right = scalar(this.evaluateAst(ast.right, sheetId, depth + 1));
    switch (ast.operator) {
      case '+':
        return asNumber(left) + asNumber(right);
      case '-':
        return asNumber(left) - asNumber(right);
      case '*':
        return asNumber(left) * asNumber(right);
      case '/': {
        const divisor = asNumber(right);
        if (divisor === 0) throw new FormulaEvaluationError('DIVIDE_BY_ZERO');
        return asNumber(left) / divisor;
      }
      case '^':
        return asNumber(left) ** asNumber(right);
      case '=':
        return exactEqual(left, right);
      case '<>':
        return !exactEqual(left, right);
      case '<':
        return asNumber(left) < asNumber(right);
      case '<=':
        return asNumber(left) <= asNumber(right);
      case '>':
        return asNumber(left) > asNumber(right);
      case '>=':
        return asNumber(left) >= asNumber(right);
    }
  }

  private evaluateFunction(ast: Extract<FormulaAst, { type: 'function' }>, sheetId: string, depth: number): Scalar {
    if (ast.name === 'IF') {
      if (ast.arguments.length !== 3) throw new FormulaEvaluationError('INVALID_FORMULA');
      const condition = scalar(this.evaluateAst(ast.arguments[0], sheetId, depth + 1));
      if (typeof condition !== 'boolean') throw new FormulaEvaluationError('INVALID_FORMULA');
      return scalar(this.evaluateAst(ast.arguments[condition ? 1 : 2], sheetId, depth + 1));
    }

    const values = ast.arguments.map((argument) => this.evaluateAst(argument, sheetId, depth + 1));
    switch (ast.name) {
      case 'SUM':
        return sum(flatten(values));
      case 'AVERAGE':
        return average(flatten(values));
      case 'SUMIF':
        return this.sumIf(values);
      default:
        throw new FormulaEvaluationError('UNSUPPORTED_FUNCTION');
    }
  }

  private sumIf(values: EvaluatedValue[]): number {
    if (values.length < 2 || values.length > 3) throw new FormulaEvaluationError('INVALID_FORMULA');
    const criteriaRange = Array.isArray(values[0]) ? values[0] : [values[0]];
    const criteria = scalar(values[1]);
    const sumRange = values.length === 3 ? (Array.isArray(values[2]) ? values[2] : [values[2]]) : criteriaRange;
    if (criteriaRange.length !== sumRange.length) throw new FormulaEvaluationError('INVALID_FORMULA');
    return criteriaRange.reduce<number>((total, value, index) => {
      if (!compareCriteria(value, criteria)) return total;
      const sumValue = sumRange[index];
      return total + (sumValue === null ? 0 : asNumber(sumValue));
    }, 0);
  }

  private parse(formula: string) {
    const cached = this.formulas.get(formula);
    if (cached) return cached;
    const parsed = parseFormula(formula, this.limits);
    this.formulas.set(formula, parsed);
    return parsed;
  }
}
