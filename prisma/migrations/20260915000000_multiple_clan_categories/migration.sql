-- Move the single clan category to an ordered list of categories, preserving the configured one.
ALTER TABLE "premium_guild_role_configs" ADD COLUMN "clanCategoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "premium_guild_role_configs"
SET "clanCategoryIds" = ARRAY["clanCategoryId"]
WHERE "clanCategoryId" IS NOT NULL;

ALTER TABLE "premium_guild_role_configs" DROP COLUMN "clanCategoryId";

-- Channel receiving clan infrastructure alerts (category overflow, guild channel limit).
ALTER TABLE "premium_guild_role_configs" ADD COLUMN "clanAlertChannelId" TEXT;
