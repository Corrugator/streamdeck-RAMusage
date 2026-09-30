import { action } from '@elgato/streamdeck';
import { CommonSettings, MetricAction, Sample } from './metric-action';
import { readDiskSpace } from '../disk';
import { formatBytes, Thresholds } from '../render';

type DiskSubline = 'free' | 'used' | 'none';

type DiskSettings = CommonSettings & {
  path?: string;
  subline?: DiskSubline;
};

@action({ UUID: 'com.corrugator.systemusage.disk' })
export class DiskAction extends MetricAction<DiskSettings> {
  private path = '/';
  private subline: DiskSubline = 'free';

  protected defaultLabel(): string {
    return 'DISK';
  }

  protected defaultThresholds(): Thresholds {
    return { warn: 80, crit: 90 };
  }

  protected applyOwnSettings(s: DiskSettings): boolean {
    const path = s.path?.trim() || '/';
    const changed = path !== this.path;
    this.path = path;
    this.subline = s.subline === 'used' || s.subline === 'none' ? s.subline : 'free';
    return changed;
  }

  protected async sample(): Promise<Sample> {
    try {
      const d = await readDiskSpace(this.path);
      const subline =
        this.subline === 'free'
          ? `${formatBytes(d.freeBytes)} free`
          : this.subline === 'used'
            ? `${formatBytes(d.totalBytes - d.freeBytes)} / ${formatBytes(d.totalBytes)}`
            : undefined;
      return { value: d.percent, subline };
    } catch {
      // Volume not mounted (external drive unplugged, typo in the path).
      return { value: 0, text: '—', subline: 'not mounted', color: '#8E8E93' };
    }
  }
}
