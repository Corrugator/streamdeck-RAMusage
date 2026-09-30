import { action } from '@elgato/streamdeck';
import { CommonSettings, MetricAction, Sample } from './metric-action';
import { Fan, readSensors } from '../sensors';
import { Thresholds } from '../render';

/** "max" = fastest fan, "avg" = average, or a fan index ("0", "1", …). */
type FanSelection = string;

type FanSettings = CommonSettings & {
  fan?: FanSelection;
  showPercent?: boolean;
};

function pick(fans: Fan[], selection: FanSelection): Fan | undefined {
  if (fans.length === 0) return undefined;
  if (selection === 'avg') {
    const avg = (k: keyof Fan) => fans.reduce((sum, f) => sum + f[k], 0) / fans.length;
    return { rpm: avg('rpm'), min: avg('min'), max: avg('max') };
  }
  const index = Number(selection);
  if (Number.isInteger(index)) return fans[index];
  return fans.reduce((a, b) => (b.rpm > a.rpm ? b : a));
}

@action({ UUID: 'com.corrugator.systemusage.fan' })
export class FanAction extends MetricAction<FanSettings> {
  private fan: FanSelection = 'max';
  private showPercent = false;

  protected defaultLabel(): string {
    return 'FAN';
  }

  /** In percent of the fan's maximum speed. */
  protected defaultThresholds(): Thresholds {
    return { warn: 60, crit: 85 };
  }

  protected applyOwnSettings(s: FanSettings): boolean {
    const fan = s.fan || 'max';
    const changed = fan !== this.fan;
    this.fan = fan;
    this.showPercent = s.showPercent ?? false;
    return changed;
  }

  protected async sample(): Promise<Sample> {
    const r = await readSensors();
    const f = pick(r.fans, this.fan);
    if (!f) return { value: 0, text: '—', subline: 'no fan', color: '#8E8E93' };
    const pct = f.max > 0 ? Math.max(0, Math.min(100, (f.rpm / f.max) * 100)) : 0;
    const rpm = Math.round(f.rpm);
    return {
      value: pct,
      text: this.showPercent ? undefined : String(rpm),
      subline: this.showPercent ? `${rpm} RPM` : undefined,
    };
  }
}
