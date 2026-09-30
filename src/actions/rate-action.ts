import { PollingAction, PollingSettings } from './polling-action';
import {
  NetworkColors,
  NetworkGraph,
  NetworkMode,
  renderNetworkKey,
} from '../render-network';

/** Settings shared by the two-direction rate keys (network, disk I/O). */
export type RateSettings = PollingSettings & {
  mode?: NetworkMode;
  graph?: NetworkGraph;
  bits?: boolean;
  downColor?: string;
  upColor?: string;
};

export type Rates = { down: number; up: number };

const MAX_HISTORY = 30;
const MODES: NetworkMode[] = ['both', 'down', 'up'];
const GRAPHS: NetworkGraph[] = ['off', 'line', 'bars'];

/**
 * Base class for a key showing two byte rates (download/upload, read/write)
 * with their own colors and a shared-scale history graph.
 */
export abstract class RateAction<S extends RateSettings> extends PollingAction<S> {
  private mode: NetworkMode = 'both';
  private graph: NetworkGraph = 'line';
  private bits = false;
  private colors: NetworkColors;
  private downHistory: number[] = [];
  private upHistory: number[] = [];

  constructor(
    private readonly defaultColors: NetworkColors,
    private readonly arrows?: { down: string; up: string },
  ) {
    super();
    this.colors = { ...defaultColors };
  }

  /** Current rates in bytes per second. */
  protected abstract sampleRates(): Promise<Rates>;
  /** Apply subclass-specific settings; return true to reset the history. */
  protected abstract applyOwnSettings(settings: S): boolean;

  protected configure(s: S): void {
    this.mode = s.mode && MODES.includes(s.mode) ? s.mode : 'both';
    this.graph = s.graph && GRAPHS.includes(s.graph) ? s.graph : 'line';
    this.bits = s.bits ?? false;
    this.colors = {
      down: s.downColor || this.defaultColors.down,
      up: s.upColor || this.defaultColors.up,
    };
    if (this.applyOwnSettings(s)) {
      this.downHistory = [];
      this.upHistory = [];
    }
  }

  protected async render(): Promise<string> {
    const { down, up } = await this.sampleRates();
    this.downHistory.push(down);
    this.upHistory.push(up);
    if (this.downHistory.length > MAX_HISTORY) this.downHistory.shift();
    if (this.upHistory.length > MAX_HISTORY) this.upHistory.shift();
    return renderNetworkKey({
      down,
      up,
      mode: this.mode,
      graph: this.graph,
      bits: this.bits,
      label: this.label,
      colors: this.colors,
      arrows: this.arrows,
      downHistory: this.downHistory,
      upHistory: this.upHistory,
    });
  }
}
