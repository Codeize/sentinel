import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { GuildMember, TextChannel } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.GuildMemberUpdate })
export class NotificationRoleAdd extends Listener<typeof Events.GuildMemberUpdate> {
	public override async run(oldMember: GuildMember, newMember: GuildMember) {
		const newRolesNotInOld = newMember.roles.cache
			.map((role) => role.id)
			.filter((role) => !oldMember.roles.cache.has(role));

		if (newRolesNotInOld.length) {
			const possibleNotifications = await this.container.prisma.notification.findMany({
				where: {
					roleId: { in: newRolesNotInOld },
					guildId: newMember.guild.id,
				},
			});

			for (const { id, content, channelId } of possibleNotifications) {
				const alreadyNotified = await this.container.prisma.userNotification.findFirst({
					where: { userId: newMember.id, notificationId: id },
				});

				if (alreadyNotified) {
					continue;
				}

				await this.container.prisma.userNotification.create({
					data: { userId: newMember.id, notificationId: id },
				});

				const channel = this.container.client.channels.resolve(channelId);

				if (!channel?.isTextBased()) {
					// This is impossible lol
					continue;
				}

				await (channel as TextChannel).send({
					content: `<@${newMember.id}> ${content}`,
					allowedMentions: {
						parse: [],
						users: [newMember.id],
					},
				});
			}
		}
	}
}
