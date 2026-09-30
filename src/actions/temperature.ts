import { action } from '@elgato/streamdeck';
import { CommonSettings, MetricAction, Sample } from './metric-action';
import { readSensors, SensorReadings, TemperatureSensor } from '../sensors';
import { Thresholds } from '../render';

type TempSubline = 'fan' | 'power' | 'thermal' | 'none';

type TemperatureSettings = CommonSettings & {
  sensor?: TemperatureSensor;
  fahrenheit?: boolean;
  subline?: TempSubline;
};

const SENSORS: TemperatureSensor[] = ['cpu', 'cpuMax', 'battery', 'ssd'];
const SUBLINES: TempSubline[] = ['fan', 'power', 'thermal', 'none'];

@action({ UUID: 'com.corrugator.systemusage.temperature' })
export class TemperatureAction extends MetricAction<TemperatureSettings> {
  private sensor: TemperatureSensor = 'cpu';
  private fahrenheit = false;
  private subline: TempSubline = 'fan';

  protected defaultLabel(): string {
    return 'TEMP';
  }

  /** In °C, also when the key shows °F. */
  protected defaultThresholds(): Thresholds {
    return { warn: 70, crit: 90 };
  }

  protected applyOwnSettings(s: TemperatureSettings): boolean {
    const sensor = s.sensor && SENSORS.includes(s.sensor) ? s.sensor : 'cpu';
    const changed = sensor !== this.sensor;
    this.sensor = sensor;
    this.fahrenheit = s.fahrenheit ?? false;
    this.subline = s.subline && SUBLINES.includes(s.subline) ? s.subline : 'fan';
    return changed;
  }

  private sublineFor(r: SensorReadings): string | undefined {
    switch (this.subline) {
      case 'fan': {
        const rpm = Math.max(0, ...r.fans.map((f) => f.rpm));
        return r.fans.length > 0 ? `${rpm} RPM` : undefined;
      }
      case 'power':
        return r.power !== undefined ? `${r.power >= 10 ? Math.round(r.power) : r.power.toFixed(1)} W` : undefined;
      case 'thermal':
        return r.thermalState;
      default:
        return undefined;
    }
  }

  protected async sample(): Promise<Sample> {
    const r = await readSensors();
    const celsius = r.temps[this.sensor];
    if (celsius === undefined) {
      return { value: 0, text: '—', subline: 'no sensor', color: '#8E8E93' };
    }
    const shown = this.fahrenheit ? celsius * 1.8 + 32 : celsius;
    return {
      // Ring and thresholds work in °C: 0–100 °C fills the ring.
      value: Math.max(0, Math.min(100, celsius)),
      text: `${Math.round(shown)}°`,
      subline: this.sublineFor(r),
    };
  }
}
