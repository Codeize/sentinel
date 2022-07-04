let cachedGuildIds: string[] = null!;

export function useGuildIdsToSyncBansIn() {
	cachedGuildIds ??= process.env.GUILD_IDS_TO_SYNC_BANS_IN!.split(',').map((item) => item.trim());

	return cachedGuildIds;
}
