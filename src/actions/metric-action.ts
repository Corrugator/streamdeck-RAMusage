import streamDeck, {
  DidReceiveSettingsEvent,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from '@elgato/streamdeck';
import { execFile } from 'node:child_process';
import {
  colorForValue,
  DEFAULT_PALETTE,
  DEFAULT_THRESHOLDS,
  GraphStyle,
  Palette,
  renderKeyImage,
  Thresholds,
} from '../render';

/** Settings shared by every metric action (thresholds, colors, graph, …). */
export type CommonSettings = {
  graphStyle?: GraphStyle;
  /** @deprecated legacy boolean replaced by graphStyle; still read. */
  showGraph?: boolean;
  openOnPress?: boolean;
  warn?: number;
  crit?: number;
  interval?: number;
  green?: string;
  yellow?: string;
  red?: string;
  label?: string;
};

export type Sample = { value: number; subline?: string };

const MIN_INTERVAL_MS = 1000;
const DEFAULT_INTERVAL_MS = 2000;
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
 * Base class for a polling metric key: owns the refresh timer, history buffer,
 * common settings, rendering and the press-to-open-Activity-Monitor behavior.
 * State is per-instance, so each concrete action (memory, CPU) is independent.
 */
export abstract class MetricAction<S extends CommonSettings> extends SingletonAction<S> {
  private history: number[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private graphStyle: GraphStyle = 'sparkline';
  private openOnPress = true;
  private thresholds: Thresholds = { ...DEFAULT_THRESHOLDS };
  private palette: Palette = { ...DEFAULT_PALETTE };
  private intervalMs = DEFAULT_INTERVAL_MS;
  private label = '';

  /** Read the current metric value (+ optional sub-line). */
  protected abstract sample(): Promise<Sample> | Sample;
  /** Apply subclass-specific settings; return true to reset the history. */
  protected abstract applyOwnSettings(settings: S): boolean;
  /** Default label when none is configured (e.g. "RAM", "CPU"). */
  protected abstract defaultLabel(): string;

  protected resetHistory(): void {
    this.history = [];
  }

  private async update(): Promise<void> {
    try {
      const { value, subline } = await this.sample();
      this.history.push(value);
      if (this.history.length > MAX_HISTORY) this.history.shift();
      const image = renderKeyImage({
        value,
        color: colorForValue(value, this.thresholds, this.palette),
        label: this.label,
        subline,
        history: this.graphStyle !== 'off' ? this.history : undefined,
        graphStyle: this.graphStyle,
      });
      for (const a of this.actions) {
        await a.setImage(image);
      }
    } catch (err) {
      streamDeck.logger.error('Metric update failed', err);
    }
  }

  private startTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.update(), this.intervalMs);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private applySettings(s: S): void {
    this.graphStyle =
      s.graphStyle && GRAPH_STYLES.includes(s.graphStyle)
        ? s.graphStyle
        : s.showGraph === false
          ? 'off'
          : 'sparkline';
    this.openOnPress = s.openOnPress ?? true;

    const warn = Number(s.warn);
    const crit = Number(s.crit);
    this.thresholds = {
      warn: Number.isFinite(warn) ? warn : DEFAULT_THRESHOLDS.warn,
      crit: Number.isFinite(crit) ? crit : DEFAULT_THRESHOLDS.crit,
    };
    this.palette = {
      green: s.green || DEFAULT_PALETTE.green,
      yellow: s.yellow || DEFAULT_PALETTE.yellow,
      red: s.red || DEFAULT_PALETTE.red,
    };
    const sec = Number(s.interval);
    this.intervalMs =
      Number.isFinite(sec) && sec > 0
        ? Math.max(MIN_INTERVAL_MS, sec * 1000)
        : DEFAULT_INTERVAL_MS;

    const fallback = this.defaultLabel();
    this.label = (s.label ?? fallback).toString().slice(0, 6).toUpperCase() || fallback;

    if (this.applyOwnSettings(s)) {
      this.resetHistory();
    }
  }

  override onWillAppear(ev: WillAppearEvent<S>): Promise<void> {
    this.applySettings(ev.payload.settings);
    this.startTimer();
    return this.update();
  }

  override onWillDisappear(_ev: WillDisappearEvent<S>): void {
    // Defer so the SDK removes this instance first, then stop polling only
    // when no key instances of this action remain visible.
    setTimeout(() => {
      if ([...this.actions].length === 0) this.stopTimer();
    }, 0);
  }

  override onDidReceiveSettings(ev: DidReceiveSettingsEvent<S>): Promise<void> {
    this.applySettings(ev.payload.settings);
    this.stopTimer(); // restart so a changed interval takes effect now
    this.startTimer();
    return this.update();
  }

  override onKeyDown(_ev: KeyDownEvent<S>): void {
    if (!this.openOnPress) return;
    // Opens Activity Monitor on its last-used tab (the CLI can't target a tab).
    execFile('open', ['-b', 'com.apple.ActivityMonitor'], (err) => {
      if (err) streamDeck.logger.error('Failed to open Activity Monitor', err);
    });
  }
}
