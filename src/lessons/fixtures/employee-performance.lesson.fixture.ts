import { parsePrivateLessonDefinition } from '../lesson-definition.schema';

export const employeePerformanceLessonFixture = parsePrivateLessonDefinition({
  schemaVersion: 1,
  id: 'employee-performance',
  title: 'Review employee performance',
  description: 'Use AVERAGE and IF to summarize a small team scorecard.',
  difficulty: 'BEGINNER',
  instructions: [
    'Review the three performance scores in cells B2 through B4.',
    'In C2, calculate the team average with AVERAGE.',
    'In D2, use IF to show "On target" when the average is at least 80, otherwise show "Needs support".',
  ],
  starterWorkbook: {
    schemaVersion: 1,
    id: 'employee-performance-workbook',
    name: 'Employee performance practice',
    sheets: [
      {
        id: 'performance',
        name: 'Performance',
        rowCount: 20,
        columnCount: 6,
        cells: {
          A1: { value: 'Employee' }, B1: { value: 'Score' }, C1: { value: 'Team average' }, D1: { value: 'Status' },
          A2: { value: 'Amina' }, B2: { value: 84 }, C2: { numberFormat: '0.00' },
          A3: { value: 'Ben' }, B3: { value: 76 },
          A4: { value: 'Chen' }, B4: { value: 90 },
        },
      },
    ],
  },
  hints: [
    'AVERAGE can calculate the mean of a continuous range such as B2:B4.',
    'An IF formula has a condition, a result when true, and a result when false.',
  ],
  scoring: { maxScore: 100, passingScore: 80 },
  evaluationRules: [
    { id: 'average-uses-average', type: 'FUNCTION_USED', points: 30, target: { sheetId: 'performance', address: 'C2' }, functionName: 'AVERAGE' },
    { id: 'average-is-correct', type: 'CELL_VALUE', points: 25, target: { sheetId: 'performance', address: 'C2' }, expectedValue: 250 / 3, numericTolerance: 0.000001 },
    { id: 'status-uses-if', type: 'FUNCTION_USED', points: 25, target: { sheetId: 'performance', address: 'D2' }, functionName: 'IF' },
    { id: 'status-is-correct', type: 'CELL_VALUE', points: 20, target: { sheetId: 'performance', address: 'D2' }, expectedValue: 'On target' },
  ],
});
