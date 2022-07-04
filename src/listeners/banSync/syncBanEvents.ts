import { ApplyOptions } from '@sapphire/decorators';
import { container, Events, Listener } from '@sapphire/framework';
import { PermissionFlagsBits } from 'discord-api-types/v10';
import type { GuildBan } from 'discord.js';
import { useGuildIdsToSyncBansIn } from '../../lib/utils/hooks/useGuildIdsToSyncBansIn.js';

@ApplyOptions<Listener.Options>({
	event: Events.GuildBanAdd,
	name: 'BanAddChecker',
})
export class BanAddChecker extends Listener<typeof Events.GuildBanAdd> {
	public async run(ban: GuildBan) {
		const fullBan = await ban.fetch(true);

		this.container.logger.info(`Processing ban for ${fullBan.user.tag} (${fullBan.user.id})`);
		// Create DB entry for it
		await this.container.prisma.sharedGuildBan.upsert({
			create: {
				guild_id: ban.guild.id,
				user_id: ban.user.id,
				reason: fullBan.reason ?? null,
			},
			update: {
				reason: fullBan.reason ?? null,
				guild_id: ban.guild.id,
			},
			where: {
				user_id: ban.user.id,
			},
		});

		for await (const guild of getUsableGuilds()) {
			const maybeMember = await guild.members.fetch({ user: fullBan.user.id }).catch(() => null);

			if (maybeMember) {
				if (!maybeMember.bannable) {
					container.logger.warn(
						`Can't ban user ${fullBan.user.id} from guild ${guild.name} (${
							guild.id
						}) because they are above me (previously banned for: ${fullBan.reason ?? 'no reason'})`,
					);
					continue;
				}

				await guild.bans.create(maybeMember.id, {
					days: 0,
					reason: `BAN SYNC(${fullBan.guild.name}): ${fullBan.reason ?? 'No reason'}`,
				});
			}
		}
	}
}

@ApplyOptions<Listener.Options>({
	event: Events.GuildBanRemove,
	name: 'BanRemoveChecker',
})
export class BanRemoveChecker extends Listener<typeof Events.GuildBanRemove> {
	public async run(ban: GuildBan) {
		this.container.logger.info(`Processing unban for ${ban.user.tag} (${ban.user.id})`);
		await this.container.prisma.sharedGuildBan.delete({
			where: { user_id: ban.user.id },
		});

		for await (const guild of getUsableGuilds()) {
			try {
				await guild.bans.remove(ban.user.id, `BAN SYNC(${ban.guild.name}): Unbanned from server`);
			} catch {}
		}
	}
}

async function* getUsableGuilds() {
	const guildIds = useGuildIdsToSyncBansIn();

	for (const guildId of guildIds) {
		const guild = container.client.guilds.resolve(guildId);

		if (!guild) {
			container.logger.warn(`Couldn't find guild ${guildId} to sync bans with!`);
			continue;
		}

		const me = await guild.members.fetch({ user: container.client.user!.id });
		if (!me.permissions.has(PermissionFlagsBits.BanMembers)) {
			container.logger.warn(
				`Can't apply bans/unbans in guild ${guild.name} (${guildId}) because I don't have the Ban Members permission!`,
			);
			continue;
		}

		yield guild;
	}
}
