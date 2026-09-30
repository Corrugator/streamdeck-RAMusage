import streamDeck, {
  DidReceiveSettingsEvent,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from '@elgato/streamdeck';
import { execFile } from 'node:child_process';

/** Settings every polling key understands. */
export type PollingSettings = {
  openOnPress?: boolean;
  interval?: number;
  label?: string;
};

const MIN_INTERVAL_MS = 1000;
const DEFAULT_INTERVAL_MS = 2000;

/**
 * Base class for a key that refreshes its image on a timer: owns the refresh
 * timer, the interval / label / press-to-open-Activity-Monitor settings and
 * pushes the rendered image to every visible instance. Subclasses only decide
 * what to draw.
 */
export abstract class PollingAction<S extends PollingSettings> extends SingletonAction<S> {
  private timer?: ReturnType<typeof setInterval>;
  private openOnPress = true;
  private intervalMs = DEFAULT_INTERVAL_MS;
  protected label = '';

  /** Sample the metric and return the key image (data URI). */
  protected abstract render(): Promise<string> | string;
  /** Apply subclass-specific settings. */
  protected abstract configure(settings: S): void;
  /** Default label when none is configured (e.g. "RAM", "CPU"). */
  protected abstract defaultLabel(): string;

  private async update(): Promise<void> {
    try {
      const image = await this.render();
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
    this.openOnPress = s.openOnPress ?? true;
    const sec = Number(s.interval);
    this.intervalMs =
      Number.isFinite(sec) && sec > 0
        ? Math.max(MIN_INTERVAL_MS, sec * 1000)
        : DEFAULT_INTERVAL_MS;

    const fallback = this.defaultLabel();
    this.label = (s.label ?? fallback).toString().slice(0, 6).toUpperCase() || fallback;

    this.configure(s);
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
