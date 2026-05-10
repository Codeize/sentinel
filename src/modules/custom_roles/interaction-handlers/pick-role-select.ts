import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { type StringSelectMenuInteraction } from 'discord.js';
import { MemberAbilities } from '../../../lib/abilities/MemberAbilities.js';
import { createInfoEmbed } from '../../../lib/utils/createEmbed.js';
import { LogPrefix } from '../../../lib/utils/logPrefix.js';
import { ensureFullMember } from '../../../lib/utils.js';
import {
	buildPickRolePagePayload,
	parsePickRoleCustomId,
	PICK_ROLE_PAGE_SIZE,
	PICK_ROLE_SELECT_PREFIX,
	resolvePickableRoles,
} from '../commands/pick-role.js';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export class PickRoleSelectHandler extends InteractionHandler {
	public override parse(interaction: StringSelectMenuInteraction) {
		const page = parsePickRoleCustomId(interaction.customId, PICK_ROLE_SELECT_PREFIX);
		if (page === null) {
			return this.none();
		}

		return this.some({ page });
	}

	public override async run(
		interaction: StringSelectMenuInteraction<'cached'>,
		data: InteractionHandler.ParseResult<this>,
	) {
		const memberAbilities = new MemberAbilities(interaction.member);
		await memberAbilities.computeAbilities();

		if (!memberAbilities.hasAbility('canPickSubscriberRole')) {
			await interaction.update({
				embeds: [createInfoEmbed('You no longer have the ability to pick subscriber perk roles.')],
				components: [],
			});
			return;
		}

		const guildConfig = await this.container.prisma.premiumGuildRoleConfig.findFirst({
			where: { guildId: interaction.guildId },
		});

		const pickableRoleIds = guildConfig?.pickableRoleIds ?? [];

		if (pickableRoleIds.length === 0) {
			await interaction.update({
				embeds: [createInfoEmbed('There are no perk roles configured in this server.')],
				components: [],
			});
			return;
		}

		const member = await ensureFullMember(interaction.member);
		const resolvedRoles = resolvePickableRoles(interaction.guild, pickableRoleIds);

		const start = data.page * PICK_ROLE_PAGE_SIZE;
		const pageRoleIds = new Set(resolvedRoles.slice(start, start + PICK_ROLE_PAGE_SIZE).map((role) => role.id));

		const requested = new Set(interaction.values.filter((id) => pageRoleIds.has(id)));

		const toAdd: string[] = [];
		const toRemove: string[] = [];

		for (const roleId of pageRoleIds) {
			const has = member.roles.cache.has(roleId);
			const wants = requested.has(roleId);

			if (wants && !has) {
				toAdd.push(roleId);
			} else if (!wants && has) {
				toRemove.push(roleId);
			}
		}

		const reason = `Updated via /pick-role by ${interaction.user.tag} (${interaction.user.id})`;
		const failedAdds: string[] = [];
		const failedRemoves: string[] = [];

		for (const roleId of toAdd) {
			try {
				await member.roles.add(roleId, reason);
			} catch (error) {
				failedAdds.push(roleId);
				this.container.logger.warn(`${LogPrefix.PREMIUM} Failed to add perk role`, {
					userId: interaction.user.id,
					guildId: interaction.guildId,
					roleId,
					error,
				});
			}
		}

		for (const roleId of toRemove) {
			try {
				await member.roles.remove(roleId, reason);
			} catch (error) {
				failedRemoves.push(roleId);
				this.container.logger.warn(`${LogPrefix.PREMIUM} Failed to remove perk role`, {
					userId: interaction.user.id,
					guildId: interaction.guildId,
					roleId,
					error,
				});
			}
		}

		const successfulAdds = toAdd.length - failedAdds.length;
		const successfulRemoves = toRemove.length - failedRemoves.length;

		const noticeLines: string[] = [];

		if (successfulAdds === 0 && successfulRemoves === 0 && failedAdds.length === 0 && failedRemoves.length === 0) {
			noticeLines.push('_No changes._');
		} else {
			noticeLines.push('_Updated your perk roles._');

			if (successfulAdds > 0) {
				noticeLines.push(`> Added: ${successfulAdds}`);
			}

			if (successfulRemoves > 0) {
				noticeLines.push(`> Removed: ${successfulRemoves}`);
			}

			if (failedAdds.length > 0 || failedRemoves.length > 0) {
				noticeLines.push(
					`> ⚠️ ${failedAdds.length + failedRemoves.length} role change(s) failed (likely above my role hierarchy).`,
				);
			}
		}

		const refreshedMember = await ensureFullMember(interaction.member);

		const payload = buildPickRolePagePayload({
			guild: interaction.guild,
			member: refreshedMember,
			pickableRoleIds,
			page: data.page,
			notice: noticeLines.join('\n'),
		});

		await interaction.update(payload);
	}
}
