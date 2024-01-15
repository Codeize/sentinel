import process from 'node:process';
import { Task } from '../../lib/schedule/tasks/Task.js';

export class CheckPendingKickResets extends Task {
	public async run() {
		// Get all users who need the role removed
		const results = (
			await this.container.prisma.user.findMany({
				where: {
					// Find all users who have a role removal pending, and whose remove_at is less or equal to the current time
					AND: [{ remove_role_at: { not: null } }, { remove_role_at: { lte: new Date() } }],
				},
				select: { id: true },
			})
		).map((it) => it.id);

		// Preemptively update the database to prevent duplicates
		await this.container.prisma.user.updateMany({
			where: { id: { in: results } },
			data: { remove_role_at: null },
		});

		const guild = this.container.client.guilds.resolve(process.env.LFG_GUILD_ID!)!;

		// Go through each user
		for (const id of results) {
			// Get the member
			const member = await guild.members.fetch({ user: id }).catch(() => null);

			// If the member isn't present (kicked, banned, left, voodoo magic happened), skip them
			if (!member) {
				this.container.logger.debug(`User ${id} can't be found anymore, skipping`);
				continue;
			}

			// Remove the role
			await member.roles.remove(
				process.env.BLOCKED_FROM_VOICE_CHANNEL_ROLE_ID!,
				'Removed role from user due to vote kick timeout',
			);
		}

		this.container.logger.info(`${results.length} users had their timeout role removed`);
		this.container.logger.info(JSON.stringify(results));

		return null;
	}
}
