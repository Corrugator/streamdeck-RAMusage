import streamDeck from '@elgato/streamdeck';
import { MemoryAction } from './actions/memory';
import { CpuAction } from './actions/cpu';

streamDeck.logger.setLevel('info');
streamDeck.actions.registerAction(new MemoryAction());
streamDeck.actions.registerAction(new CpuAction());
streamDeck.connect();
