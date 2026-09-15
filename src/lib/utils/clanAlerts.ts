import { container } from '@sapphire/framework';
import * as Sentry from '@sentry/node';
import type { GuildTextBasedChannel } from 'discord.js';
import { createErrorEmbed, createInfoEmbed } from './createEmbed.js';
import { LogPrefix } from './logPrefix.js';

export type ClanAlertLevel = 'error' | 'info' | 'warning';

/**
 * Reports a clan infrastructure event (category overflow, channel limits) to the configured
 * alert channel, the logger and Sentry. Never throws: alerting must not break the flow it reports on.
 */
export async function sendClanAlert(
	guildId: string,
	message: string,
	level: ClanAlertLevel = 'warning',
): Promise<void> {
	const prefixedMessage = `${LogPrefix.CLAN} ${message}`;

	if (level === 'error') {
		container.logger.error(prefixedMessage);
	} else if (level === 'warning') {
		container.logger.warn(prefixedMessage);
	} else {
		container.logger.info(prefixedMessage);
	}

	Sentry.captureMessage(prefixedMessage, level === 'info' ? 'info' : level);

	try {
		const config = await container.prisma.premiumGuildRoleConfig.findUnique({
			where: { guildId },
			select: { clanAlertChannelId: true },
		});

		if (!config?.clanAlertChannelId) {
			return;
		}

		const guild = container.client.guilds.cache.get(guildId);
		const channel = (await guild?.channels.fetch(config.clanAlertChannelId).catch(() => null)) as
			| GuildTextBasedChannel
			| null
			| undefined;

		if (!channel?.isTextBased()) {
			return;
		}

		const embed = level === 'error' ? createErrorEmbed(message) : createInfoEmbed(message);
		await channel.send({ embeds: [embed] });
	} catch (error) {
		container.logger.error(`${LogPrefix.CLAN} Failed to deliver clan alert`, { guildId, error });
	}
}
