import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { red } from 'colorette';

@ApplyOptions<Listener.Options>({ event: 'wtf' })
export class WtfListener extends Listener {
	public run(message: Error | string) {
		this.container.logger.warn(red('Encountered unexpected error'), message);
	}
}
