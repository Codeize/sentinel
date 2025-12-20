import { ClanManager } from '../lib/abilities/ClanManager.js';
import { MemberAbilities } from '../lib/abilities/MemberAbilities.js';
import { Task, type TaskRunData } from '../lib/schedule/tasks/Task.js';

export type FixMode = 'dry-run' | 'fix-all' | 'fix-mismatches' | 'fix-missing';

export interface CheckPremiumMemberAbilitiesOptions {
	/**
	 * What to fix: 'dry-run' (default), 'fix-missing', 'fix-mismatches', or 'fix-all'
	 */
	fixMode?: FixMode;
	/**
	 * Optional guild ID to check only a specific guild
	 */
	guildId?: string;
}

export interface CheckPremiumMemberAbilitiesResult {
	fixed: number;
	orphanedClansFixed: number;
	totalChecked: number;
	totalMismatches: number;
	totalMissing: number;
	totalOrphanedClansWithoutTask: number;
}

/**
 * Daily task that checks if premium members still have their expected abilities.
 * Logs any discrepancies for monitoring and debugging.
 */
export class CheckPremiumMemberAbilities extends Task {
	public async run(data?: TaskRunData) {
		const options: CheckPremiumMemberAbilitiesOptions = data?.data ? JSON.parse(data.data) : {};
		await this.checkAbilities(options);
		return null;
	}

	/**
	 * Cleans up a premium member who lost their abilities:
	 * - Checks for clan and deletes it immediately if not already orphaned
	 * - Deletes custom role from Discord
	 * - Deletes premium member entry from database
	 */
	private async cleanupPremiumMember(
		guildId: string,
		userId: string,
		customRoleId: string | null,
		guildName: string,
		reason: 'mismatch' | 'missing',
	): Promise<void> {
		const guild = this.container.client.guilds.resolve(guildId);
		if (!guild) return;

		let shouldDeleteCustomRole = false;

		if (customRoleId) {
			const clanManager = new ClanManager(customRoleId, guildId);
			const clan = await clanManager.getClan();

			if (clan) {
				if (clan.deletionTaskId) {
					this.container.logger.info(
						`[PREMIUM ABILITY CHECK] [CLEANUP] Clan for role ${customRoleId} is already orphaned, skipping`,
					);
				} else {
					try {
						await clanManager.deleteClan();
						this.container.logger.info(
							`[PREMIUM ABILITY CHECK] [CLEANUP] Deleted clan for role ${customRoleId} for ${reason} user ${userId}`,
						);
						shouldDeleteCustomRole = true;
					} catch (error) {
						this.container.logger.error(
							`[PREMIUM ABILITY CHECK] [CLEANUP] Failed to delete clan for role ${customRoleId}:`,
							error,
						);
						shouldDeleteCustomRole = true;
					}
				}
			} else {
				shouldDeleteCustomRole = true;
			}
		}

		if (customRoleId && shouldDeleteCustomRole) {
			const role = await guild.roles.fetch(customRoleId).catch(() => null);

			if (role) {
				try {
					await role.delete(`Premium member ${reason}: user ${userId} lost abilities`);
					this.container.logger.info(
						`[PREMIUM ABILITY CHECK] [CLEANUP] Deleted custom role ${customRoleId} for ${reason} user ${userId}`,
					);
				} catch (error) {
					this.container.logger.error(
						`[PREMIUM ABILITY CHECK] [CLEANUP] Failed to delete custom role ${customRoleId}:`,
						error,
					);
				}
			}
		}

		// 3. Delete premium member entry from database
		try {
			await this.container.prisma.premiumMember.delete({
				where: {
					guildId_userId: {
						guildId,
						userId,
					},
				},
			});

			this.container.logger.info(
				`[PREMIUM ABILITY CHECK] [FIXED] Removed premium member entry for ${reason} user ${userId} in guild ${guildName} (${guildId})`,
			);
		} catch (error) {
			this.container.logger.error(
				`[PREMIUM ABILITY CHECK] Failed to remove premium member ${userId} in guild ${guildId}:`,
				error,
			);
		}
	}

	public async checkAbilities(
		options: CheckPremiumMemberAbilitiesOptions = {},
	): Promise<CheckPremiumMemberAbilitiesResult> {
		const fixMode = options.fixMode ?? 'dry-run';
		this.container.logger.info(
			`[PREMIUM ABILITY CHECK] Starting premium member ability check (mode: ${fixMode})...`,
		);

		const whereClause = options.guildId ? { guildId: options.guildId } : {};
		const premiumMembers = await this.container.prisma.premiumMember.findMany({
			where: whereClause,
			select: {
				userId: true,
				guildId: true,
				customRoleId: true,
			},
		});

		let totalChecked = 0;
		let totalMismatches = 0;
		let totalMissing = 0;
		let fixed = 0;
		let totalOrphanedClansWithoutTask = 0;
		let orphanedClansFixed = 0;

		if (premiumMembers.length > 0) {
			for (const premiumMember of premiumMembers) {
				try {
					const guild = this.container.client.guilds.resolve(premiumMember.guildId);

					if (!guild) {
						this.container.logger.warn(
							`[PREMIUM ABILITY CHECK] Guild ${premiumMember.guildId} not found for user ${premiumMember.userId}`,
						);
						continue;
					}

					totalChecked++;

					let member;

					try {
						member = await guild.members.fetch(premiumMember.userId);
					} catch {
						totalMissing++;
						this.container.logger.warn(
							`[PREMIUM ABILITY CHECK] User ${premiumMember.userId} not found in guild ${guild.name} (${guild.id}) - may have left the server`,
						);

						// Fix missing members if mode is 'fix-missing' or 'fix-all'
						if (fixMode === 'fix-missing' || fixMode === 'fix-all') {
							await this.cleanupPremiumMember(
								premiumMember.guildId,
								premiumMember.userId,
								premiumMember.customRoleId,
								guild.name,
								'missing',
							);
							fixed++;
						}

						continue;
					}

					const memberAbilities = new MemberAbilities(member);
					await memberAbilities.computeAbilities();

					const hasAnyAbility =
						memberAbilities.hasAbility('canCreateClan') ||
						memberAbilities.hasAbility('canCreateCustomRole') ||
						memberAbilities.hasAbility('canGiftLegend') ||
						memberAbilities.hasAbility('areAbilitiesMultiGuild');

					if (!hasAnyAbility) {
						totalMismatches++;
						this.container.logger.warn(
							`[PREMIUM ABILITY CHECK] [PREMIUM MEMBER LOST ABILITIES] User ${member.user.tag} (${premiumMember.userId}) in guild ${guild.name} (${guild.id}) is in the premium members database but has NO premium abilities in Discord. This indicates they lost their premium role.`,
							{
								userId: premiumMember.userId,
								guildId: premiumMember.guildId,
								guildName: guild.name,
								userTag: member.user.tag,
								customRoleId: premiumMember.customRoleId,
							},
						);

						// Fix mismatches if mode is 'fix-mismatches' or 'fix-all'
						if (fixMode === 'fix-mismatches' || fixMode === 'fix-all') {
							await this.cleanupPremiumMember(
								premiumMember.guildId,
								premiumMember.userId,
								premiumMember.customRoleId,
								guild.name,
								'mismatch',
							);
							fixed++;
						}
					}
				} catch (error) {
					this.container.logger.error(
						`[PREMIUM ABILITY CHECK] Error checking premium member ${premiumMember.userId} in guild ${premiumMember.guildId}:`,
						error,
					);
				}
			}
		}

		// Check all clans for orphan issues
		this.container.logger.info('[PREMIUM ABILITY CHECK] Checking for orphaned clans...');

		const clans = await this.container.prisma.clan.findMany({
			where: options.guildId ? { guildId: options.guildId } : {},
			select: {
				customRoleId: true,
				deletionTaskId: true,
				guildId: true,
			},
		});

		for (const clan of clans) {
			try {
				let isOrphaned = false;
				let orphanReason = '';

				if (clan.deletionTaskId) {
					// Clan has a deletionTaskId, verify the scheduled task actually exists
					const scheduledTask = await this.container.prisma.schedule.findUnique({
						where: { id: clan.deletionTaskId },
					});

					if (!scheduledTask) {
						isOrphaned = true;
						orphanReason = `has deletionTaskId ${clan.deletionTaskId} but no scheduled task exists`;
					}
				} else {
					// Clan has no deletionTaskId, check if it has a premium member owner
					const premiumMember = await this.container.prisma.premiumMember.findFirst({
						where: {
							guildId: clan.guildId,
							customRoleId: clan.customRoleId,
						},
					});

					if (!premiumMember) {
						isOrphaned = true;
						orphanReason = 'has no premium member entry and no deletionTaskId';
					}
				}

				if (isOrphaned) {
					totalOrphanedClansWithoutTask++;
					const guild = this.container.client.guilds.resolve(clan.guildId);

					this.container.logger.warn(
						`[PREMIUM ABILITY CHECK] [ORPHANED CLAN] Clan with custom role ${clan.customRoleId} in guild ${clan.guildId} ${orphanReason}`,
					);

					// Delete orphaned clan immediately if fix mode allows
					if ((fixMode === 'fix-all' || fixMode === 'fix-missing') && guild) {
						try {
							const clanManager = new ClanManager(clan.customRoleId, clan.guildId);
							await clanManager.deleteClan();

							// Also delete the custom role from Discord
							const role = await guild.roles.fetch(clan.customRoleId).catch(() => null);
							if (role) {
								await role.delete('Orphaned clan cleanup');
							}

							orphanedClansFixed++;
							this.container.logger.info(
								`[PREMIUM ABILITY CHECK] [FIXED] Deleted orphaned clan with custom role ${clan.customRoleId} in guild ${guild.name} (${clan.guildId})`,
							);
						} catch (error) {
							this.container.logger.error(
								`[PREMIUM ABILITY CHECK] Failed to delete orphaned clan ${clan.customRoleId} in guild ${clan.guildId}:`,
								error,
							);
						}
					}
				}
			} catch (error) {
				this.container.logger.error(
					`[PREMIUM ABILITY CHECK] Error checking clan ${clan.customRoleId} in guild ${clan.guildId}:`,
					error,
				);
			}
		}

		this.container.logger.info(
			`[PREMIUM ABILITY CHECK] Completed. Checked ${totalChecked} members, found ${totalMismatches} mismatches, ${totalMissing} missing${totalOrphanedClansWithoutTask > 0 ? `, ${totalOrphanedClansWithoutTask} orphaned clans` : ''}${fixMode === 'dry-run' ? '' : `, fixed ${fixed} members and ${orphanedClansFixed} orphaned clans`}.`,
		);

		return {
			totalChecked,
			totalMismatches,
			totalMissing,
			fixed,
			totalOrphanedClansWithoutTask,
			orphanedClansFixed,
		};
	}
}
