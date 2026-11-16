ALTER TABLE "Document" ADD COLUMN "state" JSONB;
ALTER TABLE "DocumentVersion" ADD COLUMN "state" JSONB;
ALTER TABLE "ChatMessage" ADD COLUMN "documentChanges" JSONB;
