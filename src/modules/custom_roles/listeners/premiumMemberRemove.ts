import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { GuildMember } from 'discord.js';
import { ClanManager } from '../../../lib/abilities/ClanManager.js';

@ApplyOptions<Listener.Options>({ event: Events.GuildMemberRemove })
export class GuildMemberRemove extends Listener<typeof Events.GuildMemberRemove> {
	public override async run(member: GuildMember) {
		this.container.logger.info(`[PREMIUM] ${member.user.tag} left the server`, {
			userId: member.id,
			guildId: member.guild.id,
		});

		await new ClanManager(member).makeClanOrphan();
	}
}
