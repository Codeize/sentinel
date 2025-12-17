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
	totalChecked: number;
	totalMismatches: number;
	totalMissing: number;
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

		if (premiumMembers.length === 0) {
			this.container.logger.info('[PREMIUM ABILITY CHECK] No premium members found in database.');
			return { totalChecked: 0, totalMismatches: 0, totalMissing: 0, fixed: 0 };
		}

		let totalChecked = 0;
		let totalMismatches = 0;
		let totalMissing = 0;
		let fixed = 0;

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
						try {
							await this.container.prisma.premiumMember.delete({
								where: {
									guildId_userId: {
										guildId: premiumMember.guildId,
										userId: premiumMember.userId,
									},
								},
							});
							fixed++;
							this.container.logger.info(
								`[PREMIUM ABILITY CHECK] [FIXED MISSING] Removed premium member entry for missing user ${premiumMember.userId} in guild ${guild.name} (${guild.id})`,
							);
						} catch (error) {
							this.container.logger.error(
								`[PREMIUM ABILITY CHECK] Failed to remove missing premium member ${premiumMember.userId} in guild ${premiumMember.guildId}:`,
								error,
							);
						}
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
						try {
							await this.container.prisma.premiumMember.delete({
								where: {
									guildId_userId: {
										guildId: premiumMember.guildId,
										userId: premiumMember.userId,
									},
								},
							});
							fixed++;
							this.container.logger.info(
								`[PREMIUM ABILITY CHECK] [FIXED] Removed premium member entry for user ${member.user.tag} (${premiumMember.userId}) in guild ${guild.name} (${guild.id})`,
							);
						} catch (error) {
							this.container.logger.error(
								`[PREMIUM ABILITY CHECK] Failed to remove premium member ${premiumMember.userId} in guild ${premiumMember.guildId}:`,
								error,
							);
						}
					}
				}
			} catch (error) {
				this.container.logger.error(
					`[PREMIUM ABILITY CHECK] Error checking premium member ${premiumMember.userId} in guild ${premiumMember.guildId}:`,
					error,
				);
			}
		}

		this.container.logger.info(
			`[PREMIUM ABILITY CHECK] Completed. Checked ${totalChecked} members, found ${totalMismatches} mismatches, ${totalMissing} missing${fixMode === 'dry-run' ? '' : `, fixed ${fixed}`}.`,
		);

		return { totalChecked, totalMismatches, totalMissing, fixed };
	}
}
