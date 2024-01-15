import '@sapphire/plugin-logger/register';

import process from 'node:process';
import { inspect } from 'node:util';
import { ApplicationCommandRegistries, LogLevel, RegisterBehavior } from '@sapphire/framework';
import { Time } from '@sapphire/time-utilities';
import { createColors } from 'colorette';
import { GuildMember, type User } from 'discord.js';
import { ActivityType, IntentsBitField, Options, Partials } from 'discord.js';
import { UtilsBot } from './lib/UtilsBot.js';

ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(RegisterBehavior.Overwrite);

inspect.defaultOptions.depth = 2;
const colorette = createColors({ useColor: true });

function checkUserOrMember(userOrMember: GuildMember | User) {
	if (userOrMember.id !== userOrMember.client.user!.id) {
		if (userOrMember instanceof GuildMember) {
			return userOrMember.voice.channelId !== null;
		}

		return false;
	}

	return true;
}

const client = new UtilsBot({
	presence: {
		activities: [
			{
				name: 'with tools!',
				type: ActivityType.Playing,
			},
		],
	},
	intents: new IntentsBitField([
		IntentsBitField.Flags.Guilds,
		IntentsBitField.Flags.GuildMembers,
		IntentsBitField.Flags.GuildBans,
		IntentsBitField.Flags.GuildMessages,
		IntentsBitField.Flags.GuildVoiceStates,
		IntentsBitField.Flags.DirectMessages,
		IntentsBitField.Flags.MessageContent,
	]),
	partials: [Partials.Channel, Partials.Message],
	caseInsensitiveCommands: true,
	loadMessageCommandListeners: true,
	logger: {
		depth: 2,
		level: Reflect.has(process.env, 'PM2_HOME') ? LogLevel.Info : LogLevel.Debug,
	},
	loadDefaultErrorListeners: false,
	makeCache: Options.cacheWithLimits({
		MessageManager: {
			maxSize: 50,
		},
		UserManager: {
			maxSize: 100,
			keepOverLimit: (user) => user.id === user.client.user!.id,
		},
		GuildMemberManager: {
			maxSize: 100,
			keepOverLimit: (member) => member.user.id === member.client.user!.id || Boolean(member.voice.channelId),
		},
		// Useless props for the bot
		GuildEmojiManager: { maxSize: 0 },
		GuildStickerManager: { maxSize: 0 },
	}),
	sweepers: {
		// Members, users and messages are needed for the bot to function
		guildMembers: {
			interval: Time.Minute * 15,
			// Sweep all members except the bot member and members in voice channels
			filter: () => checkUserOrMember,
		},
		users: {
			interval: Time.Minute * 15,
			// Sweep all users except the bot user
			filter: () => checkUserOrMember,
		},
		messages: {
			interval: Time.Minute * 5,
			lifetime: Time.Minute * 15,
		},
	},
});

try {
	await client.login();
} catch (error) {
	client.logger.error(colorette.red('Failed to launch the bot:'), error);
	await client.destroy();
}
