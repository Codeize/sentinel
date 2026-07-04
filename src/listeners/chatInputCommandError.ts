import { type ChatInputCommandErrorPayload, Listener } from '@sapphire/framework';
import * as Sentry from '@sentry/node';
import { MessageFlags } from 'discord-api-types/v10';
import type { UserError } from '../lib/extensions/UserError.js';
import { createInfoEmbed } from '../lib/utils/createEmbed.js';

export default class extends Listener {
	public async run(error: Error | UserError, context: ChatInputCommandErrorPayload) {
		const { interaction } = context;
		const embeds = [createInfoEmbed(error.message)];

		try {
			if (interaction.deferred) {
				// A pending "thinking..." response - fill it with the error instead of leaving it hanging.
				await interaction.editReply({ embeds });
			} else if (interaction.replied) {
				await interaction.followUp({ flags: MessageFlags.Ephemeral, embeds });
			} else {
				await interaction.reply({ flags: MessageFlags.Ephemeral, embeds });
			}
		} catch (responseError) {
			// The interaction may already be gone (e.g. 10062 if the 3s window elapsed) - delivering the
			// error message must not itself throw and cascade into another listener error.
			this.container.logger.warn('Failed to deliver command error message to the user', responseError);
		}

		if (!(error as UserError).isArgumentError) {
			this.container.logger.error(error.stack ?? (error.message || error));
			Sentry.captureException(error, {
				extra: {
					command: context.command.name,
					userId: context.interaction.user.id,
					guildId: context.interaction.guildId,
				},
			});
		}
	}
}
