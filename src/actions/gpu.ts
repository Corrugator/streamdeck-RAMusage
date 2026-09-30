import { action } from '@elgato/streamdeck';
import { CommonSettings, MetricAction, Sample } from './metric-action';
import { readGpuStats } from '../gpu';
import { formatBytes, Thresholds } from '../render';

type GpuSettings = CommonSettings & {
  showMemory?: boolean;
};

@action({ UUID: 'com.corrugator.systemusage.gpu' })
export class GpuAction extends MetricAction<GpuSettings> {
  private showMemory = true;

  protected defaultLabel(): string {
    return 'GPU';
  }

  protected defaultThresholds(): Thresholds {
    return { warn: 60, crit: 85 };
  }

  protected applyOwnSettings(s: GpuSettings): boolean {
    this.showMemory = s.showMemory ?? true;
    return false;
  }

  protected async sample(): Promise<Sample> {
    const stats = await readGpuStats();
    return {
      value: stats.utilization,
      subline: this.showMemory ? formatBytes(stats.memoryBytes) : undefined,
    };
  }
}
