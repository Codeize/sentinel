-- CreateTable
CREATE TABLE "forbidden_role_names" (
    "guildId" TEXT NOT NULL,
    "rawPattern" TEXT NOT NULL,
    "processedPattern" TEXT NOT NULL,

    CONSTRAINT "forbidden_role_names_pkey" PRIMARY KEY ("guildId","rawPattern")
);
