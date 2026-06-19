-- CreateTable
CREATE TABLE "clan_custom_commands" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "clanCustomRoleId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "responseText" TEXT,
    "responseMediaUrl" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clan_custom_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clan_custom_commands_guildId_clanCustomRoleId_idx" ON "clan_custom_commands"("guildId", "clanCustomRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "clan_custom_commands_guildId_trigger_key" ON "clan_custom_commands"("guildId", "trigger");

-- AddForeignKey
ALTER TABLE "clan_custom_commands" ADD CONSTRAINT "clan_custom_commands_guildId_clanCustomRoleId_fkey" FOREIGN KEY ("guildId", "clanCustomRoleId") REFERENCES "clan"("guildId", "customRoleId") ON DELETE CASCADE ON UPDATE CASCADE;
