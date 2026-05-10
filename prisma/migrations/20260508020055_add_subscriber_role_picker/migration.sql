-- AlterTable
ALTER TABLE "premium_guild_role_configs" ADD COLUMN     "pickableRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "role_abilities" ADD COLUMN     "canPickSubscriberRole" BOOLEAN NOT NULL DEFAULT false;
