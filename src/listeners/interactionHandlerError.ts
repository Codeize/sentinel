import { type InteractionHandlerError, Listener } from '@sapphire/framework';
import * as Sentry from '@sentry/node';
import { MessageFlags } from 'discord-api-types/v10';
import type { InteractionReplyOptions } from 'discord.js';
import { createInfoEmbed } from '../lib/utils/createEmbed.js';

export class InteractionHandlerErrorListener extends Listener {
	public async run(error: Error, context: InteractionHandlerError) {
		this.container.logger.error(`Interaction handler error in ${context.handler.name}:`, error);
		Sentry.captureException(error, {
			extra: {
				handler: context.handler.name,
				userId: context.interaction.user.id,
				guildId: context.interaction.guildId,
			},
		});

		if (context.interaction.isRepliable()) {
			const content: InteractionReplyOptions = {
				embeds: [createInfoEmbed('An error occurred while processing this interaction.')],
				flags: MessageFlags.Ephemeral,
			};
			if (context.interaction.replied || context.interaction.deferred) {
				await context.interaction.followUp(content).catch(() => null);
			} else {
				await context.interaction.reply(content).catch(() => null);
			}
		}
	}
}
