import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import {
	ActionRowBuilder,
	type EmbedBuilder,
	ButtonBuilder,
	ButtonStyle,
	type Guild,
	type GuildMember,
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

export const PICK_ROLE_PAGE_SIZE = 25;
export const PICK_ROLE_SELECT_PREFIX = 'pick-role-select';
export const PICK_ROLE_PAGE_PREFIX = 'pick-role-page';

export function makePickRoleSelectId(page: number): string {
	return `${PICK_ROLE_SELECT_PREFIX}:${page}`;
}

export function makePickRolePageId(page: number): string {
	return `${PICK_ROLE_PAGE_PREFIX}:${page}`;
}

export function parsePickRoleCustomId(customId: string, prefix: string): number | null {
	if (!customId.startsWith(`${prefix}:`)) {
		return null;
	}

	const page = Number.parseInt(customId.slice(prefix.length + 1), 10);
	return Number.isNaN(page) ? null : page;
}

export function resolvePickableRoles(guild: Guild, pickableRoleIds: readonly string[]): Role[] {
	return pickableRoleIds.map((id) => guild.roles.resolve(id)).filter((role): role is Role => role !== null);
}

interface BuildPagePayloadOptions {
	guild: Guild;
	member: GuildMember;
	notice?: string;
	page: number;
	pickableRoleIds: readonly string[];
}

type PickRoleRow = ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>;

export function buildPickRolePagePayload(options: BuildPagePayloadOptions): {
	components: PickRoleRow[];
	embeds: EmbedBuilder[];
} {
	const { guild, member, pickableRoleIds, notice } = options;
	const resolvedRoles = resolvePickableRoles(guild, pickableRoleIds);

	const totalPages = Math.max(1, Math.ceil(resolvedRoles.length / PICK_ROLE_PAGE_SIZE));
	const page = Math.max(0, Math.min(options.page, totalPages - 1));
	const start = page * PICK_ROLE_PAGE_SIZE;
	const pageRoles = resolvedRoles.slice(start, start + PICK_ROLE_PAGE_SIZE);

	const lines = pageRoles.map((role) => {
		const has = member.roles.cache.has(role.id);
		const icon = role.unicodeEmoji ? `${role.unicodeEmoji} ` : '';
		return `${has ? '✓' : '○'} ${icon}${role.toString()}`;
	});

	const headingParts: string[] = [];
	if (notice) {
		headingParts.push(notice, '');
	}

	headingParts.push(
		totalPages > 1 ?
			`**Page ${page + 1} of ${totalPages}** — Pick the perk roles you want.`
		:	'Pick the perk roles you want.',
	);
	headingParts.push('', lines.join('\n'));

	const embed = createInfoEmbed(headingParts.join('\n'));

	const menuOptions = pageRoles.map((role) =>
		new StringSelectMenuOptionBuilder()
			.setLabel(role.name)
			.setValue(role.id)
			.setDefault(member.roles.cache.has(role.id)),
	);

	const menu = new StringSelectMenuBuilder()
		.setCustomId(makePickRoleSelectId(page))
		.setPlaceholder('Pick the perk roles you want')
		.setMinValues(0)
		.setMaxValues(menuOptions.length)
		.addOptions(menuOptions);

	const components: PickRoleRow[] = [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)];

	if (totalPages > 1) {
		const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(makePickRolePageId(page - 1))
				.setStyle(ButtonStyle.Secondary)
				.setLabel('◀ Previous')
				.setDisabled(page === 0),
			new ButtonBuilder()
				.setCustomId(makePickRolePageId(page + 1))
				.setStyle(ButtonStyle.Secondary)
				.setLabel('Next ▶')
				.setDisabled(page === totalPages - 1),
		);

		components.push(navRow);
	}

	return { embeds: [embed], components };
}

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

		const member = await ensureFullMember(interaction.member);
		const resolvedRoles = resolvePickableRoles(interaction.guild, pickableRoleIds);

		if (resolvedRoles.length === 0) {
			await interaction.reply({
				embeds: [
					createInfoEmbed('The configured perk roles no longer exist. Please ask staff to update the list.'),
				],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const payload = buildPickRolePagePayload({
			guild: interaction.guild,
			member,
			pickableRoleIds,
			page: 0,
		});

		await interaction.reply({
			...payload,
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
