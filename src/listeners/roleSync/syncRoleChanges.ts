import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, Result } from '@sapphire/framework';
import type { GuildMember } from 'discord.js';

const header = '[ROLE SYNC] ';

@ApplyOptions<Listener.Options>({ event: Events.GuildMemberUpdate, name: 'SyncRole' })
export class SyncRole extends Listener {
	public async run(oldMember: GuildMember, newMember: GuildMember) {
		const roleDifference = newMember.roles.cache.difference(oldMember.roles.cache);

		for (const role of roleDifference.values()) {
			const entry = await this.container.prisma.roleSync.findFirst({
				where: {
					origin_guild_id: newMember.guild.id,
					origin_role_id: role.id,
				},
			});

			if (entry) {
				const destinationGuild = this.container.client.guilds.resolve(entry.destination_guild_id);
				const destinationRole = destinationGuild?.roles.resolve(entry.destination_role_id);

				if (!destinationGuild || !destinationRole) {
					continue;
				}

				const maybeDestinationMember = await Result.fromAsync(async () =>
					destinationGuild.members.fetch(newMember.id),
				);

				await maybeDestinationMember.inspectAsync(async (destinationMember) => {
					// Had the role before, but not anymore
					if (oldMember.roles.cache.has(role.id)) {
						this.container.logger.info(
							`${header}Removing role ${destinationRole.name} (${destinationRole.id}) from ${destinationMember.user.tag} (${destinationMember.user.id}) in guild ${destinationGuild.name} as they lost it from guild ${newMember.guild.name}`,
						);

						try {
							await destinationMember.roles.remove(
								entry.destination_role_id,
								`Role sync: removing role as the member lost it on the ${newMember.guild.name} server.`,
							);
						} catch (error) {
							this.container.logger.warn(`${header}Failed to process role sync`, error);
						}
					} else {
						this.container.logger.info(
							`${header}Adding role ${destinationRole.name} (${destinationRole.id}) to ${destinationMember.user.tag} (${destinationMember.user.id}) in guild ${destinationGuild.name} as they gained it in ${newMember.guild.name}`,
						);

						try {
							await destinationMember.roles.add(
								entry.destination_role_id,
								`Role sync: adding role as the member received it on the ${newMember.guild.name} server.`,
							);
						} catch (error) {
							this.container.logger.warn(`${header}Failed to process role sync`, error);
						}
					}
				});
			}
		}
	}
}
