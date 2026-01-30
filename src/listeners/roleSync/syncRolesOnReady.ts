import { RoleSyncType } from '@prisma/client';
import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import type { Guild } from 'discord.js';
import { Collection } from 'discord.js';
import { LogPrefix } from '../../lib/utils/logPrefix.js';

const header = LogPrefix.ROLE_SYNC;

@ApplyOptions<Listener.Options>({ event: 'membersCached' })
export class SyncRolesOnReady extends Listener {
	public async run() {
		const entries = await this.container.prisma.roleSync.findMany({
			where: {
				type: RoleSyncType.AcrossGuilds,
			},
		});

		// Don't run for no entries
		if (entries.length === 0) {
			return;
		}

		this.container.logger.info(`${header}Starting role sync check...`);

		// Find all guild ids we care about
		const guildIds = new Set<string>();
		for (const entry of entries) {
			guildIds.add(entry.origin_guild_id);
			guildIds.add(entry.destination_guild_id);
		}

		// Resolve guilds we care about
		const guilds = new Collection<string, Guild>();
		for (const id of guildIds) {
			const guild = this.container.client.guilds.resolve(id);
			if (!guild) {
				continue;
			}

			this.container.logger.info(
				`${header}  Found guild ${guild.name} with ${guild.members.cache.size} cached members`,
			);
			guilds.set(id, guild);
		}

		// ACTUAL SYNC //
		for (const entry of entries) {
			const originGuild = guilds.get(entry.origin_guild_id);
			const destinationGuild = guilds.get(entry.destination_guild_id);

			if (!originGuild || !destinationGuild) {
				continue;
			}

			// Iterate through cached origin members
			for (const originMember of originGuild.members.cache.values()) {
				// Use fetch(userId) - returns from cache if available, fetches from API if not
				const destinationMember = await destinationGuild.members.fetch(originMember.id).catch(() => null);
				if (!destinationMember) {
					continue;
				}

				if (originMember.roles.cache.has(entry.origin_role_id)) {
					try {
						await destinationMember.roles.add(
							entry.destination_role_id,
							`Role sync: adding role as they have it in ${originGuild.name}`,
						);
					} catch (error) {
						this.container.logger.warn(
							`${header}  Failed to add role ${entry.destination_role_id} to ${destinationMember.user.tag}`,
							error,
						);
					}
				} else {
					try {
						await destinationMember.roles.remove(
							entry.destination_role_id,
							`Role sync: removing role as they do not have it in ${originGuild.name}`,
						);
					} catch (error) {
						this.container.logger.warn(
							`${header}  Failed to remove role ${entry.destination_role_id} from ${destinationMember.user.tag}`,
							error,
						);
					}
				}
			}
		}

		this.container.logger.info(`${header}Role sync check complete!`);
	}
}
