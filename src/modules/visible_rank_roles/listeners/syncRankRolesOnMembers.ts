import { RoleSyncType } from '@prisma/client';
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, container } from '@sapphire/framework';
import type { GuildMember, PartialGuildMember } from 'discord.js';

async function removeRoleFromMember(member: GuildMember, roleId: string) {
	try {
		await member.roles.remove(roleId, 'Rank role visibility sync');
	} catch (error) {
		container.logger.warn(
			`[Sync Rank Roles] Failed to remove visible role after user lost the original role`,
			{ roleId, user: member.id },
			error,
		);
	}
}

async function addRoleToMember(member: GuildMember, roleId: string) {
	try {
		await member.roles.add(roleId, 'Rank role visibility sync');
	} catch (error) {
		container.logger.warn(
			`[Sync Rank Roles] Failed to add visible role after user gained the original role`,
			{ roleId, user: member.id },
			error,
		);
	}
}

@ApplyOptions<Listener.Options>({ event: Events.GuildMemberUpdate })
export class SyncRankRoles extends Listener<typeof Events.GuildMemberUpdate> {
	public override async run(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
		const memberData = await this.container.prisma.guildMember.findUnique({
			where: { userId_guildId: { guildId: newMember.guild.id, userId: newMember.id } },
		});

		if (!memberData?.syncVisibleRanks) {
			return;
		}

		const toggleableRoles = await this.container.prisma.roleSync.findMany({
			where: {
				type: RoleSyncType.VisibleRank,
				origin_guild_id: newMember.guild.id,
			},
		});

		for (const { origin_role_id: mainRankRole, destination_role_id: visibleRankRole } of toggleableRoles) {
			// Check if the user had the role before, and now they don't have it
			// if they don't have it anymore, and they have the visible role, remove it

			// Check if the user has the main role
			const hadRankRole = oldMember.roles.cache.has(mainRankRole);
			const hasRankRole = newMember.roles.cache.has(mainRankRole);
			const hasVisibleRole = newMember.roles.cache.has(visibleRankRole);

			// Had the rank, now they don't -> remove the visible role if present
			if (hadRankRole && !hasRankRole) {
				if (hasVisibleRole) {
					await removeRoleFromMember(newMember, visibleRankRole);
				}
			}
			// Didn't have the rank, now they do -> add the visible role
			else if (!hadRankRole && hasRankRole) {
				await addRoleToMember(newMember, visibleRankRole);
			}
		}
	}
}
