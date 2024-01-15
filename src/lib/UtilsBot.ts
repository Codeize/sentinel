import { SqlHighlighter } from '@mikro-orm/sql-highlighter';
import type Prisma from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { container, LogLevel, SapphireClient, Store } from '@sapphire/framework';
import { bold, cyanBright, gray, green } from 'colorette';
import type { ClientOptions } from 'discord.js';
import { ScheduleManager } from './schedule/ScheduleManager.js';
import { Task } from './schedule/tasks/Task.js';

export class UtilsBot extends SapphireClient {
	public override schedule = new ScheduleManager(this);

	private readonly sqlHighlighter = new SqlHighlighter();

	public constructor(options: ClientOptions) {
		super(options);
		this.stores.register(new Store(Task, { name: 'tasks' }));
	}

	public override fetchPrefix = () => null;

	public override async login(token?: string) {
		const highlighter = this.sqlHighlighter;

		const prisma = new PrismaClient({
			errorFormat: 'pretty',
			log: [
				{ emit: 'stdout', level: 'warn' },
				{ emit: 'stdout', level: 'error' },
			],
		}).$extends({
			name: 'performance_tracking',
			query: {
				async $allOperations({ args, operation, query, model }) {
					// If we're not in debug mode, just run the query and return
					if (!container.logger.has(LogLevel.Debug)) {
						return query(args);
					}

					const start = performance.now();
					const result = await query(args);
					const end = performance.now();
					const time = end - start;

					if (model) {
						const stringifiedArgs = JSON.stringify(args, null, 2)
							.split('\n')
							.map((line) => gray(line))
							.join('\n');

						container.logger.debug(
							`${cyanBright('prisma:query')} ${bold(
								`${model}.${operation}(${stringifiedArgs}${bold(')')}`,
							)} took ${bold(`${green(time.toFixed(4))}ms`)}`,
						);
					} else {
						// Most likely in $executeRaw/queryRaw
						const casted = args as { strings?: string[]; values?: unknown[] } | undefined;

						const consoleMessage = [`${cyanBright('prisma:query')} `, bold(`Prisma.${operation}(\``)];

						const sqlString = [];

						if (casted?.strings) {
							if (casted.values) {
								for (const str of casted.strings) {
									sqlString.push(str);

									const value = casted.values.shift();
									if (value) {
										sqlString.push(JSON.stringify(value));
									}
								}
							} else {
								// just add all the strings
								sqlString.push(...casted.strings);
							}

							consoleMessage.push(highlighter.highlight(sqlString.join('')));
						} else if (Array.isArray(args)) {
							// Most likely in $executeRawUnsafe/queryRawUnsafe
							const sqlString = args.shift() as string | undefined;

							if (sqlString) {
								if (args.length) {
									for (let paramIndex = 1; paramIndex < args.length; paramIndex++) {
										sqlString.replace(`$${paramIndex}`, JSON.stringify(args[paramIndex - 1]));
									}

									consoleMessage.push(highlighter.highlight(sqlString));
								} else {
									consoleMessage.push(highlighter.highlight(sqlString));
								}
							} else {
								consoleMessage.push(gray(JSON.stringify(args)));
							}
						} else {
							// Who tf knows brother
							consoleMessage.push(gray(JSON.stringify(args)));
						}

						consoleMessage.push(bold('`) '), `took ${bold(`${green(time.toFixed(4))}ms`)}`);

						container.logger.debug(consoleMessage.join(''));
					}

					return result;
				},
			},
		}) as PrismaClient<{ errorFormat: 'pretty' }>;

		container.prisma = prisma;

		await prisma.$connect();

		this.logger.info('Logging in to Discord');
		return super.login(token);
	}

	public override async destroy() {
		void container.prisma.$disconnect();
		return super.destroy();
	}
}

declare module 'discord.js' {
	export interface Client {
		schedule: ScheduleManager;
	}
}

declare module '@sapphire/framework' {
	export interface StoreRegistryEntries {
		tasks: Store<Task>;
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		prisma: Prisma.PrismaClient;
	}
}
