BEGIN IMMEDIATE;
CREATE TABLE "TrainingLesson" (
 "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "title" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'DRAFT', "configJson" TEXT NOT NULL,
 "approvedBy" TEXT, "approvedAt" DATETIME, "createdBy" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "TrainingLesson_workspaceId_createdAt_idx" ON "TrainingLesson"("workspaceId","createdAt");
CREATE TABLE "TrainingRound" (
 "id" TEXT NOT NULL PRIMARY KEY, "lessonId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL,
 "name" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'READY', "seed" TEXT NOT NULL,
 "fixtureHash" TEXT NOT NULL, "configJson" TEXT NOT NULL, "truthJson" TEXT NOT NULL,
 "assessmentJson" TEXT, "startedAt" DATETIME, "submittedAt" DATETIME,
 "reviewedAt" DATETIME, "reviewedBy" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 FOREIGN KEY ("lessonId") REFERENCES "TrainingLesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TrainingRound_workspaceId_key" ON "TrainingRound"("workspaceId");
CREATE INDEX "TrainingRound_lessonId_idx" ON "TrainingRound"("lessonId");
CREATE TABLE "TrainingEvent" (
 "id" TEXT NOT NULL PRIMARY KEY, "roundId" TEXT NOT NULL, "operationKey" TEXT NOT NULL,
 "actor" TEXT NOT NULL, "actorRole" TEXT NOT NULL, "type" TEXT NOT NULL,
 "success" BOOLEAN NOT NULL, "detailsJson" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("roundId") REFERENCES "TrainingRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TrainingEvent_roundId_operationKey_key" ON "TrainingEvent"("roundId","operationKey");
CREATE INDEX "TrainingEvent_roundId_createdAt_idx" ON "TrainingEvent"("roundId","createdAt");
CREATE TABLE "ResearchForm" (
 "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "title" TEXT NOT NULL,
 "kind" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "configJson" TEXT NOT NULL,
 "approvedAt" DATETIME, "approvedBy" TEXT, "createdBy" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ResearchForm_workspaceId_createdAt_idx" ON "ResearchForm"("workspaceId","createdAt");
CREATE TABLE "ResearchResponse" (
 "id" TEXT NOT NULL PRIMARY KEY, "formId" TEXT NOT NULL, "userId" TEXT NOT NULL,
 "respondentCode" TEXT NOT NULL, "answersJson" TEXT NOT NULL,
 "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("formId") REFERENCES "ResearchForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ResearchResponse_formId_userId_key" ON "ResearchResponse"("formId","userId");
CREATE TRIGGER "TrainingLesson_training_insert" BEFORE INSERT ON "TrainingLesson"
WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE "id"=NEW."workspaceId" AND "type"='TRAINING')
BEGIN SELECT RAISE(ABORT,'training workspace required'); END;
CREATE TRIGGER "TrainingLesson_training_update" BEFORE UPDATE ON "TrainingLesson"
WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE "id"=NEW."workspaceId" AND "type"='TRAINING')
BEGIN SELECT RAISE(ABORT,'training workspace required'); END;
CREATE TRIGGER "TrainingRound_training_insert" BEFORE INSERT ON "TrainingRound"
WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE "id"=NEW."workspaceId" AND "type"='TRAINING')
 OR EXISTS(SELECT 1 FROM "TrainingLesson" WHERE "id"=NEW."lessonId" AND "workspaceId"=NEW."workspaceId")
BEGIN SELECT RAISE(ABORT,'separate training workspace required'); END;
CREATE TRIGGER "TrainingRound_training_update" BEFORE UPDATE ON "TrainingRound"
WHEN NEW."workspaceId"!=OLD."workspaceId" OR NEW."lessonId"!=OLD."lessonId" OR NEW."truthJson"!=OLD."truthJson" OR NEW."configJson"!=OLD."configJson" OR NEW."seed"!=OLD."seed" OR NEW."fixtureHash"!=OLD."fixtureHash"
BEGIN SELECT RAISE(ABORT,'round fixture is immutable'); END;
CREATE TRIGGER "ResearchForm_training_insert" BEFORE INSERT ON "ResearchForm"
WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE "id"=NEW."workspaceId" AND "type"='TRAINING')
BEGIN SELECT RAISE(ABORT,'training workspace required'); END;
CREATE TRIGGER "ResearchForm_training_update" BEFORE UPDATE ON "ResearchForm"
WHEN NOT EXISTS(SELECT 1 FROM "Workspace" WHERE "id"=NEW."workspaceId" AND "type"='TRAINING')
BEGIN SELECT RAISE(ABORT,'training workspace required'); END;
CREATE TRIGGER "ResearchResponse_immutable" BEFORE UPDATE ON "ResearchResponse"
BEGIN SELECT RAISE(ABORT,'submitted response is immutable'); END;
COMMIT;
