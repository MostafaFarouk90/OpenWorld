// Terrain worker entry: receives chunk requests from WorkerPool and returns position, normal and
// colour buffers computed with ../chunkGeometry.ts (which samples ../heightfield.ts).
// Buffers are transferred back, not copied.

import { buildChunkData, type ChunkData, type ChunkRequest } from '../chunkGeometry';

export interface ChunkJobMessage {
  id: number;
  request: ChunkRequest;
}

export interface ChunkResultMessage {
  id: number;
  data: ChunkData;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<ChunkJobMessage>) => {
  const { id, request } = event.data;
  const data = buildChunkData(request);
  const message: ChunkResultMessage = { id, data };
  scope.postMessage(message, [data.positions.buffer, data.normals.buffer, data.colors.buffer]);
};
