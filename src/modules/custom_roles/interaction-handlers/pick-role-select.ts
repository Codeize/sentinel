import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { type StringSelectMenuInteraction } from 'discord.js';
import { MemberAbilities } from '../../../lib/abilities/MemberAbilities.js';
import { createInfoEmbed } from '../../../lib/utils/createEmbed.js';
import { LogPrefix } from '../../../lib/utils/logPrefix.js';
import { ensureFullMember } from '../../../lib/utils.js';
import { PICK_ROLE_SELECT_CUSTOM_ID } from '../commands/pick-role.js';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export class PickRoleSelectHandler extends InteractionHandler {
	public override parse(interaction: StringSelectMenuInteraction) {
		if (interaction.customId !== PICK_ROLE_SELECT_CUSTOM_ID) {
			return this.none();
		}

		return this.some();
	}

	public override async run(interaction: StringSelectMenuInteraction<'cached'>) {
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

		const pickableRoleIds = new Set(guildConfig?.pickableRoleIds ?? []);

		if (pickableRoleIds.size === 0) {
			await interaction.update({
				embeds: [createInfoEmbed('There are no perk roles configured in this server.')],
				components: [],
			});
			return;
		}

		const requested = new Set(interaction.values.filter((id) => pickableRoleIds.has(id)));

		const member = await ensureFullMember(interaction.member);

		const toAdd: string[] = [];
		const toRemove: string[] = [];

		for (const roleId of pickableRoleIds) {
			const has = member.roles.cache.has(roleId);
			const wants = requested.has(roleId);

			if (wants && !has) {
				toAdd.push(roleId);
			} else if (!wants && has) {
				toRemove.push(roleId);
			}
		}

		if (toAdd.length === 0 && toRemove.length === 0) {
			await interaction.update({
				embeds: [createInfoEmbed('No changes to your perk roles.')],
				components: [],
			});
			return;
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

		const summaryLines = [`Updated your perk roles.`];

		if (successfulAdds > 0) {
			summaryLines.push(`> Added: ${successfulAdds}`);
		}

		if (successfulRemoves > 0) {
			summaryLines.push(`> Removed: ${successfulRemoves}`);
		}

		if (failedAdds.length > 0 || failedRemoves.length > 0) {
			summaryLines.push(
				`> ⚠️ ${failedAdds.length + failedRemoves.length} role change(s) failed (likely above my role hierarchy).`,
			);
		}

		await interaction.update({
			embeds: [createInfoEmbed(summaryLines.join('\n'))],
			components: [],
		});
	}
}
