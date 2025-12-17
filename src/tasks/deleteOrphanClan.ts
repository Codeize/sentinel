import { ClanManager } from '../lib/abilities/ClanManager.js';
import { Task, type TaskRunData } from '../lib/schedule/tasks/Task.js';

export class DeleteOrphanClan extends Task {
	public async run(data: TaskRunData) {
		const { guildId, userId } = JSON.parse(data.data!) as { guildId: string; userId: string };

		await new ClanManager(userId, guildId).deleteOrphanClan();

		return null;
	}
}
