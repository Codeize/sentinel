import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { GuildEmoji } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.GuildEmojiDelete })
export class CustomEmojiDeleteListener extends Listener<typeof Events.GuildEmojiDelete> {
	public override async run(emoji: GuildEmoji) {
		await this.container.prisma.customEmoji.delete({ where: { emojiId: emoji.id } }).catch(() => null);
	}
}
