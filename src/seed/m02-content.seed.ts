import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { budgetTotalLessonFixture } from '../lessons/fixtures/budget-total.lesson.fixture';
import { employeePerformanceLessonFixture } from '../lessons/fixtures/employee-performance.lesson.fixture';
import { salesAnalysisLessonFixture } from '../lessons/fixtures/sales-analysis.lesson.fixture';
import { toPublicLessonDefinition, type PrivateLessonDefinition } from '../lessons/lesson-definition.schema';

const lessons = [budgetTotalLessonFixture, employeePerformanceLessonFixture, salesAnalysisLessonFixture] as const;
const demoLearnerEmail = 'demo.learner@example.test';

type JsonRecord = { [key: string]: Prisma.InputJsonValue | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (isRecord(value)) return toJsonRecord(value);
  throw new Error('Fixture definition is not valid JSON.');
}

function toJsonRecord(value: Record<string, unknown>): Prisma.InputJsonObject {
  const result: JsonRecord = {};
  for (const [key, item] of Object.entries(value)) result[key] = toJsonValue(item);
  return result;
}

function fingerprint(definition: PrivateLessonDefinition) {
  return createHash('sha256').update(JSON.stringify(definition)).digest('hex');
}

export async function seedM02Content(prisma: PrismaClient) {
  return prisma.$transaction(async transaction => {
    const now = new Date();
    const course = await transaction.course.upsert({
      where: { slug: 'spreadsheet-fundamentals' },
      create: { slug: 'spreadsheet-fundamentals', status: 'PUBLISHED' },
      update: {},
    });
    const courseVersion = await transaction.courseVersion.upsert({
      where: { courseId_versionNumber: { courseId: course.id, versionNumber: 1 } },
      create: { courseId: course.id, publishedAt: now, status: 'PUBLISHED', versionNumber: 1 },
      update: {},
    });
    const module = await transaction.module.upsert({
      where: { courseVersionId_stableKey: { courseVersionId: courseVersion.id, stableKey: 'formula-foundations' } },
      create: { courseVersionId: courseVersion.id, position: 1, stableKey: 'formula-foundations' },
      update: {},
    });

    for (const [index, definition] of lessons.entries()) {
      const position = index + 1;
      const lesson = await transaction.lesson.upsert({
        where: { publicId: definition.id },
        create: { moduleId: module.id, position, publicId: definition.id, stableKey: definition.id },
        update: {},
      });
      const lessonVersion = await transaction.lessonVersion.upsert({
        where: { lessonId_versionNumber: { lessonId: lesson.id, versionNumber: 1 } },
        create: { lessonId: lesson.id, publishedAt: now, status: 'PUBLISHED', versionNumber: 1 },
        update: {},
      });
      const activity = await transaction.activity.upsert({
        where: { lessonVersionId_stableKey: { lessonVersionId: lessonVersion.id, stableKey: 'spreadsheet' } },
        create: { kind: 'SPREADSHEET', lessonVersionId: lessonVersion.id, position: 1, stableKey: 'spreadsheet' },
        update: {},
      });
      const contentFingerprint = fingerprint(definition);
      const existing = await transaction.activityVersion.findUnique({
        where: { activityId_versionNumber: { activityId: activity.id, versionNumber: 1 } },
        select: { contentFingerprint: true },
      });
      if (existing && existing.contentFingerprint !== contentFingerprint) {
        throw new Error(`Seed refuses to overwrite immutable activity content for ${definition.id}.`);
      }
      await transaction.activityVersion.upsert({
        where: { activityId_versionNumber: { activityId: activity.id, versionNumber: 1 } },
        create: {
          activityId: activity.id,
          contentFingerprint,
          privateDefinition: toJsonRecord(definition),
          publicDefinition: toJsonRecord(toPublicLessonDefinition(definition)),
          publishedAt: now,
          versionNumber: 1,
        },
        update: {},
      });
    }

    const learner = await transaction.user.upsert({
      where: { email: demoLearnerEmail },
      create: { email: demoLearnerEmail },
      update: {},
    });
    await transaction.enrollment.upsert({
      where: { userId_courseId: { courseId: course.id, userId: learner.id } },
      create: { courseId: course.id, userId: learner.id },
      update: {},
    });

    return { courseId: course.id, learnerId: learner.id, lessonCount: lessons.length };
  });
}
