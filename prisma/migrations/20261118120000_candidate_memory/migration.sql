-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "matchMemoryRevision" INTEGER;

-- AlterTable
ALTER TABLE "AgentCandidate" ADD COLUMN     "memoryRevision" INTEGER;

-- AlterTable
ALTER TABLE "PostingScore" ADD COLUMN     "memoryRevision" INTEGER;

-- AlterTable
ALTER TABLE "Startup" ADD COLUMN     "memoryRevision" INTEGER;

-- CreateTable
CREATE TABLE "MemoryFact" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "fingerprint" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "capabilities" JSONB NOT NULL,
    "experienceId" TEXT,
    "projectId" TEXT,
    "attribution" JSONB NOT NULL,
    "supersededById" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "assertedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemorySource" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "previousText" TEXT NOT NULL DEFAULT '',
    "context" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "extraction" JSONB,
    "extractedWith" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "profileEpoch" INTEGER NOT NULL DEFAULT 0,
    "applicationId" TEXT,
    "messageId" TEXT,
    "factId" TEXT,
    "documentId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "MemorySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryEvidence" (
    "sourceId" TEXT NOT NULL,
    "memoryFactId" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MemoryEvidence_pkey" PRIMARY KEY ("sourceId","memoryFactId")
);

-- CreateTable
CREATE TABLE "MemoryState" (
    "id" TEXT NOT NULL DEFAULT 'memory',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "nextSourceSequence" INTEGER NOT NULL DEFAULT 0,
    "profileEpoch" INTEGER NOT NULL DEFAULT 0,
    "fingerprintKey" TEXT NOT NULL,
    "backfill" JSONB,
    "paused" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MemoryState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemoryFact_fingerprint_key" ON "MemoryFact"("fingerprint");

-- CreateIndex
CREATE INDEX "MemoryFact_status_createdAt_idx" ON "MemoryFact"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MemorySource_sequence_key" ON "MemorySource"("sequence");

-- CreateIndex
CREATE INDEX "MemorySource_status_sequence_idx" ON "MemorySource"("status", "sequence");

-- CreateIndex
CREATE INDEX "MemorySource_applicationId_idx" ON "MemorySource"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "MemorySource_sourceKey_revision_key" ON "MemorySource"("sourceKey", "revision");

-- CreateIndex
CREATE INDEX "MemoryEvidence_memoryFactId_idx" ON "MemoryEvidence"("memoryFactId");

-- AddForeignKey
ALTER TABLE "MemoryFact" ADD CONSTRAINT "MemoryFact_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryFact" ADD CONSTRAINT "MemoryFact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryFact" ADD CONSTRAINT "MemoryFact_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "MemoryFact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemorySource" ADD CONSTRAINT "MemorySource_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemorySource" ADD CONSTRAINT "MemorySource_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemorySource" ADD CONSTRAINT "MemorySource_factId_fkey" FOREIGN KEY ("factId") REFERENCES "Fact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemorySource" ADD CONSTRAINT "MemorySource_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryEvidence" ADD CONSTRAINT "MemoryEvidence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "MemorySource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryEvidence" ADD CONSTRAINT "MemoryEvidence_memoryFactId_fkey" FOREIGN KEY ("memoryFactId") REFERENCES "MemoryFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

