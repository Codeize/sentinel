const locks = new Map<string, Promise<void>>();

/**
 * Serialises tasks per guild so concurrent interactions cannot race each other.
 * Tasks for different guilds still run in parallel.
 */
export async function withGuildLock<T>(guildId: string, task: () => Promise<T>): Promise<T> {
	const previous: Promise<void> | undefined = locks.get(guildId);

	// Assigned synchronously by the executor below.
	let release!: () => void;
	const current = new Promise<void>((resolve): void => {
		release = resolve;
	});

	// Claimed synchronously, so whoever comes next always queues behind this task.
	locks.set(guildId, current);

	if (previous) {
		await previous;
	}

	try {
		return await task();
	} finally {
		// Releases even when the task throws, so a failure cannot deadlock the queue behind it.
		release();

		if (locks.get(guildId) === current) {
			locks.delete(guildId);
		}
	}
}
