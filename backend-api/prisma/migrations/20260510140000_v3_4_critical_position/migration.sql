-- V3.4 Story 4.8: flag de posto critico
ALTER TABLE "workplace_positions"
  ADD COLUMN "is_critical" BOOLEAN NOT NULL DEFAULT false;
