import { parsePrivateLessonDefinition } from '../lesson-definition.schema';

export const salesAnalysisLessonFixture = parsePrivateLessonDefinition({
  schemaVersion: 1,
  id: 'sales-analysis',
  title: 'Analyze regional sales',
  description: 'Use SUMIF to total sales for one category.',
  difficulty: 'BEGINNER',
  instructions: [
    'Review the region labels in A2:A4 and their sales amounts in B2:B4.',
    'In C2, use SUMIF to calculate the total sales for the North region.',
  ],
  starterWorkbook: {
    schemaVersion: 1,
    id: 'sales-analysis-workbook',
    name: 'Sales analysis practice',
    sheets: [
      {
        id: 'sales',
        name: 'Sales',
        rowCount: 20,
        columnCount: 6,
        cells: {
          A1: { value: 'Region' }, B1: { value: 'Sales' }, C1: { value: 'North sales' },
          A2: { value: 'North' }, B2: { value: 120 },
          A3: { value: 'South' }, B3: { value: 80 },
          A4: { value: 'North' }, B4: { value: 150 },
        },
      },
    ],
  },
  hints: [
    'SUMIF checks a criteria range, then adds matching values from a sum range.',
    'Use the same three rows in both ranges, and use "North" as the criterion.',
  ],
  scoring: { maxScore: 100, passingScore: 70 },
  evaluationRules: [
    { id: 'north-total-uses-sumif', type: 'FUNCTION_USED', points: 45, target: { sheetId: 'sales', address: 'C2' }, functionName: 'SUMIF' },
    { id: 'north-total-is-correct', type: 'CELL_VALUE', points: 35, target: { sheetId: 'sales', address: 'C2' }, expectedValue: 270 },
    { id: 'sales-inputs-remain-correct', type: 'RANGE_VALUES', points: 20, target: { sheetId: 'sales', range: 'B2:B4' }, expectedValues: [[120], [80], [150]] },
  ],
});
