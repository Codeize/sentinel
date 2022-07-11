import type { GuildTextBasedChannel, Message } from 'discord.js';
import { Task } from '../lib/schedule/tasks/Task.js';

export class CheckAutoPins extends Task {
	public async run() {
		const autoPins = await this.container.prisma.autoPin.findMany();

		if (autoPins.length === 0) {
			return null;
		}

		for (const autoPin of autoPins) {
			const channel = (await this.container.client.channels
				.fetch(autoPin.channel_id)
				.catch(() => null)) as GuildTextBasedChannel | null;

			if (!channel) {
				this.container.logger.warn(`Failed to find channel ${autoPin.channel_id} for autopin ${autoPin.id}`);
				continue;
			}

			let msg: Message | undefined;

			try {
				const lastMessages = await channel.messages.fetch({ limit: 1 }, { cache: false, force: true });

				msg = lastMessages.first();
			} catch (err) {
				this.container.logger.warn(
					`Failed to fetch messages for autopin ${autoPin.id} in channel ${channel.name} (${channel.id})`,
					err,
				);
				continue;
			}

			if ((msg?.id ?? '-0') === autoPin.last_message_id) {
				// Same message as before, update and skip
				this.container.logger.debug(`Skipping autopin ${autoPin.id} as the last message is the autopin one`);

				await this.container.prisma.autoPin.update({
					data: { last_check: new Date() },
					where: { id: autoPin.id },
				});

				continue;
			}

			// Try deleting the message
			if (autoPin.last_message_id) {
				try {
					await channel.messages.delete(autoPin.last_message_id);
				} catch {}
			}

			const newMessage = await channel.send({
				content: autoPin.content,
				allowedMentions: { parse: [] },
			});

			await this.container.prisma.autoPin.update({
				data: {
					last_message_id: newMessage.id,
					last_check: new Date(),
				},
				where: { id: autoPin.id },
			});

			this.container.logger.info(`Successfully autopinned ${autoPin.id} (new message id: ${newMessage.id})`);
		}

		return null;
	}
}
