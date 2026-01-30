import { RoleSyncType } from '@prisma/client';
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, Result } from '@sapphire/framework';
import type { GuildMember } from 'discord.js';
import { LogPrefix } from '../../lib/utils/logPrefix.js';
import { ensureFullMember } from '../../lib/utils.js';

@ApplyOptions<Listener.Options>({ event: Events.GuildMemberAdd })
export class SyncRolesOnJoin extends Listener {
	public async run(member: GuildMember) {
		await ensureFullMember(member);

		const entries = await this.container.prisma.roleSync.findMany({
			where: { destination_guild_id: member.guild.id, type: RoleSyncType.AcrossGuilds },
		});

		for (const entry of entries) {
			const originGuild = this.container.client.guilds.resolve(entry.origin_guild_id);
			const originRole = originGuild?.roles.resolve(entry.origin_role_id);
			const destinationRole = member.guild.roles.resolve(entry.destination_role_id);

			if (!originGuild || !originRole || !destinationRole) {
				continue;
			}

			const maybeOriginMember = await Result.fromAsync(async () => originGuild.members.fetch(member.id));

			await maybeOriginMember.inspectAsync(async (originMember) => {
				if (originMember.roles.cache.has(originRole.id)) {
					this.container.logger.info(
						`${LogPrefix.ROLE_SYNC} Adding role ${destinationRole.name} (${destinationRole.id}) to ${member.user.tag} (${member.user.id}) in guild ${member.guild.name} because they have the ${originRole.name} (${originRole.id}) role in ${originGuild.name}`,
					);

					try {
						await member.roles.add(
							entry.destination_role_id,
							`Role sync: adding role as the member has it on the ${originGuild.name} server.`,
						);
					} catch (error) {
						this.container.logger.warn(`${LogPrefix.ROLE_SYNC} Failed to process role sync`, error);
					}
				}
			});
		}
	}
}
