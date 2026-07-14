import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { MemberAbilities } from '../../../lib/abilities/MemberAbilities.js';
import { LogPrefix } from '../../../lib/utils/logPrefix.js';
import { CUSTOM_COMMAND_TRIGGER } from '../commands/custom-command.js';

@ApplyOptions<Listener.Options>({
	event: Events.MessageCreate,
})
export class ClanCustomCommands extends Listener {
	public async run(message: Message) {
		// We ignore needless attempted command triggers, from bots or webhooks.
		if (!message.guildId || message.author.bot || message.webhookId) {
			return;
		}

		if (!message.channel.isTextBased() || !message.channel.isSendable()) return;

		const trigger = message.content.trim().split(/\s+/, 1)[0]?.toLowerCase();
		if (!trigger?.startsWith(CUSTOM_COMMAND_TRIGGER)) {
			return;
		}

		const customCommand = await this.container.prisma.clanCustomCommand.findUnique({
			where: { guildId_trigger: { guildId: message.guildId, trigger } },
		});

		if (!customCommand) {
			return;
		}

		// Only the clan owner and its members can run custom commands.
		const [membership, owner] = await Promise.all([
			this.container.prisma.clanMember.findUnique({
				where: {
					clanGuildId_clanCustomRoleId_userId: {
						clanGuildId: message.guildId,
						clanCustomRoleId: customCommand.clanCustomRoleId,
						userId: message.author.id,
					},
				},
			}),
			this.container.prisma.premiumMember.findFirst({
				where: {
					guildId: message.guildId,
					userId: customCommand.createdByUserId,
					customRoleId: customCommand.clanCustomRoleId,
				},
			}),
		]);

		if (!membership || !owner) {
			return;
		}

		const ownerMember = await message.guild?.members.fetch(owner.userId).catch(() => null);
		if (!ownerMember) {
			return;
		}

		const ownerAbilities = new MemberAbilities(ownerMember);
		await ownerAbilities.computeAbilities();

		if (!ownerAbilities.hasAbility('canCreateCustomCommand')) {
			return;
		}

		const content = [customCommand.responseText, customCommand.responseMediaUrl].filter(Boolean).join('\n');

		try {
			await message.channel.send({ content });
		} catch (error) {
			this.container.logger.warn(`${LogPrefix.CLAN} Failed to send clan custom command response`, {
				guildId: message.guildId,
				channelId: message.channelId,
				commandId: customCommand.id,
				trigger,
				error,
			});
		}
	}
}
