import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags } from 'discord-api-types/v10';
import type { ButtonInteraction, EmbedBuilder } from 'discord.js';
import { createErrorEmbed, createInfoEmbed } from '../../../lib/utils/createEmbed.js';
import { LogPrefix } from '../../../lib/utils/logPrefix.js';

export function makePremiumRoleGiftSwitchId(
	originalUser: string,
	newUser: string,
	action: 'cancel' | 'confirm',
): `premium-role-switch:${string}:${string}:${'cancel' | 'confirm'}` {
	return `premium-role-switch:${originalUser}:${newUser}:${action}` as const;
}

const thirtyMinutes: number = 1_000 * 60 * 30;

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button,
})
export class SwitchGiftedRole extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		const split = interaction.customId.split(':');

		if (split.length !== 4) {
			return this.none();
		}

		if (split[0] !== 'premium-role-switch') {
			return this.none();
		}

		return this.some({
			originalUser: split[1] as string,
			newUser: split[2] as string,
			action: split[3] as 'cancel' | 'confirm',
		});
	}

	public override async run(
		interaction: ButtonInteraction<'cached'>,
		data: InteractionHandler.ParseResult<this>,
	): Promise<void> {
		if (interaction.user.id !== data.originalUser) {
			await interaction.reply({
				embeds: [createInfoEmbed('This maze was not meant for you.')],
				flags: MessageFlags.Ephemeral,
			});

			return;
		}

		if (data.action === 'cancel') {
			await interaction.update({
				components: [],
				embeds: [createInfoEmbed('The switch has been cancelled.')],
			});

			return;
		}

		// Discord only allows 3 seconds to answer an interaction, and the database reads plus the two
		// role edits below regularly take longer than that. Acknowledge first, edit the message after.
		await interaction.deferUpdate();

		const guildData = await this.container.prisma.premiumGuildRoleConfig.findUnique({
			where: { guildId: interaction.guildId },
		});

		if (!guildData?.legendRoleId) {
			await this.resolveMessage(
				interaction,
				createErrorEmbed('No Legend role is configured in this server, so there is nothing to switch.'),
			);

			return;
		}

		const memberData = await this.container.prisma.premiumMember.findUnique({
			where: { guildId_userId: { guildId: interaction.guildId, userId: data.originalUser } },
		});

		if (!memberData) {
			await this.resolveMessage(
				interaction,
				createErrorEmbed('You do not have a Legend Subscription to gift anymore.'),
			);

			return;
		}

		const newGuildMember = await interaction.guild.members.fetch(data.newUser).catch(() => null);

		if (!newGuildMember) {
			await this.resolveMessage(
				interaction,
				createInfoEmbed('The user you are trying to gift the subscription to is not part of this server!'),
			);

			return;
		}

		const oldGuildMember =
			memberData.giftedRoleToUserId ?
				await interaction.guild.members.fetch(memberData.giftedRoleToUserId).catch(() => null)
			:	null;

		if (oldGuildMember) {
			await oldGuildMember.roles.remove(
				guildData.legendRoleId,
				`Premium member (${interaction.user.tag}) switched gifted role to ${newGuildMember.user.tag}`,
			);
		}

		await newGuildMember.roles.add(
			guildData.legendRoleId,
			`Premium member (${interaction.user.tag}) switched gifted role from ${oldGuildMember?.user.tag ?? 'nobody'}`,
		);

		await this.container.prisma.premiumMember.update({
			where: { guildId_userId: { guildId: interaction.guildId, userId: data.originalUser } },
			data: { giftedRoleToUserId: data.newUser, giftingCooldown: new Date(Date.now() + thirtyMinutes) },
		});

		await this.resolveMessage(
			interaction,
			createInfoEmbed(
				`The Legend Subscription gift has been switched from ${oldGuildMember?.user.toString() ?? 'nobody'} to ${newGuildMember.user.toString()}.`,
			),
		);
	}

	/**
	 * Replaces the confirmation prompt with its outcome. Only valid once the interaction has been deferred.
	 */
	private async resolveMessage(interaction: ButtonInteraction<'cached'>, embed: EmbedBuilder): Promise<void> {
		await interaction
			.editReply({
				components: [],
				embeds: [embed],
			})
			.catch((error: unknown) =>
				this.container.logger.error(
					`${LogPrefix.PREMIUM} [${interaction.user.id}] Failed to edit the gift switch message: ${error}`,
				),
			);
	}
}
