-- V3.4 Story 4.19: dispensa explicita de cobertura
ALTER TABLE "vacation_requests"
  ADD COLUMN "coverage_waived"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "coverage_waiver_reason"  TEXT;
