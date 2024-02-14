import { Subcommand, type SubcommandMappingArray } from '@sapphire/plugin-subcommands';
import { PermissionFlagsBits } from 'discord.js';
import { createInfoEmbed } from '../../../lib/utils/createInfoEmbed.js';

export class TitanRoleConfigCommand extends Subcommand {
	public subcommandMappings: SubcommandMappingArray = [
		{
			type: 'method',
			name: 'set-titan-role',
			chatInputRun: 'setTitanRoleSubcommand',
		},
		{
			type: 'method',
			name: 'show-config',
			chatInputRun: 'showConfigSubcommand',
		},
		{
			type: 'method',
			name: 'set-giftable-role',
			chatInputRun: 'setGiftableRoleSubcommand',
		},
		{
			type: 'method',
			name: 'set-position-role',
			chatInputRun: 'setPositionRoleSubcommand',
		},
		{
			type: 'group',
			name: 'staff-roles',
			entries: [
				{
					name: 'add',
					chatInputRun: 'addStaffRoleSubcommand',
				},
				{
					name: 'remove',
					chatInputRun: 'removeStaffRoleSubcommand',
				},
				{
					name: 'show',
					chatInputRun: 'showStaffRolesSubcommand',
				},
			],
		},
	];

	public async setTitanRoleSubcommand(interaction: Subcommand.ChatInputCommandInteraction<'cached'>) {
		const role = interaction.options.getRole('role', false);

		const me = await interaction.guild.members.fetch(this.container.client.user!.id);

		if (role && me.roles.highest.position <= role.position) {
			await interaction.reply({
				ephemeral: true,
				embeds: [
					createInfoEmbed(
						`Please make sure my highest role is above the role ${role} in this server, as otherwise I will not be able to create custom roles that are visible.`,
					),
				],
			});

			return;
		}

		const existingTitanConfig = await this.container.prisma.titanGuildRoleConfig.findFirst({
			where: { guildId: interaction.guildId },
		});

		if (existingTitanConfig) {
			const previousRole =
				existingTitanConfig.originalTitanRoleId ?
					interaction.guild.roles.resolve(existingTitanConfig.originalTitanRoleId)
				:	null;

			const previousRoleRepresentation = previousRole ? `<@&${previousRole.id}> (${previousRole.id})` : 'none';
			const newRoleRepresentation = role ? `<@&${role.id}> (${role.id})` : 'none';

			await this.container.prisma.titanGuildRoleConfig.update({
				where: { guildId: interaction.guildId },
				data: { originalTitanRoleId: role?.id ?? null },
			});

			await interaction.reply({
				embeds: [
					createInfoEmbed(
						`Set the Titan role in this server from ${previousRoleRepresentation} to ${newRoleRepresentation}`,
					),
				],
				ephemeral: true,
			});

			return;
		}

		await this.container.prisma.titanGuildRoleConfig.create({
			data: { guildId: interaction.guildId, originalTitanRoleId: role?.id ?? null },
		});

		const newRoleRepresentation = role ? `<@&${role.id}> (${role.id})` : 'none';

		await interaction.reply({
			embeds: [createInfoEmbed(`Set the Titan role in this server to ${newRoleRepresentation}`)],
			ephemeral: true,
		});
	}

	public async showConfigSubcommand(interaction: Subcommand.ChatInputCommandInteraction<'cached'>) {
		const titanConfig = await this.container.prisma.titanGuildRoleConfig.findFirst({
			where: { guildId: interaction.guildId },
		});

		const titanRole =
			titanConfig?.originalTitanRoleId ? interaction.guild.roles.resolve(titanConfig.originalTitanRoleId) : null;

		const giftableRole =
			titanConfig?.giftableRoleId ? interaction.guild.roles.resolve(titanConfig.giftableRoleId) : null;

		const titanRoleRepresentation = titanRole ? `<@&${titanRole.id}> (${titanRole.id})` : 'none';
		const giftableRoleRepresentation = giftableRole ? `<@&${giftableRole.id}> (${giftableRole.id})` : 'none';

		await interaction.reply({
			embeds: [
				createInfoEmbed(
					`**Titan Role:** ${titanRoleRepresentation}\n**Giftable Role:** ${giftableRoleRepresentation}`,
				),
			],
			ephemeral: true,
		});
	}

	public async setGiftableRoleSubcommand(interaction: Subcommand.ChatInputCommandInteraction<'cached'>) {
		const role = interaction.options.getRole('role', false);

		if (role && role.managed) {
			await interaction.reply({
				embeds: [createInfoEmbed('You cannot set a managed role as the giftable role!')],
				ephemeral: true,
			});

			return;
		}

		const me = await interaction.guild.members.fetch(this.container.client.user!.id);

		if (role && me.roles.highest.position <= role.position) {
			await interaction.reply({
				ephemeral: true,
				embeds: [
					createInfoEmbed(
						`I do not have permission to assign the role ${role} in this server as its above my highest role.`,
					),
				],
			});

			return;
		}

		const existingTitanConfig = await this.container.prisma.titanGuildRoleConfig.findFirst({
			where: { guildId: interaction.guildId },
		});

		if (existingTitanConfig) {
			const previousRole =
				existingTitanConfig.giftableRoleId ?
					interaction.guild.roles.resolve(existingTitanConfig.giftableRoleId)
				:	null;

			const previousRoleRepresentation = previousRole ? `<@&${previousRole.id}> (${previousRole.id})` : 'none';
			const newRoleRepresentation = role ? `<@&${role.id}> (${role.id})` : 'none';

			await this.container.prisma.titanGuildRoleConfig.update({
				where: { guildId: interaction.guildId },
				data: { giftableRoleId: role?.id ?? null },
			});

			await interaction.reply({
				embeds: [
					createInfoEmbed(
						`Set the giftable role in this server from ${previousRoleRepresentation} to ${newRoleRepresentation}`,
					),
				],
				ephemeral: true,
			});

			return;
		}

		await this.container.prisma.titanGuildRoleConfig.create({
			data: { guildId: interaction.guildId, giftableRoleId: role?.id ?? null },
		});

		const newRoleRepresentation = role ? `<@&${role.id}> (${role.id})` : 'none';

		await interaction.reply({
			embeds: [createInfoEmbed(`Set the giftable role in this server to ${newRoleRepresentation}`)],
			ephemeral: true,
		});
	}

	public async setPositionRoleSubcommand(interaction: Subcommand.ChatInputCommandInteraction<'cached'>) {
		const role = interaction.options.getRole('role', false);
		const me = await interaction.guild.members.fetch(this.container.client.user!.id);

		if (role && me.roles.highest.position <= role.position) {
			await interaction.reply({
				ephemeral: true,
				embeds: [
					createInfoEmbed(
						`I do not have permission create roles above ${role} in this server as its above my highest role.`,
					),
				],
			});

			return;
		}

		const existingTitanConfig = await this.container.prisma.titanGuildRoleConfig.findFirst({
			where: { guildId: interaction.guildId },
		});

		if (existingTitanConfig) {
			const previousRole =
				existingTitanConfig.startingPositionRoleId ?
					interaction.guild.roles.resolve(existingTitanConfig.startingPositionRoleId)
				:	null;

			const previousRoleRepresentation =
				previousRole ? `<@&${previousRole.id}> (${previousRole.id})` : 'the titan role (if configured)';
			const newRoleRepresentation = role ? `<@&${role.id}> (${role.id})` : 'the titan role (if configured)';

			await this.container.prisma.titanGuildRoleConfig.update({
				where: { guildId: interaction.guildId },
				data: { startingPositionRoleId: role?.id ?? null },
			});

			await interaction.reply({
				embeds: [
					createInfoEmbed(
						`Set the starting position role in this server from ${previousRoleRepresentation} to ${newRoleRepresentation}`,
					),
				],
				ephemeral: true,
			});

			return;
		}

		await this.container.prisma.titanGuildRoleConfig.create({
			data: { guildId: interaction.guildId, startingPositionRoleId: role?.id ?? null },
		});

		const newRoleRepresentation = role ? `<@&${role.id}> (${role.id})` : 'the titan role (if configured)';

		await interaction.reply({
			embeds: [createInfoEmbed(`Set the starting position role in this server to ${newRoleRepresentation}`)],
			ephemeral: true,
		});
	}

	public async addStaffRoleSubcommand(interaction: Subcommand.ChatInputCommandInteraction<'cached'>) {
		const role = interaction.options.getRole('role', true);

		const guildConfigs = await this.container.prisma.titanGuildRoleConfig.findFirst({
			where: { guildId: interaction.guildId },
		});

		if (guildConfigs?.staffRoles.includes(role.id)) {
			await interaction.reply({
				embeds: [createInfoEmbed('This role is already a staff role in this server!')],
				ephemeral: true,
			});

			return;
		}

		await this.container.prisma.titanGuildRoleConfig.upsert({
			where: { guildId: interaction.guildId },
			create: { guildId: interaction.guildId, staffRoles: [role.id] },
			update: { staffRoles: { push: role.id } },
		});

		await interaction.reply({
			embeds: [createInfoEmbed(`Added the role ${role.toString()} to the list of staff roles in this server!`)],
			ephemeral: true,
		});
	}

	public async removeStaffRoleSubcommand(interaction: Subcommand.ChatInputCommandInteraction<'cached'>) {
		const role = interaction.options.getRole('role', true);

		const guildConfigs = await this.container.prisma.titanGuildRoleConfig.findFirst({
			where: { guildId: interaction.guildId },
		});

		if (!guildConfigs?.staffRoles.includes(role.id)) {
			await interaction.reply({
				embeds: [createInfoEmbed('This role is not a staff role in this server!')],
				ephemeral: true,
			});

			return;
		}

		await this.container.prisma.titanGuildRoleConfig.update({
			where: { guildId: interaction.guildId },
			data: { staffRoles: { set: guildConfigs.staffRoles.filter((id) => id !== role.id) } },
		});

		await interaction.reply({
			embeds: [
				createInfoEmbed(`Removed the role ${role.toString()} from the list of staff roles in this server!`),
			],
			ephemeral: true,
		});
	}

	public async showStaffRolesSubcommand(interaction: Subcommand.ChatInputCommandInteraction<'cached'>) {
		const guildConfigs = await this.container.prisma.titanGuildRoleConfig.findFirst({
			where: { guildId: interaction.guildId },
		});

		if (!guildConfigs?.staffRoles.length) {
			await interaction.reply({
				embeds: [createInfoEmbed('There are no staff roles in this server!')],
				ephemeral: true,
			});

			return;
		}

		const roles = guildConfigs.staffRoles.map((id) => interaction.guild.roles.resolve(id));

		await interaction.reply({
			embeds: [
				createInfoEmbed(
					`**Staff Roles:**\n${roles.map((role) => role?.toString() ?? 'Unknown Role').join('\n')}`,
				),
			],
			ephemeral: true,
		});
	}

	public override registerApplicationCommands(registry: Subcommand.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription('Handles the configuration of the custom titan role in this server')
				.setDMPermission(false)
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('set-titan-role')
						.setDescription(
							'Sets the titan role for this server (allows members to make their own custom role)',
						)
						.addRoleOption((role) =>
							role
								.setName('role')
								.setDescription('The titan role (leave empty to reset/disable the feature)'),
						),
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('show-config')
						.setDescription('Shows the current configuration for the titan role in this server'),
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('set-giftable-role')
						.setDescription(
							'Sets the giftable role for this server (allows titans to gift their custom role to other members)',
						)
						.addRoleOption((role) =>
							role
								.setName('role')
								.setDescription('The giftable role (leave empty to reset/disable the feature)'),
						),
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('set-position-role')
						.setDescription(
							'Sets the role that should be used as a starting position for custom Titan roles for this server',
						)
						.addRoleOption((role) =>
							role
								.setName('role')
								.setDescription('The position role (leave empty to reset/use the titan role)'),
						),
				)
				.addSubcommandGroup((role) =>
					role
						.setName('staff-roles')
						.setDescription(
							'Manage the staff roles in this server to prevent custom roles from having similar colors',
						)
						.addSubcommand((subcommand) =>
							subcommand
								.setName('add')
								.setDescription('Adds a staff role to the list of staff roles')
								.addRoleOption((role) =>
									role.setName('role').setDescription('The staff role to add').setRequired(true),
								),
						)
						.addSubcommand((subcommand) =>
							subcommand
								.setName('remove')
								.setDescription('Removes a staff role from the list of staff roles')
								.addRoleOption((role) =>
									role.setName('role').setDescription('The staff role to remove').setRequired(true),
								),
						)
						.addSubcommand((subcommand) =>
							subcommand.setName('show').setDescription('Shows the current staff roles in this server'),
						),
				),
		);
	}
}
