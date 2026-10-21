export interface TemperStationInfo {
  id: string;
  /** The station is lit and may be used. A10 adds its own "Tempering unlocked" check. */
  usable: boolean;
}

export interface TemperStationService {
  stations(): TemperStationInfo[];
  /** A10's gear plugin sets this; the handler calls `gear.openStation(stationId)`. Returns the unset. */
  setHandler(fn: (stationId: string) => void): () => void;
}

declare module '../core/Services' {
  interface GameServices {
    temperStation: TemperStationService;
  }
}
