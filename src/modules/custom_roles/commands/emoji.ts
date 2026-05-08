import { Buffer } from 'node:buffer';
import type { CustomEmoji } from '@prisma/client';
import { Subcommand, type SubcommandMappingArray } from '@sapphire/plugin-subcommands';
import {
	type ApplicationCommandOptionChoiceData,
	type AutocompleteInteraction,
	type GuildEmoji,
	InteractionContextType,
	MessageFlags,
} from 'discord.js';
import magicBytes from 'magic-bytes.js';
import { MemberAbilities } from '../../../lib/abilities/MemberAbilities.js';
import { RoleAbilitiesCalculator } from '../../../lib/abilities/RoleAbilities.js';
import { createInfoEmbed } from '../../../lib/utils/createEmbed.js';
import { LogPrefix } from '../../../lib/utils/logPrefix.js';

export const CUSTOM_EMOJI_LIMIT_PER_USER = 5;

const EMOJI_NAME_REGEX = /^\w{2,32}$/;
const EMOJI_MAX_BYTES = 256 * 1_024;
const ALLOWED_EMOJI_EXTENSIONS: readonly string[] = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

export class EmojiCommand extends Subcommand {
	public subcommandMappings: SubcommandMappingArray = [
		{
			type: 'method',
			name: 'upload',
			chatInputRun: 'uploadSubcommand',
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

	public async uploadSubcommand(interaction: Subcommand.ChatInputCommandInteraction<'cached'>) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const roleAbilitiesCalculator = new RoleAbilitiesCalculator(interaction.guildId);
		const memberAbilities = new MemberAbilities(interaction.member);

		await roleAbilitiesCalculator.computeList();
		await memberAbilities.computeAbilities();

		if (roleAbilitiesCalculator.getPremiumRoleIds('canUploadCustomEmoji').length < 1) {
			await interaction.editReply({
				embeds: [createInfoEmbed("This server doesn't support custom emoji uploads.")],
			});
			return;
		}

		if (!memberAbilities.hasAbility('canUploadCustomEmoji')) {
			await interaction.editReply({
				embeds: [createInfoEmbed('You do not have the ability to upload custom emojis.')],
			});
			return;
		}

		const name = interaction.options.getString('name', true);
		const image = interaction.options.getAttachment('image', true);

		if (!EMOJI_NAME_REGEX.test(name)) {
			await interaction.editReply({
				embeds: [
					createInfoEmbed(
						'Emoji name must be 2-32 characters and contain only letters, numbers, and underscores.',
					),
				],
			});
			return;
		}

		if (image.size > EMOJI_MAX_BYTES) {
			await interaction.editReply({
				embeds: [createInfoEmbed('That image is too large. Discord allows up to 256KB for emojis.')],
			});
			return;
		}

		const currentCount = await this.container.prisma.customEmoji.count({
			where: { guildId: interaction.guildId, userId: interaction.user.id },
		});

		if (currentCount >= CUSTOM_EMOJI_LIMIT_PER_USER) {
			await interaction.editReply({
				embeds: [
					createInfoEmbed(
						`You've reached your custom emoji limit (${CUSTOM_EMOJI_LIMIT_PER_USER}). Delete one with \`/emoji delete\` before uploading a new one.`,
					),
				],
			});
			return;
		}

		const buffer = await this.fetchImageBuffer(image.url);

		if (!buffer) {
			await interaction.editReply({
				embeds: [createInfoEmbed('I was unable to download that image. Try again with a different file.')],
			});
			return;
		}

		const exts = magicBytes.filetypeextension(buffer);

		if (!ALLOWED_EMOJI_EXTENSIONS.some((ext) => exts.includes(ext))) {
			await interaction.editReply({
				embeds: [createInfoEmbed('Custom emojis must be PNG, JPG, or GIF images.')],
			});
			return;
		}

		let emoji: GuildEmoji;

		try {
			emoji = await interaction.guild.emojis.create({
				attachment: buffer,
				name,
				reason: `Custom emoji uploaded by ${interaction.user.tag} (${interaction.user.id})`,
			});
		} catch (error) {
			this.container.logger.warn(`${LogPrefix.PREMIUM} Failed to upload custom emoji`, {
				userId: interaction.user.id,
				guildId: interaction.guildId,
				name,
				error,
			});

			await interaction.editReply({
				embeds: [
					createInfoEmbed(
						"I couldn't upload that emoji. The server might be out of emoji slots, or the name might already be taken.",
					),
				],
			});
			return;
		}

		await this.container.prisma.customEmoji.create({
			data: {
				emojiId: emoji.id,
				guildId: interaction.guildId,
				userId: interaction.user.id,
				name: emoji.name ?? name,
			},
		});

		await interaction.editReply({
			embeds: [
				createInfoEmbed(
					`Uploaded ${emoji.toString()} \`:${emoji.name}:\`. You're now using ${currentCount + 1}/${CUSTOM_EMOJI_LIMIT_PER_USER} of your custom emoji slots.`,
				),
			],
		});
	}

	public async deleteSubcommand(interaction: Subcommand.ChatInputCommandInteraction<'cached'>) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const emojiId = interaction.options.getString('emoji', true);

		const record = await this.container.prisma.customEmoji.findUnique({
			where: { emojiId },
		});

		if (!record || record.guildId !== interaction.guildId || record.userId !== interaction.user.id) {
			await interaction.editReply({
				embeds: [createInfoEmbed("That emoji isn't one of your custom emojis.")],
			});
			return;
		}

		const guildEmoji =
			interaction.guild.emojis.cache.get(emojiId) ??
			(await interaction.guild.emojis.fetch(emojiId).catch(() => null));

		if (guildEmoji) {
			try {
				await guildEmoji.delete(`Custom emoji deleted by ${interaction.user.tag} (${interaction.user.id})`);
			} catch (error) {
				this.container.logger.warn(`${LogPrefix.PREMIUM} Failed to delete custom emoji`, {
					userId: interaction.user.id,
					guildId: interaction.guildId,
					emojiId,
					error,
				});

				await interaction.editReply({
					embeds: [createInfoEmbed("I couldn't delete that emoji. Please try again later.")],
				});
				return;
			}
		}

		await this.container.prisma.customEmoji.delete({ where: { emojiId } }).catch(() => null);

		await interaction.editReply({
			embeds: [createInfoEmbed(`Deleted \`:${record.name}:\`.`)],
		});
	}

	public async listSubcommand(interaction: Subcommand.ChatInputCommandInteraction<'cached'>) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const targetUser = interaction.options.getUser('user') ?? interaction.user;
		const isSelf = targetUser.id === interaction.user.id;

		const records = await this.container.prisma.customEmoji.findMany({
			where: { guildId: interaction.guildId, userId: targetUser.id },
			orderBy: { uploadedAt: 'asc' },
		});

		if (records.length === 0) {
			await interaction.editReply({
				embeds: [
					createInfoEmbed(
						isSelf ?
							"You haven't uploaded any custom emojis yet."
						:	`${targetUser.toString()} hasn't uploaded any custom emojis.`,
					),
				],
			});
			return;
		}

		const lines = await Promise.all(records.map(async (record: CustomEmoji) => {
			const guildEmoji = await interaction.guild.emojis.fetch(record.emojiId);
			const display = guildEmoji?.toString() ?? '❔';

			return `${display} \`:${record.name}:\``;
		}));

		const heading =
			isSelf ?
				`You're using ${records.length}/${CUSTOM_EMOJI_LIMIT_PER_USER} custom emoji slots:`
			:	`${targetUser.toString()} is using ${records.length}/${CUSTOM_EMOJI_LIMIT_PER_USER} custom emoji slots:`;

		await interaction.editReply({
			embeds: [createInfoEmbed(`${heading}\n\n${lines.join('\n')}`)],
		});
	}

	public override async autocompleteRun(interaction: AutocompleteInteraction<'cached'>) {
		const focusedOption = interaction.options.getFocused(true);

		if (focusedOption.name !== 'emoji') {
			return interaction.respond([]);
		}

		const input = focusedOption.value.toLowerCase();

		const records = await this.container.prisma.customEmoji.findMany({
			where: { guildId: interaction.guildId, userId: interaction.user.id },
			orderBy: { uploadedAt: 'asc' },
			take: 25,
		});

		if (records.length === 0) {
			return interaction.respond([{ name: "You haven't uploaded any custom emojis", value: '__NONE__' }]);
		}

		const matches = records.filter((record: CustomEmoji) => record.name.toLowerCase().includes(input)).slice(0, 25);

		const options: ApplicationCommandOptionChoiceData[] = matches.map((record: CustomEmoji) => ({
			name: `:${record.name}:`,
			value: record.emojiId,
		}));

		return interaction.respond(options);
	}

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription('Upload and manage your custom server emojis.')
				.setContexts(InteractionContextType.Guild)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('upload')
						.setDescription('Upload a new custom emoji to the server.')
						.addStringOption((option) =>
							option
								.setName('name')
								.setDescription('Name for the emoji (2-32 chars, letters/numbers/underscores)')
								.setMinLength(2)
								.setMaxLength(32)
								.setRequired(true),
						)
						.addAttachmentOption((option) =>
							option
								.setName('image')
								.setDescription('PNG, JPG, or GIF image (max 256KB)')
								.setRequired(true),
						),
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('delete')
						.setDescription('Delete one of your custom emojis.')
						.addStringOption((option) =>
							option
								.setName('emoji')
								.setDescription('The emoji to delete')
								.setRequired(true)
								.setAutocomplete(true),
						),
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('list')
						.setDescription('List custom emojis uploaded by you or another member.')
						.addUserOption((option) =>
							option.setName('user').setDescription('The member whose emojis to list (defaults to you)'),
						),
				),
		);
	}

	private async fetchImageBuffer(url: string): Promise<Buffer | null> {
		let res: Response;

		try {
			res = await fetch(url);
		} catch (error) {
			this.container.logger.warn(`${LogPrefix.PREMIUM} Failed to fetch custom emoji image`, { url, error });
			return null;
		}

		if (!res.ok) {
			this.container.logger.warn(`${LogPrefix.PREMIUM} Failed to fetch custom emoji image`, {
				url,
				status: res.status,
				statusText: res.statusText,
			});
			return null;
		}

		const arrayBuffer = await res.arrayBuffer();
		return Buffer.from(arrayBuffer);
	}
}
