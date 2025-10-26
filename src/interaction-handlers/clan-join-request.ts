import type { ClanMember } from '@prisma/client';
import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ButtonInteraction, EmbedBuilder, GuildMember } from 'discord.js';
import { ClanManager, ClanMemberAddStatus, MAX_MEMBERS_IN_CLAN } from '../lib/abilities/ClanManager.js';
import { createErrorEmbed, createInfoEmbed } from '../lib/utils/createEmbed.js';

// Custom ID format: clan.join.<accept|deny>:<requesterId>:<ownerId>:<clanRoleId>
export function makeClanJoinRequestId(
	action: 'accept' | 'deny',
	requesterId: string,
	ownerId: string,
	clanRoleId: string,
) {
	return `clan.join.${action}:${requesterId}:${ownerId}:${clanRoleId}` as const;
}

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button,
})
export class ClanJoinRequestHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction<'cached'>) {
		if (!interaction.customId.startsWith('clan.join.')) {
			return this.none();
		}

		const parts = interaction.customId.split(':');
		if (parts.length !== 4) return this.none(); // clan.join.<action>, requesterId, ownerId, clanRoleId

		// Destructure parts correctly based on format
		const [prefix, requesterId, ownerId, clanRoleId] = parts;
		const action = prefix.split('.')[2] as 'accept' | 'deny' | undefined; // Get action from clan.join.action

		if (!action || (action !== 'accept' && action !== 'deny')) return this.none();

		// IMPORTANT: Only the clan owner can press these buttons
		if (interaction.user.id !== ownerId) {
			interaction
				.reply({
					embeds: [createErrorEmbed('Only the clan owner can respond to this request.')],
					ephemeral: true,
				})
				.catch((e) => this.container.logger.error("Failed to send 'not owner' reply", e));
			return this.none();
		}

		return this.some({
			action,
			requesterId,
			clanRoleId, // ownerId removed, use interaction.user.id
		});
	}

	public override async run(
		interaction: ButtonInteraction<'cached'>,
		data: InteractionHandler.ParseResult<this>,
	): Promise<void> {
		// --- Add Guild ID Check ---
		if (!interaction.guildId) {
			this.container.logger.error(
				`[CLAN JOIN REQ HANDLER] Interaction ${interaction.id} is missing guildId unexpectedly.`,
			);
			// Cannot easily send ephemeral reply without guild context, just log and return.
			return;
		}
		// --- End Guild ID Check ---

		await interaction.deferUpdate();
		this.container.logger.info(
			`[CLAN JOIN REQ HANDLER] Running handler for interaction ${interaction.id}. Data: ${JSON.stringify(data)}`,
		);

		const updateOriginalMessage = async (
			result: 'Accepted' | 'Denied' | 'Error' | 'Full' | 'Already Joined' | 'Requester In Another Clan',
		) => {
			try {
				const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
				originalEmbed.setFooter({ text: `${result} by ${interaction.user.tag}` });
				originalEmbed.setTimestamp(new Date());
				originalEmbed.setColor(
					result === 'Accepted' ? 'Green'
					: result === 'Denied' ? 'Red'
					: 'Grey',
				);
				await interaction.editReply({ embeds: [originalEmbed], components: [] });
			} catch (e) {
				this.container.logger.error(
					`[CLAN JOIN REQ HANDLER] Failed to edit original request message ${interaction.message.id}`,
					e,
				);
			}
		};

		try {
			const { action, requesterId, clanRoleId } = data;
			const clanOwner = interaction.member as GuildMember; // Owner is the one interacting

			// --- Fetch Clan Data First ---
			this.container.logger.info(
				`[CLAN JOIN REQ HANDLER] Fetching clan data (role ${clanRoleId}) with members for validation.`,
			);
			// Now we are sure interaction.guildId has a value due to the check above
			const clan = await this.container.prisma.clan.findUnique({
				where: { guildId_customRoleId: { guildId: interaction.guildId, customRoleId: clanRoleId } },
				include: { members: true },
			});

			// --- Rigorous Clan Null/Member Checks ---
			if (!clan) {
				this.container.logger.error(
					`[CLAN JOIN REQ HANDLER] Clan data not found for owner ${clanOwner.id} / role ${clanRoleId}.`,
				);
				await updateOriginalMessage('Error');
				await interaction.followUp({
					embeds: [createErrorEmbed('Clan data could not be found. It might have been deleted.')],
					ephemeral: true,
				});
				return;
			}
			// Explicitly check if members array is present AFTER confirming clan is not null
			if (!clan.members) {
				this.container.logger.error(
					`[CLAN JOIN REQ HANDLER] Clan object found, but 'members' relation is missing/null. Clan Role ID: ${clan.customRoleId}`,
				);
				await updateOriginalMessage('Error');
				await interaction.followUp({
					embeds: [createErrorEmbed('Clan data seems incomplete. Could not verify members.')],
					ephemeral: true,
				});
				return;
			}
			this.container.logger.debug(
				`[CLAN JOIN REQ HANDLER] Fetched clan object successfully. Member count: ${clan.members.length}`,
			);

			// --- Fetch Requester and Role ---
			this.container.logger.info(
				`[CLAN JOIN REQ HANDLER] Fetching requester ${requesterId} and role ${clanRoleId}`,
			);
			const requester = await interaction.guild.members.fetch(requesterId).catch(() => null);
			const clanRole = await interaction.guild.roles.fetch(clanRoleId).catch(() => null);

			// --- Validation Requester/Role ---
			if (!requester) {
				this.container.logger.warn(`[CLAN JOIN REQ HANDLER] Requester ${requesterId} not found.`);
				await updateOriginalMessage('Error');
				await interaction.followUp({
					embeds: [createErrorEmbed('The user who requested to join could not be found.')],
					ephemeral: true,
				});
				return;
			}
			if (!clanRole) {
				// Should be redundant if clan was found, but safe check
				this.container.logger.warn(`[CLAN JOIN REQ HANDLER] Clan role ${clanRoleId} not found unexpectedly.`);
				await updateOriginalMessage('Error');
				await interaction.followUp({
					embeds: [createErrorEmbed('The clan role seems to have been deleted.')],
					ephemeral: true,
				});
				return;
			}

			// --- Handle Deny ---
			if (action === 'deny') {
				this.container.logger.info(
					`[CLAN JOIN REQ HANDLER] Denying request for ${requesterId} to join ${clanRoleId}.`,
				);
				await updateOriginalMessage('Denied');
				return;
			}

			// --- Handle Accept ---
			this.container.logger.info(
				`[CLAN JOIN REQ HANDLER] Processing ACCEPT for ${requesterId} to join ${clanRoleId}.`,
			);
			const clanManager = new ClanManager(clanOwner);

			// --- Perform Validations using the already fetched 'clan' object ---
			this.container.logger.info(
				`[CLAN JOIN REQ HANDLER] Validating clan capacity (${clan.members.length}/${MAX_MEMBERS_IN_CLAN}), existing membership, other memberships.`,
			);

			if (clan.members.length >= MAX_MEMBERS_IN_CLAN) {
				await updateOriginalMessage('Full');
				await interaction.followUp({
					embeds: [createErrorEmbed(`Your clan **${clanRole.name}** is full.`)],
					ephemeral: true,
				});
				return;
			}

			if (clan.members.some((m: ClanMember) => m.userId === requester.id)) {
				await updateOriginalMessage('Already Joined');
				await interaction.followUp({
					embeds: [createErrorEmbed(`${requester.user.tag} is already in your clan.`)],
					ephemeral: true,
				});
				return;
			}

			const existingMembership = await this.container.prisma.clanMember.findFirst({
				where: { userId: requester.id, clanGuildId: interaction.guildId },
			});
			if (existingMembership) {
				await updateOriginalMessage('Requester In Another Clan');
				const existingClan = await this.container.prisma.clan.findUnique({
					where: {
						guildId_customRoleId: {
							guildId: existingMembership.clanGuildId,
							customRoleId: existingMembership.clanCustomRoleId,
						},
					},
				});
				const existingClanRole =
					existingClan ?
						await interaction.guild.roles.fetch(existingClan.customRoleId).catch(() => null)
					:	null;
				const clanName = existingClanRole ? `**${existingClanRole.name}**` : 'another clan';
				await interaction.followUp({
					embeds: [
						createErrorEmbed(
							`${requester.user.tag} is already a member of ${clanName}. They must leave it first.`,
						),
					],
					ephemeral: true,
				});
				return;
			}

			// Attempt to add member
			this.container.logger.info(
				`[CLAN JOIN REQ HANDLER] Calling clanManager.inviteMember for requester ${requesterId}.`,
			);
			const addStatus = await clanManager.inviteMember(requester.id, true);
			this.container.logger.info(
				`[CLAN JOIN REQ HANDLER] clanManager.inviteMember returned status: ${ClanMemberAddStatus[addStatus]} (${addStatus})`,
			);

			if (addStatus === ClanMemberAddStatus.Added) {
				await updateOriginalMessage('Accepted');
				requester
					.send({ embeds: [createInfoEmbed(`🎉 Your request to join **${clanRole.name}** was accepted!`)] })
					.catch(() => {});
				const clanChannel = await clanManager.getClanChannel();
				clanChannel
					?.send(`Welcome ${requester.toString()} to the clan!`)
					.catch((e) =>
						this.container.logger.error(
							`[CLAN JOIN REQ HANDLER] Failed to send welcome to clan channel ${clanChannel.id}`,
							e,
						),
					);
			} else {
				await updateOriginalMessage('Error');
				await interaction.followUp({
					embeds: [
						createErrorEmbed(`Failed to add member: ${ClanManager.getMemberAddStatusMessage(addStatus)}`),
					],
					ephemeral: true,
				});
			}
			// --- End of try block ---
		} catch (error) {
			this.container.logger.error(
				`[CLAN JOIN REQ HANDLER] UNEXPECTED ERROR during run for interaction ${interaction.id}:`,
				error,
			);
			try {
				await interaction.followUp({
					embeds: [
						createErrorEmbed(
							'An unexpected error occurred while processing the request. Please check the bot logs or try again later.',
						),
					],
					ephemeral: true,
				});
			} catch (followUpError) {
				this.container.logger.error(
					`[CLAN JOIN REQ HANDLER] Failed to send follow-up error message for interaction ${interaction.id}:`,
					followUpError,
				);
			}
		}
	}
}
