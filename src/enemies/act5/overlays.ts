// Registers the Warhost overlay (Act 5 N5). Imported for its side effect by the creatures plugin and the tests.
import { registerBehaviour } from '../behaviours';
import { makeWarhostOverlay } from './warhost/overlay';

registerBehaviour('warhost', makeWarhostOverlay);
