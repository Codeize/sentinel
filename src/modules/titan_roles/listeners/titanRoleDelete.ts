import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { Role } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.GuildRoleDelete })
export class TitanRoleDeleteListener extends Listener<typeof Events.GuildRoleDelete> {
	public override async run(role: Role) {
		await this.container.prisma.titanGuildRoleConfig.updateMany({
			where: { guildId: role.guild.id, originalTitanRoleId: role.id },
			data: { originalTitanRoleId: null },
		});

		await this.container.prisma.titanGuildRoleConfig.updateMany({
			where: { guildId: role.guild.id, giftableRoleId: role.id },
			data: { giftableRoleId: null },
		});

		// If members have given the role out, but it was deleted, nuke that data
		await this.container.prisma.titanMember.updateMany({
			where: { guildId: role.guild.id, customRoleId: role.id },
			data: { customRoleId: null },
		});

		const config = await this.container.prisma.titanGuildRoleConfig.findFirst({
			where: { guildId: role.guild.id, staffRoles: { hasSome: [role.id] } },
		});

		if (config) {
			await this.container.prisma.titanGuildRoleConfig.update({
				where: { guildId: role.guild.id },
				data: { staffRoles: { set: config.staffRoles.filter((id) => id !== role.id) } },
			});
		}
	}
}
