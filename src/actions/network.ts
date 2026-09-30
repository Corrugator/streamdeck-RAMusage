import streamDeck, { action, PropertyInspectorDidAppearEvent } from '@elgato/streamdeck';
import { PollingAction, PollingSettings } from './polling-action';
import { ALL_INTERFACES, listInterfaces, readNetworkRates } from '../network';
import {
  DEFAULT_NETWORK_COLORS,
  NetworkColors,
  NetworkGraph,
  NetworkMode,
  renderNetworkKey,
} from '../render-network';

type NetworkSettings = PollingSettings & {
  iface?: string;
  mode?: NetworkMode;
  graph?: NetworkGraph;
  bits?: boolean;
  downColor?: string;
  upColor?: string;
};

const MAX_HISTORY = 30;
const MODES: NetworkMode[] = ['both', 'down', 'up'];
const GRAPHS: NetworkGraph[] = ['off', 'line', 'bars'];

@action({ UUID: 'com.corrugator.systemusage.network' })
export class NetworkAction extends PollingAction<NetworkSettings> {
  private iface = ALL_INTERFACES;
  private mode: NetworkMode = 'both';
  private graph: NetworkGraph = 'line';
  private bits = false;
  private colors: NetworkColors = { ...DEFAULT_NETWORK_COLORS };
  private downHistory: number[] = [];
  private upHistory: number[] = [];

  protected defaultLabel(): string {
    return 'NET';
  }

  protected configure(s: NetworkSettings): void {
    const iface = s.iface || ALL_INTERFACES;
    if (iface !== this.iface) {
      this.downHistory = [];
      this.upHistory = [];
    }
    this.iface = iface;
    this.mode = s.mode && MODES.includes(s.mode) ? s.mode : 'both';
    this.graph = s.graph && GRAPHS.includes(s.graph) ? s.graph : 'line';
    this.bits = s.bits ?? false;
    this.colors = {
      down: s.downColor || DEFAULT_NETWORK_COLORS.down,
      up: s.upColor || DEFAULT_NETWORK_COLORS.up,
    };
  }

  protected async render(): Promise<string> {
    const { down, up } = await readNetworkRates(this.iface);
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
      downHistory: this.downHistory,
      upHistory: this.upHistory,
    });
  }

  /** Sends the machine's physical interfaces to the property inspector's picker. */
  override async onPropertyInspectorDidAppear(
    _ev: PropertyInspectorDidAppearEvent<NetworkSettings>,
  ): Promise<void> {
    try {
      const interfaces = await listInterfaces();
      await streamDeck.ui.sendToPropertyInspector({ interfaces });
    } catch (err) {
      streamDeck.logger.error('Failed to list network interfaces', err);
    }
  }
}
