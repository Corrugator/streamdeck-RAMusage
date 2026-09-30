import { action } from '@elgato/streamdeck';
import { RateAction, Rates, RateSettings } from './rate-action';
import { readDiskRates } from '../disk';

export const DEFAULT_DISK_IO_COLORS = { down: '#BF5AF2', up: '#FF9F0A' };

/** Disk read ("down") / write ("up") rates across all disks. */
@action({ UUID: 'com.corrugator.systemusage.diskio' })
export class DiskIoAction extends RateAction<RateSettings> {
  constructor() {
    super(DEFAULT_DISK_IO_COLORS, { down: 'R', up: 'W' });
  }

  protected defaultLabel(): string {
    return 'DISK';
  }

  protected applyOwnSettings(): boolean {
    return false;
  }

  protected async sampleRates(): Promise<Rates> {
    const { read, write } = await readDiskRates();
    return { down: read, up: write };
  }
}
