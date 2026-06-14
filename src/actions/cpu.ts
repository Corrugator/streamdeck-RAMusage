import { action } from '@elgato/streamdeck';
import { CommonSettings, MetricAction, Sample } from './metric-action';
import { formatLoad, readCpuUsage } from '../cpu';

type CpuSettings = CommonSettings & {
  showLoad?: boolean;
};

@action({ UUID: 'com.corrugator.systemusage.cpu' })
export class CpuAction extends MetricAction<CpuSettings> {
  private showLoad = true;

  protected defaultLabel(): string {
    return 'CPU';
  }

  protected applyOwnSettings(s: CpuSettings): boolean {
    this.showLoad = s.showLoad ?? true;
    return false;
  }

  protected sample(): Sample {
    return {
      value: readCpuUsage(),
      subline: this.showLoad ? formatLoad() : undefined,
    };
  }
}
