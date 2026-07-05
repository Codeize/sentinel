import type { PremiumMember } from '@prisma/client';
import { container } from '@sapphire/framework';
import * as Sentry from '@sentry/node';
import { recordClanEvent } from '../utils/clanHistory.js';

/**
 * The gifted Legend role is a premium/custom-role perk, not a clan feature: a member with the
 * `canGiftLegend` ability can hand the guild's Legend role to one other member, tracked by the
 * `giftedRoleToUserId` pointer on the gifter's {@link PremiumMember} row. These helpers own the
 * Discord + database side effects of that pointer, decoupled from the clan system.
 *
 * Note: the Legend role is ALSO granted externally to Stripe subscribers with no trace in the bot's
 * data. Everything here keys off an explicit `giftedRoleToUserId`, so it only ever touches roles the
 * bot itself gifted - never a Stripe-granted holder.
 */

/**
 * Removes the gifted Legend role from its recipient (Discord + database) and clears the
 * `giftedRoleToUserId` pointer. Called when the gifter leaves, loses their gifting ability, or their
 * orphaned clan is finally deleted.
 */
export async function deleteGiftedRole(premiumMember: PremiumMember): Promise<void> {
	const logPrefix = `[PREMIUM @${premiumMember.userId}@&${premiumMember.customRoleId}]`;
	const tags = {
		userId: premiumMember.userId,
		guildId: premiumMember.guildId,
		giftedToUserId: premiumMember.giftedRoleToUserId ?? 'none',
	};

	Sentry.addBreadcrumb({
		category: 'clan',
		message: `${logPrefix} Starting deleteGiftedRole`,
		level: 'info',
		data: tags,
	});

	const guild = container.client.guilds.cache.get(premiumMember.guildId);
	const guildConfig = await container.prisma.premiumGuildRoleConfig.findFirst({
		where: { guildId: premiumMember.guildId },
	});

	if (!guild || !premiumMember?.giftedRoleToUserId || !guildConfig?.legendRoleId) {
		Sentry.addBreadcrumb({
			category: 'clan',
			message: `${logPrefix} deleteGiftedRole skipped: missing data`,
			level: 'warning',
			data: {
				...tags,
				hasGuild: Boolean(guild),
				hasGiftedUserId: Boolean(premiumMember?.giftedRoleToUserId),
				hasLegendRoleId: Boolean(guildConfig?.legendRoleId),
			},
		});
		return;
	}

	const giftedUser = await guild.members.fetch(premiumMember.giftedRoleToUserId).catch(() => null);

	if (giftedUser) {
		try {
			await giftedUser.roles.remove(guildConfig.legendRoleId, 'Original premium member left server');
			container.logger.info(`${logPrefix} Deleted gifted role (Discord)`);
			Sentry.addBreadcrumb({
				category: 'clan',
				message: `${logPrefix} Deleted gifted role (Discord)`,
				level: 'info',
				data: { ...tags, giftedUserId: giftedUser.id },
			});
			if (premiumMember.customRoleId) {
				await recordClanEvent({
					guildId: premiumMember.guildId,
					customRoleId: premiumMember.customRoleId,
					ownerUserId: premiumMember.userId,
					targetUserId: premiumMember.giftedRoleToUserId,
					eventType: 'GiftedRoleRevoked',
					metadata: { legendRoleId: guildConfig.legendRoleId },
				});
			}
		} catch (error) {
			container.logger.error(`${logPrefix} Failed to remove gifted role`, {
				userId: giftedUser.id,
				guildId: premiumMember.guildId,
				giftedBy: premiumMember.userId,
				error,
			});
			Sentry.addBreadcrumb({
				category: 'clan',
				message: `${logPrefix} Failed to remove gifted role`,
				level: 'error',
				data: { ...tags, giftedUserId: giftedUser.id, error: String(error) },
			});
			Sentry.withScope((scope) => {
				scope.setTags(tags);
				scope.setTag('operation', 'deleteGiftedRole');
				Sentry.captureException(error);
			});
		}
	} else {
		Sentry.addBreadcrumb({
			category: 'clan',
			message: `${logPrefix} Gifted user not found in guild`,
			level: 'warning',
			data: tags,
		});
	}

	try {
		await container.prisma.premiumMember.update({
			where: { guildId_userId: { guildId: premiumMember.guildId, userId: premiumMember.userId } },
			data: { giftedRoleToUserId: null },
		});

		container.logger.info(`${logPrefix} Deleted gifted role (database)`);
		Sentry.addBreadcrumb({
			category: 'clan',
			message: `${logPrefix} Deleted gifted role (database)`,
			level: 'info',
			data: tags,
		});
	} catch (error) {
		Sentry.addBreadcrumb({
			category: 'clan',
			message: `${logPrefix} Failed to update database after gifted role removal`,
			level: 'error',
			data: { ...tags, error: String(error) },
		});
		Sentry.withScope((scope) => {
			scope.setTags(tags);
			scope.setTag('operation', 'deleteGiftedRole');
			scope.setExtra('context', 'database update after gifted role removal');
			Sentry.captureException(error);
		});
	}
}

/**
 * Re-applies the gifted Legend role to its recipient when it went missing while the gift is still
 * active. This happens when the recipient is banned or kicked - Discord strips their roles - but the
 * gifter's `giftedRoleToUserId` pointer is never cleared (that only happens when the *gifter* leaves
 * or loses the ability), so the bot still believes they hold the role. On rejoin (or during the
 * daily reconcile) we make Discord match the bot's stored truth again.
 *
 * @returns `true` when the role was actually (re-)added, `false` when there was nothing to do: no
 * config, the recipient isn't currently in the guild, or they already have the role.
 */
export async function restoreGiftedRole(premiumMember: PremiumMember): Promise<boolean> {
	const logPrefix = `[PREMIUM @${premiumMember.userId}@&${premiumMember.customRoleId}]`;
	const tags = {
		userId: premiumMember.userId,
		guildId: premiumMember.guildId,
		giftedToUserId: premiumMember.giftedRoleToUserId ?? 'none',
	};

	const guild = container.client.guilds.cache.get(premiumMember.guildId);
	const guildConfig = await container.prisma.premiumGuildRoleConfig.findFirst({
		where: { guildId: premiumMember.guildId },
	});

	if (!guild || !premiumMember.giftedRoleToUserId || !guildConfig?.legendRoleId) {
		return false;
	}

	const giftedUser = await guild.members.fetch(premiumMember.giftedRoleToUserId).catch(() => null);

	if (!giftedUser) {
		// The recipient isn't in the guild right now - nothing to restore. They'll be picked up by the
		// GuildMemberAdd listener if/when they rejoin.
		return false;
	}

	if (giftedUser.roles.cache.has(guildConfig.legendRoleId)) {
		// Discord already agrees with the gift pointer - nothing to do.
		return false;
	}

	try {
		await giftedUser.roles.add(guildConfig.legendRoleId, 'Restoring active Legend gift that went missing');
		container.logger.info(`${logPrefix} Restored gifted role (Discord)`, { giftedUserId: giftedUser.id });
		Sentry.addBreadcrumb({
			category: 'clan',
			message: `${logPrefix} Restored gifted role (Discord)`,
			level: 'info',
			data: { ...tags, giftedUserId: giftedUser.id },
		});

		if (premiumMember.customRoleId) {
			await recordClanEvent({
				guildId: premiumMember.guildId,
				customRoleId: premiumMember.customRoleId,
				ownerUserId: premiumMember.userId,
				targetUserId: premiumMember.giftedRoleToUserId,
				eventType: 'GiftedRoleRestored',
				reason: 'Gifted Legend role was missing while the gift was still active',
				metadata: { legendRoleId: guildConfig.legendRoleId },
			});
		}

		return true;
	} catch (error) {
		container.logger.error(`${logPrefix} Failed to restore gifted role`, {
			userId: giftedUser.id,
			guildId: premiumMember.guildId,
			giftedBy: premiumMember.userId,
			error,
		});
		Sentry.addBreadcrumb({
			category: 'clan',
			message: `${logPrefix} Failed to restore gifted role`,
			level: 'error',
			data: { ...tags, giftedUserId: giftedUser.id, error: String(error) },
		});
		Sentry.withScope((scope) => {
			scope.setTags(tags);
			scope.setTag('operation', 'restoreGiftedRole');
			Sentry.captureException(error);
		});
		return false;
	}
}
