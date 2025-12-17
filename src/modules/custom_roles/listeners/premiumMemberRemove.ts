import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { GuildMember } from 'discord.js';
import { ClanManager } from '../../../lib/abilities/ClanManager.js';
import { ensureFullMember } from '../../../lib/utils.js';

@ApplyOptions<Listener.Options>({ event: Events.GuildMemberRemove })
export class GuildMemberRemove extends Listener<typeof Events.GuildMemberRemove> {
	public override async run(member: GuildMember) {
		await ensureFullMember(member);

		this.container.logger.info(`[PREMIUM] ${member.user.tag} left the server`, {
			userId: member.id,
			guildId: member.guild.id,
		});

		const clanManager = new ClanManager(member);

		await clanManager.getClan();
		await clanManager.makeClanOrphan();

		const customRoleId = await clanManager.getCustomRoleId();

		await this.container.prisma.clanMember.deleteMany({
			where: {
				clanGuildId: member.guild.id,
				userId: member.id,
				clanCustomRoleId: { notIn: customRoleId ? [customRoleId] : [] },
			},
		});
	}
}
