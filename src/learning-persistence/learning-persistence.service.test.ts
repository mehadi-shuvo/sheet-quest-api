import { describe, expect, it, vi } from 'vitest';
import { budgetTotalLessonFixture } from '../lessons/fixtures/budget-total.lesson.fixture';
import { type PrismaService } from '../prisma.service';
import { LearningPersistenceError, LearningPersistenceService } from './learning-persistence.service';

const userId = '11111111-1111-4111-8111-111111111111';
const activityVersionId = '22222222-2222-4222-8222-222222222222';
const contentFingerprint = 'budget-total-v1';

function createPrisma() {
  const transaction = {
    activityProgress: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    activitySubmission: {
      create: vi.fn().mockResolvedValue({ id: 'submission-id' }),
      findUnique: vi.fn().mockResolvedValue({ id: 'submission-id' }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) => operation(transaction)),
    activityDraft: { create: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    activityVersion: { findUnique: vi.fn().mockResolvedValue({ contentFingerprint }) },
    user: { findUnique: vi.fn().mockResolvedValue({ id: userId }) },
  };
  return { prisma, transaction };
}

describe('LearningPersistenceService', () => {
  it('creates the first draft only for the activity content version it validates', async () => {
    const { prisma } = createPrisma();
    const service = new LearningPersistenceService(prisma as unknown as PrismaService);

    await expect(service.saveDraft({
      activityVersionId,
      contentFingerprint,
      expectedRevision: 0,
      userId,
      workbook: budgetTotalLessonFixture.starterWorkbook,
    })).resolves.toEqual({ revision: 1 });

    expect(prisma.activityDraft.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ activityVersionId, contentFingerprint, revision: 1, userId }),
    }));
  });

  it('rejects a draft when the supplied content fingerprint is stale', async () => {
    const { prisma } = createPrisma();
    const service = new LearningPersistenceService(prisma as unknown as PrismaService);

    await expect(service.saveDraft({
      activityVersionId,
      contentFingerprint: 'stale-content',
      expectedRevision: 0,
      userId,
      workbook: budgetTotalLessonFixture.starterWorkbook,
    })).rejects.toMatchObject<Partial<LearningPersistenceError>>({ code: 'CONTENT_VERSION_MISMATCH' });

    expect(prisma.activityDraft.create).not.toHaveBeenCalled();
  });

  it('returns a deterministic conflict when the stored draft revision differs', async () => {
    const { prisma } = createPrisma();
    prisma.activityDraft.updateMany.mockResolvedValue({ count: 0 });
    const service = new LearningPersistenceService(prisma as unknown as PrismaService);

    await expect(service.saveDraft({
      activityVersionId,
      contentFingerprint,
      expectedRevision: 3,
      userId,
      workbook: budgetTotalLessonFixture.starterWorkbook,
    })).rejects.toMatchObject<Partial<LearningPersistenceError>>({ code: 'DRAFT_CONFLICT' });
  });

  it('returns a deterministic conflict when concurrent first-draft writes race', async () => {
    const { prisma } = createPrisma();
    prisma.activityDraft.create.mockRejectedValue({ code: 'P2002' });
    const service = new LearningPersistenceService(prisma as unknown as PrismaService);

    await expect(service.saveDraft({
      activityVersionId,
      contentFingerprint,
      expectedRevision: 0,
      userId,
      workbook: budgetTotalLessonFixture.starterWorkbook,
    })).rejects.toMatchObject<Partial<LearningPersistenceError>>({ code: 'DRAFT_CONFLICT' });
  });

  it('scopes a draft update to its owner as well as its version and revision', async () => {
    const { prisma } = createPrisma();
    const ownerId = '33333333-3333-4333-8333-333333333333';
    const service = new LearningPersistenceService(prisma as unknown as PrismaService);

    await service.saveDraft({
      activityVersionId,
      contentFingerprint,
      expectedRevision: 1,
      userId: ownerId,
      workbook: budgetTotalLessonFixture.starterWorkbook,
    });

    expect(prisma.activityDraft.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { activityVersionId, revision: 1, userId: ownerId },
    }));
  });

  it('records an idempotent trusted submission and completes progress only from the trusted result', async () => {
    const { prisma, transaction } = createPrisma();
    const service = new LearningPersistenceService(prisma as unknown as PrismaService);

    await service.recordTrustedSubmission({
      activityVersionId,
      idempotencyKey: 'submission-1',
      trustedResult: {
        earnedScore: 100,
        maxScore: 100,
        passed: true,
        ruleResults: [{ feedbackCode: 'RULE_PASSED', pointsAwarded: 100, ruleIndex: 0, status: 'PASSED' }],
        schemaVersion: 1,
        status: 'COMPLETED',
      },
      userId,
      workbook: budgetTotalLessonFixture.starterWorkbook,
    });

    expect(transaction.activitySubmission.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ activityVersionId, idempotencyKey: 'submission-1', userId }),
    }));
    expect(transaction.activityProgress.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ activityVersionId, status: 'COMPLETED', userId }),
    }));
  });

  it('returns the original submission on an idempotency replay without changing progress', async () => {
    const { prisma, transaction } = createPrisma();
    transaction.activitySubmission.create.mockRejectedValue({ code: 'P2002' });
    transaction.activitySubmission.findUnique.mockResolvedValue({ id: 'existing-submission' });
    const service = new LearningPersistenceService(prisma as unknown as PrismaService);

    await expect(service.recordTrustedSubmission({
      activityVersionId,
      idempotencyKey: 'submission-1',
      trustedResult: {
        earnedScore: 100,
        maxScore: 100,
        passed: true,
        ruleResults: [{ feedbackCode: 'RULE_PASSED', pointsAwarded: 100, ruleIndex: 0, status: 'PASSED' }],
        schemaVersion: 1,
        status: 'COMPLETED',
      },
      userId,
      workbook: budgetTotalLessonFixture.starterWorkbook,
    })).resolves.toEqual({ id: 'existing-submission' });

    expect(transaction.activityProgress.create).not.toHaveBeenCalled();
    expect(transaction.activityProgress.update).not.toHaveBeenCalled();
  });
});
