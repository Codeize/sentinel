import { Buffer } from 'node:buffer';
import { Subcommand, type SubcommandMappingArray } from '@sapphire/plugin-subcommands';
import { MessageFlags } from 'discord-api-types/v10';
import {
	PermissionFlagsBits,
	type GuildTextBasedChannel,
	inlineCode,
	AttachmentBuilder,
	ChannelType,
} from 'discord.js';
import { createInfoEmbed } from '../../../lib/utils/createEmbed.js';

export class NotificationsCommand extends Subcommand {
	public subcommandMappings: SubcommandMappingArray = [
		{
			type: 'method',
			name: 'create',
			chatInputRun: 'createSubcommand',
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
		{
			type: 'method',
			name: 'show',
			chatInputRun: 'showSubcommand',
		},
	];

	public async createSubcommand(interaction: Subcommand.ChatInputCommandInteraction<'cached'>) {
		const channel = interaction.options.getChannel('channel', true) as GuildTextBasedChannel;
		const content = interaction.options.getString('content', true).replaceAll('{newline}', '\n');
		const roleToCheck = interaction.options.getRole('role_to_check', true);

		const me = await interaction.guild.members.fetch(this.container.client.user!.id);

		if (
			me.permissionsIn(channel).missing([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages], true)
				.length !== 0
		) {
			await interaction.reply({
				flags: MessageFlags.Ephemeral,
				embeds: [createInfoEmbed(`I cannot see or send messages in the <#${channel.id}> channel!`)],
			});

			return;
		}

		const entry = await this.container.prisma.notification.create({
			data: {
				channelId: channel.id,
				guildId: interaction.guildId,
				content,
				roleId: roleToCheck.id,
			},
		});

		await interaction.reply({
			embeds: [createInfoEmbed(`Notification message with id ${inlineCode(entry.id)} created.`)],
		});
	}

	public async deleteSubcommand(interaction: Subcommand.ChatInputCommandInteraction<'cached'>) {
		const code = interaction.options.getString('id', true);

		const entry = await this.container.prisma.notification.findFirst({
			where: { id: code },
		});

		if (!entry || entry.guildId !== interaction.guildId) {
			await interaction.reply({
				flags: MessageFlags.Ephemeral,
				embeds: [createInfoEmbed(`No notification message with id ${inlineCode(code)} found`)],
			});

			return;
		}

		await this.container.prisma.notification.delete({ where: { id: code } });

		const fields = [
			{
				name: 'Channel to send the notification in',
				value: `<#${entry.channelId}> (${entry.channelId})`,
				inline: true,
			},
		];

		await interaction.reply({
			embeds: [
				createInfoEmbed(
					`Notification message ${inlineCode(code)} deleted. Attached is the content of the message.`,
				).addFields(fields),
			],
		});

		const buffer = Buffer.from(entry.content, 'utf8');

		await interaction.followUp({
			files: [new AttachmentBuilder(buffer, { name: `notification-message-${entry.id}.md` })],
		});
	}

	public async listSubcommand(interaction: Subcommand.ChatInputCommandInteraction<'cached'>) {
		const notifications = await this.container.prisma.notification.findMany({
			where: { guildId: interaction.guildId },
		});

		if (notifications.length === 0) {
			await interaction.reply({
				flags: MessageFlags.Ephemeral,
				embeds: [createInfoEmbed('There are no notification messages configured in this guild')],
			});

			return;
		}

		const listOfIds = notifications.map(
			(notification) =>
				`- ${inlineCode(notification.id)} - <#${notification.channelId}> (${notification.channelId})`,
		);

		await interaction.reply({
			embeds: [
				createInfoEmbed(listOfIds.join('\n\n')).setTitle(
					`There are ${notifications.length} notification messages in this server`,
				),
			],
		});
	}

	public async showSubcommand(interaction: Subcommand.ChatInputCommandInteraction<'cached'>) {
		const code = interaction.options.getString('id', true);

		const entry = await this.container.prisma.notification.findFirst({
			where: { id: code },
		});

		if (!entry || entry.guildId !== interaction.guildId) {
			await interaction.reply({
				flags: MessageFlags.Ephemeral,
				embeds: [createInfoEmbed(`No notification message with id ${inlineCode(code)} found`)],
			});

			return;
		}

		await interaction.reply({
			embeds: [
				createInfoEmbed(
					[`Content for notification message ${inlineCode(entry.id)}`, '', entry.content].join('\n'),
				).addFields([
					{ name: 'ID', value: inlineCode(entry.id), inline: true },
					{
						name: 'Channel its checked in',
						value: `<#${entry.channelId}> (${entry.channelId})`,
						inline: true,
					},
				]),
			],
		});
	}

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription('Registers one-time notifications that should be given to a user when they get a role')
				.setDMPermission(false)
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
				.addSubcommand((create) =>
					create
						.setName('create')
						.setDescription('Create a new notification message')
						.addChannelOption((channel) =>
							channel
								.setName('channel')
								.setDescription('The channel in which to send the message')
								.setRequired(true)
								.addChannelTypes(
									ChannelType.GuildText,
									ChannelType.GuildAnnouncement,
									ChannelType.AnnouncementThread,
									ChannelType.PrivateThread,
									ChannelType.PublicThread,
									ChannelType.GuildVoice,
								),
						)
						.addStringOption((content) =>
							content
								.setName('content')
								.setDescription(
									'The message to send in the channel (for now use {newline} for new lines)',
								)
								.setRequired(true),
						)
						.addRoleOption((checkEvery) =>
							checkEvery
								.setName('role_to_check')
								.setDescription('The role that should trigger this notification')
								.setRequired(true),
						),
				)
				.addSubcommand((deleteSubCmd) =>
					deleteSubCmd
						.setName('delete')
						.setDescription('Deletes a notification message')
						.addStringOption((id) =>
							id
								.setName('id')
								.setDescription('The id of the notification message to delete')
								.setRequired(true),
						),
				)
				.addSubcommand((list) =>
					list.setName('list').setDescription('Lists all notification messages created in this server'),
				)
				.addSubcommand((show) =>
					show
						.setName('show')
						.setDescription('Shows the content for a notification message')
						.addStringOption((id) =>
							id
								.setName('id')
								.setDescription('The id of the notification message to show')
								.setRequired(true),
						),
				),
		);
	}
}
