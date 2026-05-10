import { ApplyOptions } from '@sapphire/decorators';
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import { MemberAbilities } from '../../../lib/abilities/MemberAbilities.js';
import { createInfoEmbed } from '../../../lib/utils/createEmbed.js';
import { ensureFullMember } from '../../../lib/utils.js';
import { buildPickRolePagePayload, parsePickRoleCustomId, PICK_ROLE_PAGE_PREFIX } from '../commands/pick-role.js';

@ApplyOptions<InteractionHandler.Options>({
	interactionHandlerType: InteractionHandlerTypes.Button,
})
export class PickRolePageHandler extends InteractionHandler {
	public override parse(interaction: ButtonInteraction) {
		const page = parsePickRoleCustomId(interaction.customId, PICK_ROLE_PAGE_PREFIX);
		if (page === null) {
			return this.none();
		}

		return this.some({ page });
	}

	public override async run(interaction: ButtonInteraction<'cached'>, data: InteractionHandler.ParseResult<this>) {
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

		const payload = buildPickRolePagePayload({
			guild: interaction.guild,
			member,
			pickableRoleIds,
			page: data.page,
		});

		await interaction.update(payload);
	}
}
