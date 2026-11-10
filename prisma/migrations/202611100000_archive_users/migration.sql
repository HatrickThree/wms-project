BEGIN;
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD CONSTRAINT "User_deleted_requires_disabled"
  CHECK ("deletedAt" IS NULL OR "disabled");
COMMIT;
