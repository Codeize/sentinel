import { container } from '@sapphire/framework';

export const cache = new Map<string, true>();

export async function loadMediaOnlyChannels() {
	const channels = await container.prisma.messageOnlyChannel.findMany();

	for (const channel of channels) {
		cache.set(channel.channel_id, true);
	}

	container.logger.info(`[MEDIA ONLY] Loaded ${channels.length} media-only channels in cache`);
}

export function isMediaOnlyChannel(channelId: string) {
	return cache.has(channelId);
}

export async function addMediaOnlyChannel(channelId: string, guildId: string) {
	await container.prisma.messageOnlyChannel.create({
		data: {
			channel_id: channelId,
			guild_id: guildId,
		},
	});

	cache.set(channelId, true);
}

export async function removeMediaOnlyChannel(channelId: string) {
	await container.prisma.messageOnlyChannel.deleteMany({
		where: {
			channel_id: channelId,
		},
	});

	cache.delete(channelId);
}
