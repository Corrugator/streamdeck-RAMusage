import { action } from '@elgato/streamdeck';
import { CommonSettings, MetricAction, Sample } from './metric-action';
import { readMemoryStats } from '../memory';
import { formatGB } from '../render';

type Metric = 'pressure' | 'usage';

type MemorySettings = CommonSettings & {
  metric?: Metric;
  showGB?: boolean;
};

@action({ UUID: 'com.corrugator.systemusage.memory' })
export class MemoryAction extends MetricAction<MemorySettings> {
  private metric: Metric = 'pressure';
  private showGB = true;

  protected defaultLabel(): string {
    return 'RAM';
  }

  protected applyOwnSettings(s: MemorySettings): boolean {
    const next: Metric = s.metric === 'usage' ? 'usage' : 'pressure';
    const changed = next !== this.metric;
    this.metric = next;
    this.showGB = s.showGB ?? true;
    return changed; // reset history when the metric changes
  }

  protected async sample(): Promise<Sample> {
    const stats = await readMemoryStats();
    const value = this.metric === 'usage' ? stats.usage : stats.pressure;
    return {
      value,
      subline: this.showGB ? formatGB(stats.usedBytes, stats.totalBytes) : undefined,
    };
  }
}
