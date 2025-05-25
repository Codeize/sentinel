/*
  Warnings:

  - The `deletionTaskId` column on the `clan` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "clan" DROP COLUMN "deletionTaskId",
ADD COLUMN     "deletionTaskId" INTEGER;
