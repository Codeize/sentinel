import { Listener } from '@sapphire/framework';
import type { PreconditionError, ChatInputCommandDeniedPayload } from '@sapphire/framework';
import { MessageFlags } from 'discord-api-types/v10';
import { createInfoEmbed } from '../lib/utils/createEmbed.js';

export class ChatInputCommandDeniedListener extends Listener {
	public async run(error: PreconditionError, context: ChatInputCommandDeniedPayload) {
		await context.interaction.reply({ embeds: [createInfoEmbed(error.message)], flags: MessageFlags.Ephemeral });
	}
}
