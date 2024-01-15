import { Listener } from '@sapphire/framework';
import type { PreconditionError, type ChatInputCommandDeniedPayload } from '@sapphire/framework';
import { createInfoEmbed } from '../lib/utils/createInfoEmbed.js';

export class ChatInputCommandDeniedListener extends Listener {
	public async run(error: PreconditionError, context: ChatInputCommandDeniedPayload) {
		await context.interaction.reply({ embeds: [createInfoEmbed(error.message)], ephemeral: true });
	}
}
