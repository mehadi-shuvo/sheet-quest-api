import { Logger, Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureApplication } from '../app.config';
import { HealthController } from '../health/health.controller';
import { PrismaService } from '../prisma.service';
import { budgetTotalLessonFixture } from './fixtures/budget-total.lesson.fixture';
import { employeePerformanceLessonFixture } from './fixtures/employee-performance.lesson.fixture';
import { salesAnalysisLessonFixture } from './fixtures/sales-analysis.lesson.fixture';
import { LessonsModule } from './lessons.module';
import { LessonsService } from './lessons.service';

@Module({
  imports: [LessonsModule],
  controllers: [HealthController],
  providers: [
    {
      provide: PrismaService,
      useValue: { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) },
    },
  ],
})
class HttpTestModule {}

type CellInput = { formula?: string; value?: boolean | null | number | string };

function workbookWith(cells: Record<string, CellInput> = {}) {
  const workbook = structuredClone(budgetTotalLessonFixture.starterWorkbook);
  Object.assign(workbook.sheets[0].cells, cells);
  return workbook;
}

describe('lesson HTTP API', () => {
  let app: INestApplication;
  let baseUrl: string;
  let lessons: LessonsService;

  beforeAll(async () => {
    app = await NestFactory.create(HttpTestModule, { bodyParser: false, logger: false });
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { address: string; port: number };
    baseUrl = `http://${address.address}:${address.port}`;
    lessons = app.get(LessonsService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function request(path: string, init?: RequestInit) {
    return fetch(`${baseUrl}${path}`, init);
  }

  async function submit(workbook: unknown, additionalFields: Record<string, unknown> = {}) {
    return request('/v1/lessons/budget-total/submissions', {
      body: JSON.stringify({ schemaVersion: 1, workbook, ...additionalFields }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
  }

  async function submitLesson(lessonId: string, workbook: unknown) {
    return request(`/v1/lessons/${lessonId}/submissions`, {
      body: JSON.stringify({ schemaVersion: 1, workbook }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
  }

  it.each([
    [budgetTotalLessonFixture, { C2: { formula: '=SUM(B2:B4)' } }],
    [employeePerformanceLessonFixture, { C2: { formula: '=AVERAGE(B2:B4)' }, D2: { formula: '=IF(C2>=80,"On target","Needs support")' } }],
    [salesAnalysisLessonFixture, { C2: { formula: '=SUMIF(A2:A4,"North",B2:B4)' } }],
  ])('returns a learner-safe public projection and evaluates %s.id server-side', async (fixture, cells) => {
    const getResponse = await request(`/v1/lessons/${fixture.id}`);
    const publicLesson = (await getResponse.json()).data;
    expect(getResponse.status).toBe(200);
    expect(publicLesson).toMatchObject({ id: fixture.id, schemaVersion: 1 });
    expect(JSON.stringify(publicLesson)).not.toContain('evaluationRules');
    expect(JSON.stringify(publicLesson)).not.toContain('expectedValue');
    expect(JSON.stringify(publicLesson)).not.toContain('functionName');
    expect(JSON.stringify(publicLesson)).not.toContain('scoring');

    const workbook = structuredClone(fixture.starterWorkbook);
    Object.assign(workbook.sheets[0].cells, cells);
    const postResponse = await submitLesson(fixture.id, workbook);
    expect(postResponse.status).toBe(201);
    const result = (await postResponse.json()).data;
    expect(result).toMatchObject({ earnedScore: 100, maxScore: 100, passed: true, schemaVersion: 1, status: 'COMPLETED' });
    expect(JSON.stringify(result)).not.toContain('expectedValue');
    expect(JSON.stringify(result)).not.toContain('functionName');
  });

  it('returns a validated learner-safe lesson projection', async () => {
    const response = await request('/v1/lessons/budget-total');
    const body = (await response.json()).data;
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ id: 'budget-total', schemaVersion: 1, title: 'Calculate a budget total' });
    expect(body.instructions).toHaveLength(2);
    expect(body.hints).toHaveLength(1);
    expect(body.starterWorkbook.schemaVersion).toBe(1);
    expect(JSON.stringify(body)).not.toContain('evaluationRules');
    expect(JSON.stringify(body)).not.toContain('expectedValue');
    expect(JSON.stringify(body)).not.toContain('expectedValues');
    expect(JSON.stringify(body)).not.toContain('functionName');
    expect(JSON.stringify(body)).not.toContain('scoring');
  });

  it('returns 404 for an unknown lesson', async () => {
    const response = await request('/v1/lessons/missing-lesson');
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'LESSON_NOT_FOUND' } });
  });

  it('recalculates a correct workbook server-side', async () => {
    const response = await submit(workbookWith({ C2: { formula: '=SUM(B2:B4)' } }));
    const body = (await response.json()).data;
    expect(response.status).toBe(201);
    expect(body).toMatchObject({ earnedScore: 100, maxScore: 100, passed: true, schemaVersion: 1, status: 'COMPLETED' });
    expect(body.ruleResults).toHaveLength(3);
    expect(JSON.stringify(body)).not.toContain('expectedValue');
    expect(JSON.stringify(body)).not.toContain('evaluationRules');
    expect(JSON.stringify(body)).not.toContain('=SUM');
  });

  it('returns independent partial credit for an incorrect workbook', async () => {
    const response = await submit(workbookWith({ C2: { formula: '=SUM(B2:B3)' } }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ data: { earnedScore: 60, maxScore: 100, passed: false } });
  });

  it('rejects a hardcoded result when a FUNCTION_USED rule is required', async () => {
    const response = await submit(workbookWith({ C2: { value: 850 } }));
    const body = (await response.json()).data;
    expect(response.status).toBe(201);
    expect(body).toMatchObject({ earnedScore: 60, passed: false });
    expect(body.ruleResults[0]).toMatchObject({ feedbackCode: 'INCORRECT', pointsAwarded: 0, status: 'FAILED' });
  });

  it('rejects forged scores, passed flags, private rules, and answer keys at the request boundary', async () => {
    for (const forgedField of [
      { earnedScore: 100 },
      { passed: true },
      { evaluationRules: [] },
      { expectedValue: 850 },
    ]) {
      const response = await submit(workbookWith({ C2: { formula: '=SUM(B2:B4)' } }), forgedField);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVALID_SUBMISSION' } });
    }
  });

  it('rejects invalid workbooks and unsupported request schema versions safely', async () => {
    const invalidWorkbook = await submit({ schemaVersion: 1, id: 'invalid' });
    expect(invalidWorkbook.status).toBe(400);
    await expect(invalidWorkbook.json()).resolves.toMatchObject({ error: { code: 'INVALID_SUBMISSION' } });

    const invalidVersion = await request('/v1/lessons/budget-total/submissions', {
      body: JSON.stringify({ schemaVersion: 2, workbook: workbookWith() }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(invalidVersion.status).toBe(400);
    await expect(invalidVersion.json()).resolves.toMatchObject({ error: { code: 'INVALID_SUBMISSION' } });
  });

  it('returns a safe JSON response for malformed request bodies', async () => {
    const response = await request('/v1/lessons/budget-total/submissions', {
      body: '{',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: { code: 'INVALID_REQUEST', message: 'Request body is invalid.' } });
  });

  it('returns the same safe JSON response for oversized request bodies', async () => {
    const response = await request('/v1/lessons/budget-total/submissions', {
      body: JSON.stringify({ workbook: 'x'.repeat(1_100_000) }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: { code: 'INVALID_REQUEST', message: 'Request body is invalid.' } });
  });

  it('fails unsupported formulas safely without awarding their points', async () => {
    const response = await submit(workbookWith({ C2: { formula: '=UNKNOWN_FUNCTION(1)' } }));
    const body = (await response.json()).data;
    expect(response.status).toBe(201);
    expect(body).toMatchObject({ earnedScore: 20, passed: false });
    expect(body.ruleResults[0]).toMatchObject({ feedbackCode: 'UNSUPPORTED_FORMULA', pointsAwarded: 0 });
  });

  it('returns identical trusted results for identical submissions', async () => {
    const workbook = workbookWith({ C2: { formula: '=SUM(B2:B4)' } });
    const first = await submit(workbook);
    const second = await submit(workbook);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await first.json()).toEqual(await second.json());
  });

  it('does not leak internal exception details', async () => {
    const error = vi.spyOn(lessons, 'submitLesson').mockImplementation(() => {
      throw new Error('private expected value is 850');
    });
    try {
      const response = await submit(workbookWith({ C2: { formula: '=SUM(B2:B4)' } }));
      const body = await response.json();
      expect(response.status).toBe(500);
      expect(JSON.stringify(body)).not.toContain('850');
      expect(JSON.stringify(body)).not.toContain('private expected value');
      expect(body).toMatchObject({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    } finally {
      error.mockRestore();
    }
  });

  it('keeps the existing unauthenticated health endpoints functional', async () => {
    const live = await request('/health/live');
    expect(live.status).toBe(200);
    await expect(live.json()).resolves.toEqual({ status: 'ok', service: 'sheetquest-api' });

    const ready = await request('/health/ready');
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toEqual({ status: 'ok', database: 'connected' });
  });

  it('assigns and logs a safe request ID for each request', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      const response = await request('/health/live?access_token=private-value');
      const requestId = response.headers.get('x-request-id');

      expect(response.status).toBe(200);
      expect(requestId).toMatch(/^[0-9a-f-]{36}$/i);

      const requestLogs = log.mock.calls.filter(([entry]) => (
        typeof entry === 'object'
        && entry !== null
        && (entry as { requestId?: unknown }).requestId === requestId
      ));
      expect(requestLogs).toHaveLength(1);
      expect(requestLogs[0][0]).toMatchObject({
        requestId,
        method: 'GET',
        route: '/health/live',
        statusCode: 200,
      });
      expect(requestLogs[0][0]).not.toHaveProperty('query');
      expect(JSON.stringify(requestLogs[0][0])).not.toContain('private-value');
    } finally {
      log.mockRestore();
    }
  });
});
