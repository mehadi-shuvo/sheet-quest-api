import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedM02Content } from './m02-content.seed';

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('M02 content seed integration', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    if (process.env.NODE_ENV === 'production') throw new Error('Seed integration tests must not run in production.');
    await seedM02Content(prisma);
    await seedM02Content(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('maps all fixture lessons to immutable versions and one repeatable demo enrollment', async () => {
    const lessons = await prisma.lesson.findMany({
      where: { module: { courseVersion: { course: { slug: 'spreadsheet-fundamentals' } } } },
      orderBy: { position: 'asc' },
      select: {
        publicId: true,
        versions: {
          select: {
            activities: {
              select: { versions: { select: { contentFingerprint: true, privateDefinition: true, publicDefinition: true } } },
            },
          },
        },
      },
    });
    const learner = await prisma.user.findUnique({
      where: { email: 'demo.learner@example.test' },
      select: { enrollments: { where: { course: { slug: 'spreadsheet-fundamentals' } } } },
    });

    const activityVersions = lessons
      .flatMap(lesson => lesson.versions)
      .flatMap(version => version.activities)
      .flatMap(activity => activity.versions);

    expect(lessons.map(lesson => lesson.publicId)).toEqual(['budget-total', 'employee-performance', 'sales-analysis']);
    expect(activityVersions).toHaveLength(3);
    expect(activityVersions).toEqual(expect.arrayContaining([
      expect.objectContaining({ contentFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    ]));
    for (const version of activityVersions) {
      expect(version.privateDefinition).toHaveProperty('evaluationRules');
      expect(version.publicDefinition).not.toHaveProperty('evaluationRules');
    }
    expect(learner?.enrollments).toHaveLength(1);
  });
});
