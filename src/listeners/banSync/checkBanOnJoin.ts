import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { PermissionFlagsBits } from 'discord-api-types/v10';
import type { GuildMember } from 'discord.js';
import { useGuildIdsToSyncBansIn } from '../../lib/utils/hooks/useGuildIdsToSyncBansIn.js';

@ApplyOptions<Listener.Options>({
	event: Events.GuildMemberAdd,
})
export class CheckBanOnJoin extends Listener {
	public async run(member: GuildMember) {
		const guildIdsToCheck = useGuildIdsToSyncBansIn();
		const { guild } = member;

		if (!guildIdsToCheck.includes(guild.id)) {
			return;
		}

		this.container.logger.info(`Checking if user ${member.user.tag} (${member.user.id}) has been banned before...`);

		const me = await guild.members.fetch({ user: this.container.client.user!.id });
		if (!me.permissions.has(PermissionFlagsBits.BanMembers)) {
			this.container.logger.warn(
				`  Can't apply bans in guild ${guild.name} (${guild.id}) because I don't have the Ban Members permission!`,
			);
			return;
		}

		const banInfo = await this.container.prisma.sharedGuildBan.findFirst({
			where: { user_id: member.id },
		});

		if (!banInfo) {
			this.container.logger.info(`  User ${member.user.tag} (${member.user.id}) is not banned anywhere!`);
			return;
		}

		const bannedFrom = this.container.client.guilds.resolve(banInfo.guild_id)?.name ?? 'Unknown guild';

		this.container.logger.info(
			`  Banning user ${member.user.tag} (${member.id}) in guild ${guild.name} (${
				guild.id
			}) as they were banned before from ${bannedFrom} (${banInfo.guild_id}) for: ${banInfo.reason ?? 'no reason'}`,
		);

		await guild.bans.create(member.id, {
			days: 0,
			reason: `BAN SYNC(${bannedFrom}): ${banInfo.reason ?? 'No reason'}`,
		});
	}
}
