-- AlterTable
ALTER TABLE "role_abilities" ADD COLUMN     "canUploadCustomEmoji" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "custom_emojis" (
    "emojiId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_emojis_pkey" PRIMARY KEY ("emojiId")
);

-- CreateIndex
CREATE INDEX "custom_emojis_guildId_userId_idx" ON "custom_emojis"("guildId", "userId");
