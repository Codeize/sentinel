import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { GuildMember } from 'discord.js';
import { ClanManager } from '../../../lib/abilities/ClanManager.js';

@ApplyOptions<Listener.Options>({ event: Events.GuildMemberAdd })
export class GuildMemberComesBack extends Listener<typeof Events.GuildMemberAdd> {
	public override async run(member: GuildMember) {
		const clanManager = new ClanManager(member);
		const clan = await clanManager.getClan();

		if (!clan) {
			return;
		}

		this.container.logger.info(`[PREMIUM] ${member.user.tag} has come back to the server`, {
			userId: member.id,
			guildId: member.guild.id,
		});

		await clanManager.makeClanNotOrphan();
	}
}
