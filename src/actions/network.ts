import streamDeck, { action, PropertyInspectorDidAppearEvent } from '@elgato/streamdeck';
import { RateAction, Rates, RateSettings } from './rate-action';
import { ALL_INTERFACES, listInterfaces, readNetworkRates } from '../network';
import { DEFAULT_NETWORK_COLORS } from '../render-network';

type NetworkSettings = RateSettings & {
  iface?: string;
};

@action({ UUID: 'com.corrugator.systemusage.network' })
export class NetworkAction extends RateAction<NetworkSettings> {
  private iface = ALL_INTERFACES;

  constructor() {
    super(DEFAULT_NETWORK_COLORS);
  }

  protected defaultLabel(): string {
    return 'NET';
  }

  protected applyOwnSettings(s: NetworkSettings): boolean {
    const iface = s.iface || ALL_INTERFACES;
    const changed = iface !== this.iface;
    this.iface = iface;
    return changed;
  }

  protected sampleRates(): Promise<Rates> {
    return readNetworkRates(this.iface);
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
