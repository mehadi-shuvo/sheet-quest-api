-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ActivityProgressStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Enrollment_completion_state_check" CHECK (("status" = 'COMPLETED' AND "completedAt" IS NOT NULL) OR ("status" <> 'COMPLETED' AND "completedAt" IS NULL))
);

-- CreateTable
CREATE TABLE "ActivityProgress" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "activityVersionId" UUID NOT NULL,
    "status" "ActivityProgressStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityProgress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ActivityProgress_completion_state_check" CHECK (("status" = 'COMPLETED' AND "completedAt" IS NOT NULL) OR ("status" = 'IN_PROGRESS' AND "completedAt" IS NULL))
);

-- CreateTable
CREATE TABLE "ActivitySubmission" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "activityVersionId" UUID NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "contentFingerprint" VARCHAR(128) NOT NULL,
    "workbookSnapshot" JSONB NOT NULL,
    "trustedResult" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivitySubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityDraft" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "activityVersionId" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "contentFingerprint" VARCHAR(128) NOT NULL,
    "workbookSnapshot" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityDraft_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ActivityDraft_revision_check" CHECK ("revision" >= 0)
);

-- CreateIndex
CREATE INDEX "Enrollment_courseId_idx" ON "Enrollment"("courseId");

-- CreateIndex
CREATE INDEX "Enrollment_userId_idx" ON "Enrollment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_userId_courseId_key" ON "Enrollment"("userId", "courseId");

-- CreateIndex
CREATE INDEX "ActivityProgress_activityVersionId_idx" ON "ActivityProgress"("activityVersionId");

-- CreateIndex
CREATE INDEX "ActivityProgress_userId_updatedAt_idx" ON "ActivityProgress"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityProgress_userId_activityVersionId_key" ON "ActivityProgress"("userId", "activityVersionId");

-- CreateIndex
CREATE INDEX "ActivitySubmission_activityVersionId_submittedAt_idx" ON "ActivitySubmission"("activityVersionId", "submittedAt");

-- CreateIndex
CREATE INDEX "ActivitySubmission_userId_submittedAt_idx" ON "ActivitySubmission"("userId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActivitySubmission_userId_activityVersionId_idempotencyKey_key" ON "ActivitySubmission"("userId", "activityVersionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ActivityDraft_activityVersionId_idx" ON "ActivityDraft"("activityVersionId");

-- CreateIndex
CREATE INDEX "ActivityDraft_userId_updatedAt_idx" ON "ActivityDraft"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityDraft_userId_activityVersionId_key" ON "ActivityDraft"("userId", "activityVersionId");

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityProgress" ADD CONSTRAINT "ActivityProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityProgress" ADD CONSTRAINT "ActivityProgress_activityVersionId_fkey" FOREIGN KEY ("activityVersionId") REFERENCES "ActivityVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySubmission" ADD CONSTRAINT "ActivitySubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySubmission" ADD CONSTRAINT "ActivitySubmission_activityVersionId_fkey" FOREIGN KEY ("activityVersionId") REFERENCES "ActivityVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDraft" ADD CONSTRAINT "ActivityDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDraft" ADD CONSTRAINT "ActivityDraft_activityVersionId_fkey" FOREIGN KEY ("activityVersionId") REFERENCES "ActivityVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
