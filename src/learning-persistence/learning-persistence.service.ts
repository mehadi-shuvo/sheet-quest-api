import { Injectable } from '@nestjs/common';
import { Prisma, type ActivityProgressStatus } from '@prisma/client';
import { z } from 'zod';
import { canonicalWorkbookV1Schema } from '../lessons/lesson-definition.schema';
import { PrismaService } from '../prisma.service';

const identifierSchema = z.string().uuid();
const contentFingerprintSchema = z.string().min(1).max(128);
const idempotencyKeySchema = z.string().min(1).max(128);
const trustedResultSchema = z.object({
  earnedScore: z.number().int().min(0),
  maxScore: z.number().int().min(1),
  passed: z.boolean(),
  ruleResults: z.array(z.object({
    feedbackCode: z.string().min(1).max(100),
    pointsAwarded: z.number().int().min(0),
    ruleIndex: z.number().int().min(0),
    status: z.enum(['FAILED', 'PASSED']),
  }).strict()),
  schemaVersion: z.literal(1),
  status: z.literal('COMPLETED'),
}).strict().superRefine((result, context) => {
  if (result.earnedScore > result.maxScore) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'earnedScore must not exceed maxScore.' });
  }
});

const enrollmentInputSchema = z.object({ courseId: identifierSchema, userId: identifierSchema }).strict();
const draftInputSchema = z.object({
  activityVersionId: identifierSchema,
  contentFingerprint: contentFingerprintSchema,
  expectedRevision: z.number().int().min(0),
  expiresAt: z.date().nullable().optional(),
  userId: identifierSchema,
  workbook: canonicalWorkbookV1Schema,
}).strict();
const submissionInputSchema = z.object({
  activityVersionId: identifierSchema,
  idempotencyKey: idempotencyKeySchema,
  trustedResult: trustedResultSchema,
  userId: identifierSchema,
  workbook: canonicalWorkbookV1Schema,
}).strict();

type JsonRecord = { [key: string]: Prisma.InputJsonValue | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new LearningPersistenceError('INVALID_INPUT', 'Persistence input is not valid JSON.');
    return value;
  }
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (isRecord(value)) return toJsonRecord(value);
  throw new LearningPersistenceError('INVALID_INPUT', 'Persistence input is not valid JSON.');
}

function toJsonRecord(value: Record<string, unknown>): Prisma.InputJsonObject {
  const result: JsonRecord = {};
  for (const [key, item] of Object.entries(value)) result[key] = toJsonValue(item);
  return result;
}

export type LearningPersistenceErrorCode = 'CONTENT_NOT_FOUND' | 'CONTENT_VERSION_MISMATCH' | 'DRAFT_CONFLICT' | 'INVALID_INPUT' | 'USER_NOT_FOUND';

export class LearningPersistenceError extends Error {
  constructor(public readonly code: LearningPersistenceErrorCode, message: string) {
    super(message);
    this.name = 'LearningPersistenceError';
  }
}

@Injectable()
export class LearningPersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  async enroll(input: unknown) {
    const data = enrollmentInputSchema.parse(input);
    await this.requireUser(data.userId);
    return this.prisma.enrollment.upsert({
      where: { userId_courseId: { courseId: data.courseId, userId: data.userId } },
      create: { courseId: data.courseId, userId: data.userId },
      update: {},
    });
  }

  async saveDraft(input: unknown): Promise<{ revision: number }> {
    const data = draftInputSchema.parse(input);
    const activityVersion = await this.requireActivityVersion(data.activityVersionId);
    await this.requireUser(data.userId);
    if (activityVersion.contentFingerprint !== data.contentFingerprint) {
      throw new LearningPersistenceError('CONTENT_VERSION_MISMATCH', 'Draft content version does not match this activity.');
    }
    const workbookSnapshot = toJsonRecord(data.workbook);
    const expiresAt = data.expiresAt ?? undefined;
    if (data.expectedRevision === 0) {
      try {
        await this.prisma.activityDraft.create({
          data: {
            activityVersionId: data.activityVersionId,
            contentFingerprint: data.contentFingerprint,
            expiresAt,
            revision: 1,
            userId: data.userId,
            workbookSnapshot,
          },
        });
        return { revision: 1 };
      } catch (error) {
        if (this.isUniqueConstraint(error)) {
          throw new LearningPersistenceError('DRAFT_CONFLICT', 'Draft has already changed. Refresh before saving again.');
        }
        throw error;
      }
    }
    const updated = await this.prisma.activityDraft.updateMany({
      where: { activityVersionId: data.activityVersionId, revision: data.expectedRevision, userId: data.userId },
      data: { contentFingerprint: data.contentFingerprint, expiresAt, revision: { increment: 1 }, workbookSnapshot },
    });
    if (updated.count !== 1) {
      throw new LearningPersistenceError('DRAFT_CONFLICT', 'Draft has changed or is unavailable. Refresh before saving again.');
    }
    return { revision: data.expectedRevision + 1 };
  }

  async recordTrustedSubmission(input: unknown) {
    const data = submissionInputSchema.parse(input);
    const activityVersion = await this.requireActivityVersion(data.activityVersionId);
    await this.requireUser(data.userId);
    const workbookSnapshot = toJsonRecord(data.workbook);
    const trustedResult = toJsonRecord(data.trustedResult);
    return this.prisma.$transaction(async (transaction) => {
      const identity = {
        userId_activityVersionId_idempotencyKey: {
            activityVersionId: data.activityVersionId,
            idempotencyKey: data.idempotencyKey,
            userId: data.userId,
        },
      };
      try {
        const submission = await transaction.activitySubmission.create({
          data: {
          activityVersionId: data.activityVersionId,
          contentFingerprint: activityVersion.contentFingerprint,
          idempotencyKey: data.idempotencyKey,
          trustedResult,
          userId: data.userId,
          workbookSnapshot,
          },
        });
        await this.updateProgress(transaction, data.userId, data.activityVersionId, data.trustedResult.passed);
        return submission;
      } catch (error) {
        if (!this.isUniqueConstraint(error)) throw error;
        const existing = await transaction.activitySubmission.findUnique({ where: identity });
        if (!existing) throw error;
        return existing;
      }
    });
  }

  private async requireUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new LearningPersistenceError('USER_NOT_FOUND', 'Learner record was not found.');
  }

  private async requireActivityVersion(activityVersionId: string) {
    const activityVersion = await this.prisma.activityVersion.findUnique({
      where: { id: activityVersionId },
      select: { contentFingerprint: true },
    });
    if (!activityVersion) throw new LearningPersistenceError('CONTENT_NOT_FOUND', 'Activity version was not found.');
    return activityVersion;
  }

  private async updateProgress(
    transaction: Prisma.TransactionClient,
    userId: string,
    activityVersionId: string,
    passed: boolean
  ) {
    const progress = await transaction.activityProgress.findUnique({
      where: { userId_activityVersionId: { activityVersionId, userId } },
      select: { status: true },
    });
    if (!progress) {
      await transaction.activityProgress.create({
        data: {
          activityVersionId,
          ...(passed ? { completedAt: new Date(), status: 'COMPLETED' as ActivityProgressStatus } : {}),
          userId,
        },
      });
      return;
    }
    if (passed && progress.status !== 'COMPLETED') {
      await transaction.activityProgress.update({
        where: { userId_activityVersionId: { activityVersionId, userId } },
        data: { completedAt: new Date(), status: 'COMPLETED' },
      });
    }
  }

  private isUniqueConstraint(error: unknown) {
    return isRecord(error) && error.code === 'P2002';
  }
}
