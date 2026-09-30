import streamDeck from '@elgato/streamdeck';
import { MemoryAction } from './actions/memory';
import { CpuAction } from './actions/cpu';
import { GpuAction } from './actions/gpu';
import { NetworkAction } from './actions/network';

streamDeck.logger.setLevel('info');
streamDeck.actions.registerAction(new MemoryAction());
streamDeck.actions.registerAction(new CpuAction());
streamDeck.actions.registerAction(new GpuAction());
streamDeck.actions.registerAction(new NetworkAction());
streamDeck.connect();
