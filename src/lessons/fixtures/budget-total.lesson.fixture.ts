import { parsePrivateLessonDefinition } from '../lesson-definition.schema';

export const budgetTotalLessonFixture = parsePrivateLessonDefinition({
  schemaVersion: 1,
  id: 'budget-total',
  title: 'Calculate a budget total',
  description: 'Use SUM to calculate the total of three monthly expenses.',
  difficulty: 'BEGINNER',
  instructions: [
    'Review the monthly expenses in cells B2 through B4.',
    'In cell C2, use SUM to calculate the monthly total.',
  ],
  starterWorkbook: {
    schemaVersion: 1,
    id: 'budget-total-workbook',
    name: 'Budget total practice',
    sheets: [
      {
        id: 'budget',
        name: 'Budget',
        rowCount: 20,
        columnCount: 6,
        cells: {
          A1: { value: 'Category' },
          B1: { value: 'Amount' },
          C1: { value: 'Total' },
          A2: { value: 'Rent' },
          B2: { value: 500 },
          A3: { value: 'Food' },
          B3: { value: 250 },
          A4: { value: 'Transport' },
          B4: { value: 100 },
        },
      },
    ],
  },
  hints: ['SUM can add a continuous range, such as =SUM(B2:B4).'],
  scoring: {
    maxScore: 100,
    passingScore: 70,
  },
  evaluationRules: [
    {
      id: 'total-uses-sum',
      type: 'FUNCTION_USED',
      points: 40,
      target: { sheetId: 'budget', address: 'C2' },
      functionName: 'SUM',
    },
    {
      id: 'total-value-is-correct',
      type: 'CELL_VALUE',
      points: 40,
      target: { sheetId: 'budget', address: 'C2' },
      expectedValue: 850,
    },
    {
      id: 'expense-inputs-remain-correct',
      type: 'RANGE_VALUES',
      points: 20,
      target: { sheetId: 'budget', range: 'B2:B4' },
      expectedValues: [[500], [250], [100]],
    },
  ],
});
