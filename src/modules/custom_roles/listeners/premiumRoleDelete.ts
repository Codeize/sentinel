import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { Role } from 'discord.js';
import { RoleAbilitiesCalculator } from '../../../lib/abilities/RoleAbilities.js';

@ApplyOptions<Listener.Options>({ event: Events.GuildRoleDelete })
export class PremiumRoleDeleteListener extends Listener<typeof Events.GuildRoleDelete> {
	public override async run(role: Role) {
		const roleAbilitiesCalculator = new RoleAbilitiesCalculator(role.guild.id);

		await roleAbilitiesCalculator.computeList();

		const isPremiumAbilityRole = roleAbilitiesCalculator.getAllPremiumRoleIds().includes(role.id);

		const pickableConfig = await this.container.prisma.premiumGuildRoleConfig.findFirst({
			where: { guildId: role.guild.id, pickableRoleIds: { hasSome: [role.id] } },
		});

		if (pickableConfig) {
			await this.container.prisma.premiumGuildRoleConfig.update({
				where: { guildId: role.guild.id },
				data: { pickableRoleIds: { set: pickableConfig.pickableRoleIds.filter((id) => id !== role.id) } },
			});
		}

		// If this role was a cleanup separator, clear that pointer so the leftover-role cleanup won't run unbounded
		await this.container.prisma.premiumGuildRoleConfig.updateMany({
			where: { guildId: role.guild.id, topSeparatorRoleId: role.id },
			data: { topSeparatorRoleId: null },
		});

		await this.container.prisma.premiumGuildRoleConfig.updateMany({
			where: { guildId: role.guild.id, bottomSeparatorRoleId: role.id },
			data: { bottomSeparatorRoleId: null },
		});

		if (!isPremiumAbilityRole) {
			return;
		}

		// Delete all data about this role's abilities
		await this.container.prisma.roleAbilities.delete({
			where: { guildId_roleId: { guildId: role.guild.id, roleId: role.id } },
		});

		// If this role was the legend role, remove that data
		await this.container.prisma.premiumGuildRoleConfig.updateMany({
			where: { guildId: role.guild.id, legendRoleId: role.id },
			data: { legendRoleId: null },
		});

		// If members had this role as their custom role, remove that data
		await this.container.prisma.premiumMember.updateMany({
			where: { guildId: role.guild.id, customRoleId: role.id },
			data: { customRoleId: null },
		});

		// If this role was part of the staff roles, remove it from there
		const config = await this.container.prisma.premiumGuildRoleConfig.findFirst({
			where: { guildId: role.guild.id, staffRoles: { hasSome: [role.id] } },
		});

		if (config) {
			await this.container.prisma.premiumGuildRoleConfig.update({
				where: { guildId: role.guild.id },
				data: { staffRoles: { set: config.staffRoles.filter((id) => id !== role.id) } },
			});
		}
	}
}
