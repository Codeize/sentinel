/*
  Warnings:

  - You are about to drop the column `orphanSince` on the `clan` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "clan" DROP COLUMN "orphanSince",
ADD COLUMN     "deletionTaskId" TEXT;
