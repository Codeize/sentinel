import { type ChatInputCommandDeniedPayload, Listener } from '@sapphire/framework';
import { MessageFlags } from 'discord-api-types/v10';
import type { UserError } from '../lib/extensions/UserError.js';
import { createInfoEmbed } from '../lib/utils/createEmbed.js';

export default class extends Listener {
	public async run(error: Error | UserError, context: ChatInputCommandDeniedPayload) {
		if (context.interaction.replied) {
			await context.interaction.followUp({
				flags: MessageFlags.Ephemeral,
				embeds: [createInfoEmbed(error.message)],
			});
		} else {
			await context.interaction.reply({
				flags: MessageFlags.Ephemeral,
				embeds: [createInfoEmbed(error.message)],
			});
		}

		if (!(error as UserError).isArgumentError) this.container.logger.error(error.stack ?? (error.message || error));
	}
}
