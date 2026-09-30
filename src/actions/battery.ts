import { action } from '@elgato/streamdeck';
import { CommonSettings, MetricAction, Sample } from './metric-action';
import { BatteryStats, readBattery } from '../battery';
import { Thresholds } from '../render';

type BatterySubline = 'time' | 'power' | 'health' | 'none';

type BatterySettings = CommonSettings & {
  subline?: BatterySubline;
};

const SUBLINES: BatterySubline[] = ['time', 'power', 'health', 'none'];

function formatMinutes(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

@action({ UUID: 'com.corrugator.systemusage.battery' })
export class BatteryAction extends MetricAction<BatterySettings> {
  private subline: BatterySubline = 'time';

  protected defaultLabel(): string {
    return 'BAT';
  }

  /** Inverted: yellow at/below 30 %, red at/below 15 %. */
  protected defaultThresholds(): Thresholds {
    return { warn: 30, crit: 15 };
  }

  protected invertColors(): boolean {
    return true;
  }

  protected applyOwnSettings(s: BatterySettings): boolean {
    this.subline = s.subline && SUBLINES.includes(s.subline) ? s.subline : 'time';
    return false;
  }

  private sublineFor(b: BatteryStats): string | undefined {
    const bolt = b.charging ? '⚡ ' : '';
    switch (this.subline) {
      case 'time':
        if (b.pluggedIn && !b.charging) return b.percent >= 100 ? 'Charged' : 'On power';
        return bolt + (b.minutesLeft !== undefined ? formatMinutes(b.minutesLeft) : '…');
      case 'power': {
        const w = Math.abs(b.watts);
        return `${bolt}${w >= 10 ? Math.round(w) : w.toFixed(1)} W`;
      }
      case 'health':
        return b.health !== undefined ? `${b.health}% · ${b.cycles ?? '?'} cyc` : undefined;
      default:
        return b.charging ? '⚡' : undefined;
    }
  }

  protected async sample(): Promise<Sample> {
    const b = await readBattery();
    if (!b) return { value: 0, text: '—', subline: 'No battery', color: '#8E8E93' };
    return { value: b.percent, subline: this.sublineFor(b) };
  }
}
