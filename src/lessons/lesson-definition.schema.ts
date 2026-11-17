import { z } from 'zod';

export const LESSON_DEFINITION_SCHEMA_VERSION = 1 as const;

export const LESSON_DEFINITION_LIMITS = {
  maxCells: 10_000,
  maxColumns: 100,
  maxDescriptionLength: 1_000,
  maxFormulaLength: 8_192,
  maxHints: 5,
  maxHintLength: 300,
  maxInstructions: 12,
  maxInstructionLength: 500,
  maxJsonBytes: 1_000_000,
  maxRules: 20,
  maxRows: 1_000,
  maxRulePoints: 1_000,
  maxRuleRangeCells: 100,
  maxScore: 1_000,
  maxStringLength: 32_768,
  maxWorkbookNameLength: 128,
  maxWorksheetNameLength: 128,
} as const;

const LESSON_ID = /^[a-z][a-z0-9-]{2,63}$/;
const RULE_ID = /^[a-z][a-z0-9-]{2,63}$/;
const CELL_ADDRESS = /^([A-Z]+)([1-9]\d*)$/;
const CELL_RANGE = /^([A-Z]+)([1-9]\d*):([A-Z]+)([1-9]\d*)$/;
const FUNCTION_NAME = /^[A-Z][A-Z0-9_.]{0,63}$/;

type CellCoordinates = { column: number; row: number };
type RangeCoordinates = { end: CellCoordinates; start: CellCoordinates };

function columnIndex(label: string) {
  return [...label].reduce((result, character) => result * 26 + character.charCodeAt(0) - 64, 0);
}

function parseCellAddress(address: string): CellCoordinates | null {
  const match = CELL_ADDRESS.exec(address);
  if (!match) return null;
  return { column: columnIndex(match[1]), row: Number(match[2]) };
}

function parseCellRange(range: string): RangeCoordinates | null {
  const match = CELL_RANGE.exec(range);
  if (!match) return null;
  const start = { column: columnIndex(match[1]), row: Number(match[2]) };
  const end = { column: columnIndex(match[3]), row: Number(match[4]) };
  if (start.column > end.column || start.row > end.row) return null;
  return { end, start };
}

export function isCanonicalCellAddress(address: string) {
  return parseCellAddress(address) !== null;
}

export function isCanonicalCellRange(range: string) {
  return parseCellRange(range) !== null;
}

function isAddressWithinSheet(address: string, rowCount: number, columnCount: number) {
  const coordinates = parseCellAddress(address);
  return coordinates !== null && coordinates.row <= rowCount && coordinates.column <= columnCount;
}

function rangeDimensions(range: string) {
  const coordinates = parseCellRange(range);
  if (!coordinates) return null;
  return {
    columns: coordinates.end.column - coordinates.start.column + 1,
    rows: coordinates.end.row - coordinates.start.row + 1,
  };
}

function isRangeWithinSheet(range: string, rowCount: number, columnCount: number) {
  const coordinates = parseCellRange(range);
  return coordinates !== null && coordinates.end.row <= rowCount && coordinates.end.column <= columnCount;
}

function issue(context: z.RefinementCtx, path: (string | number)[], message: string) {
  context.addIssue({ code: z.ZodIssueCode.custom, message, path });
}

const identifierSchema = z.string().regex(LESSON_ID, 'Must be a lowercase kebab-case identifier.');
const ruleIdentifierSchema = z.string().regex(RULE_ID, 'Must be a lowercase kebab-case identifier.');
const cellAddressSchema = z.string().regex(CELL_ADDRESS, 'Must be an uppercase A1 cell address.');
const cellRangeSchema = z
  .string()
  .regex(CELL_RANGE, 'Must be an uppercase A1 range such as A1:B2.')
  .refine(isCanonicalCellRange, 'Range end must not precede its start.');

const canonicalCellValueSchema = z.union([
  z.string().max(LESSON_DEFINITION_LIMITS.maxStringLength),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const canonicalCellSchema = z
  .object({
    formula: z.string().min(2).startsWith('=').max(LESSON_DEFINITION_LIMITS.maxFormulaLength).optional(),
    numberFormat: z.string().min(1).max(100).optional(),
    value: canonicalCellValueSchema.optional(),
  })
  .strict()
  .superRefine((cell, context) => {
    if (cell.formula === undefined && cell.numberFormat === undefined && cell.value === undefined) {
      issue(context, [], 'A cell must contain a value, formula, or number format.');
    }
  });

const canonicalSheetSchema = z
  .object({
    cells: z.record(cellAddressSchema, canonicalCellSchema),
    columnCount: z.number().int().min(1).max(LESSON_DEFINITION_LIMITS.maxColumns),
    id: z.string().min(1).max(LESSON_DEFINITION_LIMITS.maxWorksheetNameLength),
    name: z.string().min(1).max(LESSON_DEFINITION_LIMITS.maxWorksheetNameLength),
    rowCount: z.number().int().min(1).max(LESSON_DEFINITION_LIMITS.maxRows),
  })
  .strict()
  .superRefine((sheet, context) => {
    for (const address of Object.keys(sheet.cells)) {
      if (!isAddressWithinSheet(address, sheet.rowCount, sheet.columnCount)) {
        issue(context, ['cells', address], 'Cell address is outside the declared sheet dimensions.');
      }
    }
  });

export const canonicalWorkbookV1Schema = z
  .object({
    id: z.string().min(1).max(LESSON_DEFINITION_LIMITS.maxWorkbookNameLength),
    name: z.string().min(1).max(LESSON_DEFINITION_LIMITS.maxWorkbookNameLength),
    schemaVersion: z.literal(1),
    sheets: z.array(canonicalSheetSchema).min(1).max(32),
  })
  .strict()
  .superRefine((workbook, context) => {
    const sheetIds = new Set<string>();
    const sheetNames = new Set<string>();
    let cellCount = 0;

    workbook.sheets.forEach((sheet, index) => {
      if (sheetIds.has(sheet.id)) issue(context, ['sheets', index, 'id'], 'Sheet ids must be unique.');
      if (sheetNames.has(sheet.name)) issue(context, ['sheets', index, 'name'], 'Sheet names must be unique.');
      sheetIds.add(sheet.id);
      sheetNames.add(sheet.name);
      cellCount += Object.keys(sheet.cells).length;
    });

    if (cellCount > LESSON_DEFINITION_LIMITS.maxCells) {
      issue(context, ['sheets'], `Workbook exceeds ${LESSON_DEFINITION_LIMITS.maxCells} populated cells.`);
    }
    if (new TextEncoder().encode(JSON.stringify(workbook)).byteLength > LESSON_DEFINITION_LIMITS.maxJsonBytes) {
      issue(context, [], `Workbook exceeds ${LESSON_DEFINITION_LIMITS.maxJsonBytes} bytes when serialized.`);
    }
  });

const ruleTargetSchema = z
  .object({
    address: cellAddressSchema,
    sheetId: z.string().min(1).max(LESSON_DEFINITION_LIMITS.maxWorksheetNameLength),
  })
  .strict();

const rangeTargetSchema = z
  .object({
    range: cellRangeSchema,
    sheetId: z.string().min(1).max(LESSON_DEFINITION_LIMITS.maxWorksheetNameLength),
  })
  .strict();

const ruleBaseShape = {
  id: ruleIdentifierSchema,
  points: z.number().int().min(1).max(LESSON_DEFINITION_LIMITS.maxRulePoints),
};

const cellValueRuleSchema = z
  .object({
    ...ruleBaseShape,
    expectedValue: canonicalCellValueSchema,
    numericTolerance: z.number().finite().min(0).max(1_000_000).optional(),
    target: ruleTargetSchema,
    type: z.literal('CELL_VALUE'),
  })
  .strict();

const functionUsedRuleSchema = z
  .object({
    ...ruleBaseShape,
    functionName: z.string().regex(FUNCTION_NAME, 'Must be an uppercase function name.'),
    target: ruleTargetSchema,
    type: z.literal('FUNCTION_USED'),
  })
  .strict();

const rangeValuesRuleSchema = z
  .object({
    ...ruleBaseShape,
    expectedValues: z
      .array(z.array(canonicalCellValueSchema).min(1).max(LESSON_DEFINITION_LIMITS.maxColumns))
      .min(1)
      .max(LESSON_DEFINITION_LIMITS.maxRows),
    target: rangeTargetSchema,
    type: z.literal('RANGE_VALUES'),
  })
  .strict();

export const evaluationRuleSchema = z.discriminatedUnion('type', [
  cellValueRuleSchema,
  functionUsedRuleSchema,
  rangeValuesRuleSchema,
]);

const scoringSchema = z
  .object({
    maxScore: z.number().int().min(1).max(LESSON_DEFINITION_LIMITS.maxScore),
    passingScore: z.number().int().min(0).max(LESSON_DEFINITION_LIMITS.maxScore),
  })
  .strict();

const lessonDefinitionShape = {
  description: z.string().min(1).max(LESSON_DEFINITION_LIMITS.maxDescriptionLength),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
  evaluationRules: z.array(evaluationRuleSchema).min(1).max(LESSON_DEFINITION_LIMITS.maxRules),
  hints: z.array(z.string().min(1).max(LESSON_DEFINITION_LIMITS.maxHintLength)).max(LESSON_DEFINITION_LIMITS.maxHints),
  id: identifierSchema,
  instructions: z.array(z.string().min(1).max(LESSON_DEFINITION_LIMITS.maxInstructionLength)).min(1).max(LESSON_DEFINITION_LIMITS.maxInstructions),
  schemaVersion: z.literal(LESSON_DEFINITION_SCHEMA_VERSION),
  scoring: scoringSchema,
  starterWorkbook: canonicalWorkbookV1Schema,
  title: z.string().min(1).max(160),
};

export const privateLessonDefinitionSchema = z.object(lessonDefinitionShape).strict().superRefine((lesson, context) => {
  const sheetsById = new Map(lesson.starterWorkbook.sheets.map((sheet) => [sheet.id, sheet]));
  const ruleIds = new Set<string>();
  let points = 0;

  lesson.evaluationRules.forEach((rule, index) => {
    if (ruleIds.has(rule.id)) issue(context, ['evaluationRules', index, 'id'], 'Rule ids must be unique.');
    ruleIds.add(rule.id);
    points += rule.points;

    const sheet = sheetsById.get(rule.target.sheetId);
    if (!sheet) {
      issue(context, ['evaluationRules', index, 'target', 'sheetId'], 'Rule target must reference a workbook sheet.');
      return;
    }

    if (rule.type === 'RANGE_VALUES') {
      if (!isRangeWithinSheet(rule.target.range, sheet.rowCount, sheet.columnCount)) {
        issue(context, ['evaluationRules', index, 'target', 'range'], 'Range is outside the declared sheet dimensions.');
      }
      const dimensions = rangeDimensions(rule.target.range);
      if (dimensions) {
        const expectedCellCount = dimensions.rows * dimensions.columns;
        if (expectedCellCount > LESSON_DEFINITION_LIMITS.maxRuleRangeCells) {
          issue(context, ['evaluationRules', index, 'target', 'range'], `Range may contain at most ${LESSON_DEFINITION_LIMITS.maxRuleRangeCells} cells.`);
        }
        if (rule.expectedValues.length !== dimensions.rows || rule.expectedValues.some((row) => row.length !== dimensions.columns)) {
          issue(context, ['evaluationRules', index, 'expectedValues'], 'Expected values must exactly match the target range dimensions.');
        }
      }
      return;
    }

    if (!isAddressWithinSheet(rule.target.address, sheet.rowCount, sheet.columnCount)) {
      issue(context, ['evaluationRules', index, 'target', 'address'], 'Cell address is outside the declared sheet dimensions.');
    }
    if (rule.type === 'CELL_VALUE' && rule.numericTolerance !== undefined && typeof rule.expectedValue !== 'number') {
      issue(context, ['evaluationRules', index, 'numericTolerance'], 'Numeric tolerance is valid only for a numeric expected value.');
    }
  });

  if (lesson.scoring.passingScore > lesson.scoring.maxScore) {
    issue(context, ['scoring', 'passingScore'], 'Passing score must not exceed max score.');
  }
  if (points !== lesson.scoring.maxScore) {
    issue(context, ['evaluationRules'], 'Rule points must add up exactly to scoring.maxScore.');
  }
});

export const publicLessonDefinitionSchema = z
  .object({
    description: lessonDefinitionShape.description,
    difficulty: lessonDefinitionShape.difficulty,
    hints: lessonDefinitionShape.hints,
    id: lessonDefinitionShape.id,
    instructions: lessonDefinitionShape.instructions,
    schemaVersion: lessonDefinitionShape.schemaVersion,
    starterWorkbook: lessonDefinitionShape.starterWorkbook,
    title: lessonDefinitionShape.title,
  })
  .strict();

export type PrivateLessonDefinition = z.infer<typeof privateLessonDefinitionSchema>;
export type PublicLessonDefinition = z.infer<typeof publicLessonDefinitionSchema>;
export type EvaluationRule = z.infer<typeof evaluationRuleSchema>;

export function parsePrivateLessonDefinition(value: unknown): PrivateLessonDefinition {
  return privateLessonDefinitionSchema.parse(value);
}

export function toPublicLessonDefinition(value: unknown): PublicLessonDefinition {
  const lesson = parsePrivateLessonDefinition(value);
  return publicLessonDefinitionSchema.parse({
    description: lesson.description,
    difficulty: lesson.difficulty,
    hints: lesson.hints,
    id: lesson.id,
    instructions: lesson.instructions,
    schemaVersion: lesson.schemaVersion,
    starterWorkbook: lesson.starterWorkbook,
    title: lesson.title,
  });
}
