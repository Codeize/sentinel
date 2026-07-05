import type { ClanCustomCommand } from '@prisma/client';
import { Subcommand, type SubcommandMappingArray } from '@sapphire/plugin-subcommands';
import {
	type ApplicationCommandOptionChoiceData,
	type AutocompleteInteraction,
	InteractionContextType,
	MessageFlags,
} from 'discord.js';
import { ClanManager } from '../../../lib/abilities/ClanManager.js';
import { MemberAbilities } from '../../../lib/abilities/MemberAbilities.js';
import { createErrorEmbed, createInfoEmbed } from '../../../lib/utils/createEmbed.js';

const COMMAND_REGEX = /^!\S{1,31}$/;

export class CustomCommandCommand extends Subcommand {
	public subcommandMappings: SubcommandMappingArray = [
		{
			type: 'method',
			name: 'set',
			chatInputRun: 'setSubcommand',
		},
		{
			type: 'method',
			name: 'delete',
			chatInputRun: 'deleteSubcommand',
		},
		{
			type: 'method',
			name: 'list',
			chatInputRun: 'listSubcommand',
		},
	];

	public async setSubcommand(interaction: Subcommand.ChatInputCommandInteraction<'cached'>) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const trigger = interaction.options.getString('command', true).trim().toLowerCase();
		const responseText = interaction.options.getString('output')?.trim() ?? null;
		// Although we accept attachments, we just use their Discord CDN url in the DB,
		// as that will always be available on-platform.
		const media = interaction.options.getAttachment('media');
		const mediaUrl = interaction.options.getString('media-url')?.trim() ?? null;

		if (!COMMAND_REGEX.test(trigger)) {
			await interaction.editReply({
				embeds: [
					createErrorEmbed(
						'Custom commands must start with `!`, be 2-32 characters long, and not contain spaces.',
					),
				],
			});
			return;
		}

		if (!responseText && !media && !mediaUrl) {
			await interaction.editReply({
				embeds: [createErrorEmbed('Custom commands need text output, media output, or both.')],
			});
			return;
		}

		if (media && mediaUrl) {
			await interaction.editReply({
				embeds: [createErrorEmbed('Use either `media` or `media-url`, not both.')],
			});
			return;
		}

		const clanManager = new ClanManager(interaction.member);
		const clan = await clanManager.getClan();
		const customRoleId = await clanManager.getCustomRoleId();

		// Clan members can use the commands, but not set or delete them.
		if (!clan || !customRoleId || clan.customRoleId !== customRoleId) {
			await interaction.editReply({
				embeds: [createErrorEmbed('You need to own a clan before you can set up custom commands.')],
			});
			return;
		}

		const memberAbilities = new MemberAbilities(interaction.member);
		await memberAbilities.computeAbilities();

		if (!memberAbilities.hasAbility('canCreateCustomCommand')) {
			await interaction.editReply({
				embeds: [createErrorEmbed('You do not have the ability to create custom commands.')],
			});
			return;
		}

		// Custom command triggers are unique across all clans.
		const existingCommand = await this.container.prisma.clanCustomCommand.findUnique({
			where: { guildId_trigger: { guildId: interaction.guildId, trigger } },
		});

		if (existingCommand && existingCommand.clanCustomRoleId !== clan.customRoleId) {
			await interaction.editReply({
				embeds: [
					createErrorEmbed(
						'Another clan already has that custom command trigger in this server. Please try a different command trigger.',
					),
				],
			});
			return;
		}

		const savedCommand = await this.container.prisma.clanCustomCommand.upsert({
			where: { guildId_trigger: { guildId: interaction.guildId, trigger } },
			create: {
				guildId: interaction.guildId,
				clanCustomRoleId: clan.customRoleId,
				trigger,
				responseText,
				responseMediaUrl: media?.url ?? mediaUrl,
				createdByUserId: interaction.user.id,
			},
			update: {
				responseText,
				responseMediaUrl: media?.url ?? mediaUrl,
				createdByUserId: interaction.user.id,
			},
		});

		await interaction.editReply({
			embeds: [
				createInfoEmbed(
					`Custom command \`${savedCommand.trigger}\` has been saved. Only members of your clan can use it.`,
				),
			],
		});
	}

	public async deleteSubcommand(interaction: Subcommand.ChatInputCommandInteraction<'cached'>) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const trigger = interaction.options.getString('command', true).trim().toLowerCase();
		const clanManager = new ClanManager(interaction.member);
		const clan = await clanManager.getClan();

		if (!clan) {
			await interaction.editReply({
				embeds: [createErrorEmbed('You do not own a clan.')],
			});
			return;
		}

		const existingCommand = await this.container.prisma.clanCustomCommand.findUnique({
			where: { guildId_trigger: { guildId: interaction.guildId, trigger } },
		});

		// Although unlikely, its' still possible the input would be a custom command not owned by the user's clan,
		// if it even exists at all.
		if (!existingCommand || existingCommand.clanCustomRoleId !== clan.customRoleId) {
			await interaction.editReply({
				embeds: [createErrorEmbed("That custom command isn't owned by your clan, or it does not exist.")],
			});
			return;
		}

		await this.container.prisma.clanCustomCommand.delete({
			where: { guildId_trigger: { guildId: interaction.guildId, trigger } },
		});

		await interaction.editReply({
			embeds: [createInfoEmbed(`Deleted custom command \`${trigger}\`.`)],
		});
	}

	public async listSubcommand(interaction: Subcommand.ChatInputCommandInteraction<'cached'>) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const clanManager = new ClanManager(interaction.member);
		const clan = await clanManager.getClan();

		if (!clan) {
			await interaction.editReply({
				embeds: [createErrorEmbed('You do not own a clan.')],
			});
			return;
		}

		const commands = await this.container.prisma.clanCustomCommand.findMany({
			where: { guildId: interaction.guildId, clanCustomRoleId: clan.customRoleId },
			orderBy: { trigger: 'asc' },
		});

		if (commands.length === 0) {
			await interaction.editReply({
				embeds: [createInfoEmbed("Your clan doesn't have any custom commands yet.")],
			});
			return;
		}

		// We opt to just list the command trigger and type of response it gives, rather than
		// the entire output, as that could be quite a large message otherwise.
		const lines = commands.map((command: ClanCustomCommand) => {
			const outputTypes = [command.responseText ? 'text' : null, command.responseMediaUrl ? 'media' : null]
				.filter(Boolean)
				.join(' + ');

			return `\`${command.trigger}\` - ${outputTypes}`;
		});

		await interaction.editReply({
			embeds: [createInfoEmbed(`Your clan custom commands:\n\n${lines.join('\n')}`)],
		});
	}

	public override async autocompleteRun(interaction: AutocompleteInteraction<'cached'>) {
		const focusedOption = interaction.options.getFocused(true);

		if (focusedOption.name !== 'command') {
			return interaction.respond([]);
		}

		const input = focusedOption.value.toLowerCase();
		const clanManager = new ClanManager(interaction.member);
		const clan = await clanManager.getClan();

		if (!clan) {
			return interaction.respond([]);
		}

		const commands = await this.container.prisma.clanCustomCommand.findMany({
			where: { guildId: interaction.guildId, clanCustomRoleId: clan.customRoleId },
			orderBy: { trigger: 'asc' },
			take: 25,
		});

		const options: ApplicationCommandOptionChoiceData[] = commands
			.filter((command: ClanCustomCommand) => command.trigger.includes(input))
			.slice(0, 25)
			.map((command: ClanCustomCommand) => ({ name: command.trigger, value: command.trigger }));

		return interaction.respond(options);
	}

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription('Manage clan-only custom text commands.')
				.setContexts(InteractionContextType.Guild)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('set')
						.setDescription('Create or update a clan-only custom command.')
						.addStringOption((option) =>
							option
								.setName('command')
								.setDescription('The command trigger, such as !cat')
								.setMinLength(2)
								.setMaxLength(32)
								.setRequired(true),
						)
						.addStringOption((option) =>
							option
								.setName('output')
								.setDescription('The text response for the command')
								.setMaxLength(1_900),
						)
						.addAttachmentOption((option) =>
							option.setName('media').setDescription('Optional media to send with the response'),
						)
						.addStringOption((option) =>
							option
								.setName('media-url')
								.setDescription('Optional hosted media URL to send with the response')
								.setMaxLength(2_048),
						),
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('delete')
						.setDescription('Delete one of your clan custom commands.')
						.addStringOption((option) =>
							option
								.setName('command')
								.setDescription('The command to delete')
								.setRequired(true)
								.setAutocomplete(true),
						),
				)
				.addSubcommand((subcommand) =>
					subcommand.setName('list').setDescription('List your clan custom commands.'),
				),
		);
	}
}
