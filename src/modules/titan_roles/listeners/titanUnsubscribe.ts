import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { GuildMember } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.GuildMemberUpdate })
export class TitanUnsubscribe extends Listener<typeof Events.GuildMemberUpdate> {
	public override async run(oldMember: GuildMember, newMember: GuildMember) {
		const guildConfig = await this.container.prisma.titanGuildRoleConfig.findFirst({
			where: { guildId: newMember.guild.id },
		});

		if (!guildConfig?.originalTitanRoleId) {
			return;
		}

		const hadTitanRole = oldMember.roles.cache.has(guildConfig.originalTitanRoleId);

		if (!hadTitanRole) {
			return;
		}

		const hasTitanRole = newMember.roles.cache.has(guildConfig.originalTitanRoleId);

		// Still a titan, lfg
		if (hadTitanRole && hasTitanRole) {
			return;
		}

		this.container.logger.info(`[TITAN] ${newMember.user.tag} has lost the titan role`, {
			userId: newMember.id,
			guildId: newMember.guild.id,
		});

		const titanMember = await this.container.prisma.titanMember.findFirst({
			where: { guildId: newMember.guild.id, userId: newMember.id },
		});

		if (!titanMember) {
			return;
		}

		if (titanMember.customRoleId) {
			try {
				await newMember.guild.roles.delete(
					titanMember.customRoleId,
					'Lost custom Titan role due to losing Titan role',
				);
			} catch (error) {
				this.container.logger.error(`[TITAN] Failed to delete custom Titan role`, {
					userId: newMember.id,
					guildId: newMember.guild.id,
					error,
				});
			}
		}

		if (guildConfig.giftableRoleId && titanMember.giftedRoleToUserId) {
			const giftedUser = await newMember.guild.members.fetch(titanMember.giftedRoleToUserId).catch(() => null);

			if (giftedUser) {
				try {
					await giftedUser.roles.remove(guildConfig.giftableRoleId, 'Original Titan lost Titan role');
				} catch (error) {
					this.container.logger.error(`[TITAN] Failed to remove gifted role`, {
						userId: giftedUser.id,
						guildId: newMember.guild.id,
						giftedBy: newMember.id,
						error,
					});
				}
			}
		}

		await this.container.prisma.titanMember.update({
			where: { guildId_userId: { guildId: newMember.guild.id, userId: newMember.id } },
			data: { customRoleId: null, giftedRoleToUserId: null },
		});
	}
}
