import {
  colorForValue,
  DEFAULT_PALETTE,
  DEFAULT_THRESHOLDS,
  GraphStyle,
  Palette,
  renderKeyImage,
  Thresholds,
} from '../render';
import { PollingAction, PollingSettings } from './polling-action';

/** Settings shared by every percentage metric (thresholds, colors, graph, …). */
export type CommonSettings = PollingSettings & {
  graphStyle?: GraphStyle;
  /** @deprecated legacy boolean replaced by graphStyle; still read. */
  showGraph?: boolean;
  warn?: number;
  crit?: number;
  green?: string;
  yellow?: string;
  red?: string;
};

export type Sample = {
  /** 0–100, drives ring, color and graph. */
  value: number;
  /** Replaces the "NN%" text, e.g. "46°" or "2316". */
  text?: string;
  subline?: string;
  /** Fixed color instead of the threshold color (e.g. gray for "no battery"). */
  color?: string;
};

const MAX_HISTORY = 30;
const GRAPH_STYLES: GraphStyle[] = [
  'off',
  'sparkline',
  'bars-mini',
  'area',
  'line',
  'bars',
  'background',
];

/**
 * Base class for a 0–100 % metric key: ring + colored value with thresholds,
 * palette and history graph. State is per-instance, so each concrete action
 * (memory, CPU, GPU) is independent.
 */
export abstract class MetricAction<S extends CommonSettings> extends PollingAction<S> {
  private history: number[] = [];
  private graphStyle: GraphStyle = 'sparkline';
  private thresholds: Thresholds = { ...DEFAULT_THRESHOLDS };
  private palette: Palette = { ...DEFAULT_PALETTE };

  /** Read the current metric value (+ optional sub-line). */
  protected abstract sample(): Promise<Sample> | Sample;
  /** Apply subclass-specific settings; return true to reset the history. */
  protected abstract applyOwnSettings(settings: S): boolean;

  /** Thresholds used when the user hasn't set any. */
  protected defaultThresholds(): Thresholds {
    return DEFAULT_THRESHOLDS;
  }

  /** True when low values are bad (battery). */
  protected invertColors(): boolean {
    return false;
  }

  protected resetHistory(): void {
    this.history = [];
  }

  protected async render(): Promise<string> {
    const { value, text, subline, color } = await this.sample();
    this.history.push(value);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    return renderKeyImage({
      value,
      text,
      color: color ?? colorForValue(value, this.thresholds, this.palette, this.invertColors()),
      label: this.label,
      subline,
      history: this.graphStyle !== 'off' ? this.history : undefined,
      graphStyle: this.graphStyle,
    });
  }

  protected configure(s: S): void {
    this.graphStyle =
      s.graphStyle && GRAPH_STYLES.includes(s.graphStyle)
        ? s.graphStyle
        : s.showGraph === false
          ? 'off'
          : 'sparkline';

    // Empty PI fields arrive as undefined; Number(undefined) is NaN → default.
    const warn = Number(s.warn);
    const crit = Number(s.crit);
    const defaults = this.defaultThresholds();
    this.thresholds = {
      warn: s.warn != null && Number.isFinite(warn) ? warn : defaults.warn,
      crit: s.crit != null && Number.isFinite(crit) ? crit : defaults.crit,
    };
    this.palette = {
      green: s.green || DEFAULT_PALETTE.green,
      yellow: s.yellow || DEFAULT_PALETTE.yellow,
      red: s.red || DEFAULT_PALETTE.red,
    };

    if (this.applyOwnSettings(s)) {
      this.resetHistory();
    }
  }
}
