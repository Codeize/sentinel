import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import * as Sentry from '@sentry/node';
import type { GuildMember } from 'discord.js';
import { restoreGiftedRole } from '../../../lib/abilities/legendGift.js';
import { LogPrefix } from '../../../lib/utils/logPrefix.js';
import { ensureFullMember } from '../../../lib/utils.js';

@ApplyOptions<Listener.Options>({ event: Events.GuildMemberAdd })
export class RestoreGiftedRoleOnJoin extends Listener<typeof Events.GuildMemberAdd> {
	public override async run(member: GuildMember) {
		await ensureFullMember(member);

		// Is this returning member the current recipient of an active Legend gift? A ban (or kick)
		// strips their roles, but nothing ever clears the gifter's pointer - that only happens when the
		// *gifter* leaves or loses the ability - so the bot still believes they hold the role. When they
		// rejoin, put it back so Discord matches the stored gift again.
		const gifter = await this.container.prisma.premiumMember.findFirst({
			where: { guildId: member.guild.id, giftedRoleToUserId: member.id },
		});

		if (!gifter) {
			return;
		}

		const logPrefix = `[PREMIUM @${member.id}]`;
		const tags = { userId: member.id, guildId: member.guild.id, giftedByUserId: gifter.userId };

		try {
			const restored = await restoreGiftedRole(gifter);

			if (restored) {
				this.container.logger.info(
					`${LogPrefix.PREMIUM} Restored gifted Legend role to ${member.user.tag} after they rejoined`,
					{ userId: member.id, guildId: member.guild.id, giftedBy: gifter.userId },
				);
				Sentry.addBreadcrumb({
					category: 'clan',
					message: `${logPrefix} Restored gifted Legend role after rejoin`,
					level: 'info',
					data: tags,
				});
			}
		} catch (error) {
			Sentry.addBreadcrumb({
				category: 'clan',
				message: `${logPrefix} Failed to restore gifted Legend role after rejoin`,
				level: 'error',
				data: { ...tags, error: String(error) },
			});
			Sentry.withScope((scope) => {
				scope.setTags(tags);
				scope.setTag('operation', 'restoreGiftedRoleOnJoin');
				Sentry.captureException(error);
			});
		}
	}
}
