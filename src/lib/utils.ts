import { container } from '@sapphire/framework';
import { DurationFormatter, Timestamp } from '@sapphire/time-utilities';
import {
	Message,
	type PartialGuildMember,
	type User,
	type GatewayMessageCreateDispatchData,
	type Interaction,
	type GuildMember,
} from 'discord.js';

export const timeFormat = new Timestamp('YYYY-MM-DD [at] HH:mm:ss [UTC]');

export const durationFormat = new DurationFormatter();

export function toReadableUser(user: User) {
	return `${user.tag} (${user.id})` as const;
}

export async function fetchReadableUser(id: string) {
	const user = await container.client.users.fetch(id);
	return toReadableUser(user);
}

/**
 * Ensures that a GuildMember is fully hydrated (not partial).
 * If the member is partial, fetches the full member data.
 *
 * @param member - The guild member to ensure is fully hydrated
 * @returns A promise that resolves to the full guild member
 */
export async function ensureFullMember(member: GuildMember | PartialGuildMember): Promise<GuildMember> {
	if (member.partial) {
		return member.fetch();
	}

	return member;
}

export async function getMemberFromInteraction(interaction: Interaction) {
	if (!interaction.inCachedGuild()) {
		return null;
	}

	const { guild } = interaction;
	const member = await ensureFullMember(interaction.member);

	return guild.members.fetch({ user: member.user.id });
}

export function getMessageUrlFromInteractionResponse(message: GatewayMessageCreateDispatchData | Message) {
	if (message instanceof Message) {
		return message.url;
	}

	return `https://discord.com/channels/${message.guild_id ?? '@me'}/${message.channel_id}/${message.id}`;
}
