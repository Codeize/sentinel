import { Task } from '../../lib/schedule/tasks/Task.js';
import { LogPrefix } from '../../lib/utils/logPrefix.js';

export class CheckPendingKickResets extends Task {
	public async run() {
		// For logging purposes only
		const results = await this.container.prisma.user.findMany({
			where: {
				// Find all users who have a reset pending, and whose reset_at is less or equal to the current time
				AND: [{ reset_kicks_at: { not: null } }, { reset_kicks_at: { lte: new Date() } }],
			},
			select: { id: true },
		});

		if (!results.length) {
			this.container.logger.info(`${LogPrefix.KICK_COUNTER_RESET} No users had their kick counters reset`);
			return null;
		}

		// Find all users that should have their counter reset and reset them
		await this.container.prisma.user.updateMany({
			where: {
				// Find all users who have a reset pending, and whose reset_at is less or equal to the current time
				AND: [{ reset_kicks_at: { not: null } }, { reset_kicks_at: { lte: new Date() } }],
			},
			data: {
				// Set their kicks back to 0 and remove their timer
				kicks: 0,
				reset_kicks_at: null,
			},
		});

		this.container.logger.info(
			`${LogPrefix.KICK_COUNTER_RESET} ${results.length} users had their kick counters reset`,
		);
		this.container.logger.info(`${LogPrefix.KICK_COUNTER_RESET}`, JSON.stringify(results.map((it) => it.id)));

		return null;
	}
}
