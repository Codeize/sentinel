//import { container } from '@sapphire/framework';
import type { GuildTextBasedChannel, Message, Role } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { MAX_MEMBERS_IN_CLAN } from '../lib/abilities/ClanManager.js';
import { Task } from '../lib/schedule/tasks/Task.js';
import { createInfoEmbed } from '../lib/utils/createEmbed.js';

const header = '[CLAN DIRECTORY] ';
const clansPerPage = 10; // Number of clans to show per embed page

export class UpdateClanDirectory extends Task {
	public async run() {
		this.container.logger.info(`${header}Starting clan directory update...`);

		// Fetch all clans including their members to get the count
		const allClans = await this.container.prisma.clan.findMany({
			include: { members: true },
		});
		// --- Add Log ---
		this.container.logger.info(`${header}Fetched ${allClans.length} total clans from DB.`);

		if (allClans.length === 0) {
			this.container.logger.info(`${header}No clans found. Will attempt to update message to empty state.`);
			// Continue execution even if empty to update the message
		}

		// Group clans by guild ID for efficient processing
		const clansByGuild = allClans.reduce((map, clan) => {
			const clans = map.get(clan.guildId) ?? [];
			clans.push(clan);
			map.set(clan.guildId, clans);
			return map;
		}, new Map<string, typeof allClans>());
		// --- Add Log ---
		this.container.logger.info(`${header}Grouped clans into ${clansByGuild.size} guilds.`);

		// Process each guild that has clans
		for (const [guildId, clans] of clansByGuild.entries()) {
			// --- Add Log ---
			this.container.logger.info(`${header}Processing guild ${guildId} with ${clans.length} clans.`);

			const guild = this.container.client.guilds.cache.get(guildId);
			if (!guild) {
				this.container.logger.warn(`${header}Skipping guild ${guildId}: Guild not found in cache.`);
				continue; // Skip if guild isn't cached (bot might not be in it anymore)
			}

			// Fetch the guild's specific configuration for the directory
			const config = await this.container.prisma.premiumGuildRoleConfig.findFirst({
				where: { guildId },
			});
			// --- Add Log ---
			this.container.logger.info(
				`${header}Found config for guild ${guildId}. Channel: ${config?.clanDirectoryChannelId}, Message: ${config?.clanDirectoryMessageId}`,
			);

			// Skip if the directory channel or message ID isn't configured
			if (!config?.clanDirectoryChannelId || !config.clanDirectoryMessageId) {
				this.container.logger.debug(
					`${header}Skipping guild ${guild.name} (${guildId}): Directory channel or message ID not configured.`,
				);
				continue;
			}

			const channel = (await guild.channels
				.fetch(config.clanDirectoryChannelId)
				.catch(() => null)) as GuildTextBasedChannel | null;

			if (!channel || !channel.isTextBased()) {
				this.container.logger.warn(
					`${header}Skipping guild ${guild.name} (${guildId}): Directory channel ${config.clanDirectoryChannelId} not found or is not a text channel.`,
				);
				continue;
			}

			let message: Message | null = null;
			try {
				message = await channel.messages.fetch(config.clanDirectoryMessageId);
			} catch {
				this.container.logger.warn(
					`${header}Directory message ${config.clanDirectoryMessageId} not found in channel ${config.clanDirectoryChannelId} for guild ${guild.name} (${guildId}). Attempting to recreate.`,
				);

				try {
					message = await channel.send({ embeds: [createInfoEmbed('Clan Directory is initializing...')] });
					await this.container.prisma.premiumGuildRoleConfig.update({
						where: { guildId },
						data: { clanDirectoryMessageId: message.id },
					});
					this.container.logger.info(
						`${header}Recreated directory message with new ID: ${message.id} for guild ${guild.name} (${guildId})`,
					);
				} catch (error) {
					this.container.logger.error(
						`${header}Failed to recreate directory message for guild ${guild.name} (${guildId})`,
						error,
					);
					continue; //skip guild
				}
			}

			if (!message) {
				this.container.logger.error(
					`${header}Could not fetch or recreate message for guild ${guildId}. Skipping.`,
				);
				continue;
			}

			const allClansData: ClanDirectoryData[] = [];
			for (const clan of clans) {
				const clanRole = (await guild.roles.fetch(clan.customRoleId).catch(() => null)) as Role | null;
				if (!clanRole) {
					this.container.logger.warn(
						`${header}Clan role ${clan.customRoleId} not found for clan in guild ${guild.name} (${guildId}). Skipping this clan.`,
					);
					continue; // Skip this clan if its role is gone
				}

				const premiumMember = await this.container.prisma.premiumMember.findFirst({
					where: { guildId: clan.guildId, customRoleId: clan.customRoleId },
				});

				allClansData.push({
					name: clanRole.name,
					description: clan.description ?? 'No description set.', // Use default if null
					memberCount: clan.members.length,
					ownerId: premiumMember?.userId, // Owner ID might be null if data is inconsistent
				});
			}
			// --- Add Log ---
			this.container.logger.info(`${header}Prepared data for ${allClansData.length} clans in guild ${guildId}.`);

			// Sort clans (e.g., by member count descending)
			allClansData.sort((a, b) => b.memberCount - a.memberCount);

			// Format clan entries
			const clanEntries = allClansData.map((data, index) => this.formatClanEntry(data, index + 1));

			// Manually chunk the entries into embed descriptions
			const embeds: EmbedBuilder[] = [];
			const baseEmbed = createInfoEmbed(null).setTitle(`✨ ${guild.name} Clan Directory ✨`);

			if (clanEntries.length === 0) {
				embeds.push(EmbedBuilder.from(baseEmbed).setDescription('There are currently no clans to display.'));
			} else {
				for (let i = 0; i < clanEntries.length; i += clansPerPage) {
					const chunk = clanEntries.slice(i, i + clansPerPage);
					embeds.push(
						EmbedBuilder.from(baseEmbed)
							.setDescription(chunk.join('\n\n')) // Join the strings for the description
							.setFooter({
								text: `Page ${Math.floor(i / clansPerPage) + 1} of ${Math.ceil(clanEntries.length / clansPerPage)} | Total Clans: ${allClansData.length}`,
							}),
					);
				}
			}

			// Ensure we have at least one embed, even if empty
			if (embeds.length === 0) {
				embeds.push(EmbedBuilder.from(baseEmbed).setDescription('There are currently no clans to display.'));
			}

			// Edit the existing message with the first page of the directory
			try {
				// --- Add Log ---
				this.container.logger.info(
					`${header}Attempting to edit message ${message.id} in channel ${channel.id} for guild ${guildId}. New embed count: ${embeds.length}`,
				);

				await message.edit({
					content: `*Last updated: <t:${Math.floor(Date.now() / 1000)}:R>*`, // Add a relative timestamp
					embeds: [embeds[0]], // Send only the first page
					components: [], // Clear any previous components
				});
				this.container.logger.info(
					// Keep existing success log
					`${header}Successfully updated directory message ${config.clanDirectoryMessageId} for guild ${guild.name} (${guildId}).`,
				);
			} catch (error) {
				// Keep existing error log
				this.container.logger.error(
					`${header}Failed to edit clan directory message ${config.clanDirectoryMessageId} for guild ${guild.name} (${guildId})`,
					error,
				);
			}
		}
		// --- Add Log for guilds NOT processed (if any) ---
		const processedGuildIds = Array.from(clansByGuild.keys()); // If allClans was empty, this is empty.
		const allConfiguredGuilds = await this.container.prisma.premiumGuildRoleConfig.findMany({
			// Fetches guilds with config
			where: { clanDirectoryChannelId: { not: null }, clanDirectoryMessageId: { not: null } },
			select: { guildId: true },
		});
		// --- Add Log ---
		this.container.logger.info(
			`${header}Found ${allConfiguredGuilds.length} configured guilds. Checking which ones need an empty update.`,
		);

		for (const configuredGuild of allConfiguredGuilds) {
			// --- Add Log ---
			this.container.logger.info(
				`${header}Checking configured guild ${configuredGuild.guildId}. Processed already: ${processedGuildIds.includes(configuredGuild.guildId)}`,
			);

			if (!processedGuildIds.includes(configuredGuild.guildId)) {
				this.container.logger.info(
					`${header}Guild ${configuredGuild.guildId} needs empty update. Calling helper function...`,
				); // Changed log
				await this.updateEmptyGuildDirectory(configuredGuild.guildId); // This should execute.
			}
		}

		this.container.logger.info(`${header}Finished clan directory update task.`);
		return null;
	}

	private async updateEmptyGuildDirectory(guildId: string) {
		// --- Add Log ---
		this.container.logger.info(`${header}[updateEmptyGuildDirectory] Updating guild ${guildId}...`);

		const guild = this.container.client.guilds.cache.get(guildId);
		if (!guild) return; // Should not happen if configured

		const config = await this.container.prisma.premiumGuildRoleConfig.findUnique({ where: { guildId } });
		if (!config?.clanDirectoryChannelId || !config.clanDirectoryMessageId) return; // Should not happen

		const channel = (await guild.channels
			.fetch(config.clanDirectoryChannelId)
			.catch(() => null)) as GuildTextBasedChannel | null;
		if (!channel || !channel.isTextBased()) return;

		try {
			const message = await channel.messages.fetch(config.clanDirectoryMessageId);
			const embed = createInfoEmbed('There are currently no clans to display.')
				.setTitle(`✨ ${guild.name} Clan Directory ✨`)
				.setFooter({ text: `Page 1 of 1 | Total Clans: 0` });

			this.container.logger.info(`${header}Updating message ${message.id} for guild ${guildId} to show 0 clans.`);
			await message.edit({
				content: `*Last updated: <t:${Math.floor(Date.now() / 1000)}:R>*`,
				embeds: [embed],
				components: [],
			});
		} catch (error) {
			this.container.logger.error(`${header}Failed to update message for empty guild ${guildId}`, error);
		}
	}

	private formatClanEntry(data: ClanDirectoryData, index: number): string {
		const rank = ''; // Placeholder for future points/rank system
		const ownerMention = data.ownerId ? `<@${data.ownerId}>` : '`Unknown Owner`'; // Use mention or fallback text

		const description = data.description
			.split('\n')
			.map((line) => `> ${line}`)
			.join('\n');

		return [
			`**${index}. ${data.name}** ${rank}`, // Clan name and rank
			`   └─ Owner: ${ownerMention} | Members: **${data.memberCount}**/${MAX_MEMBERS_IN_CLAN}`,
			description,
		].join('\n');
	}
}

interface ClanDirectoryData {
	name: string;
	description: string;
	memberCount: number;
	ownerId?: string | null;
}
