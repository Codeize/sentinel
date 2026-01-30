import type { SharedGuildBan } from '@prisma/client';
import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { PermissionFlagsBits } from 'discord-api-types/v10';
import { useGuildIdsToSyncBansIn } from '../../lib/utils/hooks/useGuildIdsToSyncBansIn.js';
import { LogPrefix } from '../../lib/utils/logPrefix.js';
import { ensureFullMember } from '../../lib/utils.js';

const header = LogPrefix.BAN_SYNC;

@ApplyOptions<Listener.Options>({
	event: 'membersCached',
})
export class LoadBansOnReady extends Listener {
	public async run() {
		const guildIds = useGuildIdsToSyncBansIn();
		const totalGuilds = guildIds.length;

		if (totalGuilds === 0) {
			this.container.logger.info(`${header} No guilds configured for ban sync, skipping.`);
			return;
		}

		const banList = new Map<string, SharedGuildBan>();

		// PHASE 1: Fetch all bans from guilds
		this.container.logger.info(`${header} Phase 1/3: Fetching bans from ${totalGuilds} guild(s)...`);

		for (const [index, guildId] of guildIds.entries()) {
			const progress = `[${index + 1}/${totalGuilds}]`;
			const guild = this.container.client.guilds.resolve(guildId);

			if (!guild) {
				this.container.logger.warn(`${header} ${progress} Couldn't find guild ${guildId}, skipping.`);
				continue;
			}

			const me = await guild.members.fetch({ user: this.container.client.user!.id });
			if (!me.permissions.has(PermissionFlagsBits.BanMembers, true)) {
				this.container.logger.warn(
					`${header} ${progress} No Ban Members permission in "${guild.name}", skipping.`,
				);
				continue;
			}

			this.container.logger.info(`${header} ${progress} Fetching bans from "${guild.name}"...`);

			let after = '0';
			let guildBanCount = 0;

			while (true) {
				const banChunk = [
					...(
						await guild.bans.fetch({
							limit: 1_000,
							after,
							cache: false,
						})
					).values(),
				].sort((a, b) => Number(BigInt(a.user.id) - BigInt(b.user.id)));

				if (banChunk.length === 0) {
					break;
				}

				after = banChunk.at(-1)!.user.id;
				guildBanCount += banChunk.length;

				for (const ban of banChunk) {
					if (!banList.has(ban.user.id)) {
						banList.set(ban.user.id, {
							guild_id: guildId,
							reason: ban.reason ?? null,
							user_id: ban.user.id,
						});
					}
				}

				if (banChunk.length < 1_000) {
					break;
				}
			}

			this.container.logger.info(
				`${header} ${progress} Fetched ${guildBanCount.toLocaleString()} bans from "${guild.name}" (${banList.size.toLocaleString()} unique total)`,
			);
		}

		this.container.logger.info(
			`${header} Phase 1/3 complete: Found ${banList.size.toLocaleString()} unique bans across all guilds.`,
		);

		// PHASE 2: Save to database
		this.container.logger.info(`${header} Phase 2/3: Saving ${banList.size.toLocaleString()} bans to database...`);

		await this.container.prisma.sharedGuildBan.deleteMany();

		let savedCount = 0;
		for (const ban of banList.values()) {
			await this.container.prisma.sharedGuildBan.create({
				data: ban,
			});
			savedCount++;

			if (savedCount % 5_000 === 0) {
				this.container.logger.info(
					`${header} Phase 2/3: Saved ${savedCount.toLocaleString()}/${banList.size.toLocaleString()} bans...`,
				);
			}
		}

		this.container.logger.info(
			`${header} Phase 2/3 complete: Saved ${savedCount.toLocaleString()} bans to database.`,
		);

		// PHASE 3: Check members against ban list
		this.container.logger.info(`${header} Phase 3/3: Checking members against ban list...`);

		let totalMembersChecked = 0;
		let totalBansApplied = 0;

		for (const [index, guildId] of guildIds.entries()) {
			const progress = `[${index + 1}/${totalGuilds}]`;
			const guild = this.container.client.guilds.resolve(guildId);

			if (!guild) {
				this.container.logger.warn(`${header} ${progress} Couldn't find guild ${guildId}, skipping.`);
				continue;
			}

			const me = await guild.members.fetch({ user: this.container.client.user!.id });
			if (!me.permissions.has(PermissionFlagsBits.BanMembers, true)) {
				this.container.logger.warn(
					`${header} ${progress} No Ban Members permission in "${guild.name}", skipping.`,
				);
				continue;
			}

			const members = guild.members.cache;
			const memberCount = members.size;

			this.container.logger.info(
				`${header} ${progress} Checking ${memberCount.toLocaleString()} members in "${guild.name}"...`,
			);

			let guildBansApplied = 0;

			for (const [id, fetchedMember] of members) {
				totalMembersChecked++;
				const member = await ensureFullMember(fetchedMember);
				const ban = banList.get(id);

				if (ban) {
					if (!member.bannable) {
						this.container.logger.warn(
							`${header} ${progress} Can't ban ${member.user.tag} (${member.user.id}) - above me in hierarchy`,
						);
						continue;
					}

					const bannedIn = this.container.client.guilds.resolve(ban.guild_id)?.name ?? 'Unknown guild';

					this.container.logger.info(
						`${header} ${progress} Banning ${member.user.tag} (${id}) - was banned in "${bannedIn}" for: ${ban.reason ?? 'no reason'}`,
					);

					await guild.bans.create(id, {
						deleteMessageSeconds: 0,
						reason: `BAN SYNC(${bannedIn}): ${ban.reason ?? 'No reason provided'}`,
					});

					guildBansApplied++;
					totalBansApplied++;
				}
			}

			this.container.logger.info(
				`${header} ${progress} Checked "${guild.name}": ${guildBansApplied} ban(s) applied.`,
			);
		}

		this.container.logger.info(
			`${header} Complete! Checked ${totalMembersChecked.toLocaleString()} members, applied ${totalBansApplied} ban(s).`,
		);
	}
}
