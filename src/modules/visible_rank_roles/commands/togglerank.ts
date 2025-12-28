import { RoleSyncType } from '@prisma/client';
import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { MessageFlags } from 'discord-api-types/v10';
import { type Message, type TextChannel } from 'discord.js';
import { createInfoEmbed } from '../../../lib/utils/createEmbed.js';
import { ensureFullMember } from '../../../lib/utils.js';

@ApplyOptions<Command.Options>({
	description: 'Toggles whether your rank role should be showcased to others or not',
})
export class ToggleRankCommand extends Command {
	public override async messageRun(message: Message) {
		if (message.author.id !== '139836912335716352') {
			return;
		}

		await (message.channel as TextChannel).send({
			content: 'TOGGLE_RANK_ROLE_COMMAND_TOGGLED_ROLE',
			embeds: [createInfoEmbed('Toggled the visibility of your rank role.')],
		});
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction<'cached'>) {
		await interaction.deferReply({
			flags: MessageFlags.Ephemeral,
		});

		const memberData = await this.container.prisma.guildMember.findUnique({
			where: { userId_guildId: { guildId: interaction.guildId, userId: interaction.user.id } },
		});

		const newState = !memberData?.syncVisibleRanks;

		await this.container.prisma.guildMember.upsert({
			where: { userId_guildId: { guildId: interaction.guildId, userId: interaction.user.id } },
			update: { syncVisibleRanks: newState },
			create: { userId: interaction.user.id, guildId: interaction.guildId, syncVisibleRanks: newState },
		});

		// Find all roles that can be synced
		const roles = await this.container.prisma.roleSync.findMany({
			where: {
				type: RoleSyncType.VisibleRank,
				origin_guild_id: interaction.guildId,
			},
		});

		const member = await ensureFullMember(await interaction.guild.members.fetch(interaction.user.id));

		for (const { origin_role_id: mainRankRole, destination_role_id: visibleRankRole } of roles) {
			const hasMainRole = member.roles.cache.has(mainRankRole);
			const hasVisibleRole = member.roles.cache.has(visibleRankRole);

			try {
				// Toggled visibility on -> just add the role if they have the main role
				if (newState) {
					if (hasMainRole && !hasVisibleRole) {
						await member.roles.add(visibleRankRole, 'Rank role visibility toggled');
					}
				}
				// Toggled off -> remove the role if they have it
				else if (hasVisibleRole) {
					await member.roles.remove(visibleRankRole, 'Rank role visibility toggled');
				}
			} catch (error) {
				this.container.logger.warn(
					`[TOGGLE_RANK_ROLE_COMMAND_TOGGLED_ROLE] Failed to toggle role`,
					{ mainRankRole, visibleRankRole },
					error,
				);
			}
		}

		await interaction.editReply({
			embeds: [createInfoEmbed('Toggled the visibility of your rank role.')],
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) =>
			builder.setName(this.name).setDescription(this.description).setDMPermission(false),
		);
	}
}
