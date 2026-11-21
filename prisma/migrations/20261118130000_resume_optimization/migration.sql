ALTER TYPE "Creativity" RENAME VALUE 'EXPRESSIVE' TO 'OPTIMIZED';
UPDATE "Setting" SET "value" = 'OPTIMIZED' WHERE "key" = 'creativity' AND "value" = 'EXPRESSIVE';
DELETE FROM "Setting" WHERE "key" IN ('docLanguage', 'resumeLanguage', 'customLanguages');
