import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import {
	ActionRowBuilder,
	InteractionContextType,
	MessageFlags,
	type Role,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from 'discord.js';
import { MemberAbilities } from '../../../lib/abilities/MemberAbilities.js';
import { RoleAbilitiesCalculator } from '../../../lib/abilities/RoleAbilities.js';
import { createInfoEmbed } from '../../../lib/utils/createEmbed.js';
import { ensureFullMember } from '../../../lib/utils.js';

export const PICK_ROLE_SELECT_CUSTOM_ID = 'pick-role-select';

const DISCORD_SELECT_MENU_MAX_OPTIONS = 25;

@ApplyOptions<Command.Options>({
	description: "Pick from the list of subscriber-only roles you're eligible for",
})
export class PickRoleCommand extends Command {
	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction<'cached'>) {
		const roleAbilitiesCalculator = new RoleAbilitiesCalculator(interaction.guildId);
		const memberAbilities = new MemberAbilities(interaction.member);

		await roleAbilitiesCalculator.computeList();
		await memberAbilities.computeAbilities();

		if (roleAbilitiesCalculator.getPremiumRoleIds('canPickSubscriberRole').length < 1) {
			await interaction.reply({
				embeds: [createInfoEmbed("This server doesn't support subscriber perk roles.")],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (!memberAbilities.hasAbility('canPickSubscriberRole')) {
			await interaction.reply({
				embeds: [createInfoEmbed('You do not have the ability to pick subscriber perk roles.')],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const guildConfig = await this.container.prisma.premiumGuildRoleConfig.findFirst({
			where: { guildId: interaction.guildId },
		});

		const pickableRoleIds = guildConfig?.pickableRoleIds ?? [];

		if (pickableRoleIds.length === 0) {
			await interaction.reply({
				embeds: [createInfoEmbed('No perk roles have been configured in this server yet.')],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const resolvedRoles: Role[] = pickableRoleIds
			.map((id) => interaction.guild.roles.resolve(id))
			.filter((role): role is Role => role !== null);

		if (resolvedRoles.length === 0) {
			await interaction.reply({
				embeds: [
					createInfoEmbed('The configured perk roles no longer exist. Please ask staff to update the list.'),
				],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const member = await ensureFullMember(interaction.member);
		const visibleRoles = resolvedRoles.slice(0, DISCORD_SELECT_MENU_MAX_OPTIONS);

		const options = visibleRoles.map((role) =>
			new StringSelectMenuOptionBuilder()
				.setLabel(role.name)
				.setValue(role.id)
				.setDefault(member.roles.cache.has(role.id)),
		);

		const menu = new StringSelectMenuBuilder()
			.setCustomId(PICK_ROLE_SELECT_CUSTOM_ID)
			.setPlaceholder('Pick the perk roles you want')
			.setMinValues(0)
			.setMaxValues(visibleRoles.length)
			.addOptions(options);

		const description =
			resolvedRoles.length > DISCORD_SELECT_MENU_MAX_OPTIONS ?
				`Pick the perk roles you want. (Showing the first ${DISCORD_SELECT_MENU_MAX_OPTIONS} of ${resolvedRoles.length} configured — ask staff to trim the list.)`
			:	'Pick the perk roles you want.';

		await interaction.reply({
			embeds: [createInfoEmbed(description)],
			components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
			flags: MessageFlags.Ephemeral,
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setDMPermission(false)
				.setContexts(InteractionContextType.Guild),
		);
	}
}
