// Terrain worker entry: receives chunk requests from WorkerPool and returns position, normal and
// colour buffers computed with ../chunkGeometry.ts (which samples ../heightfield.ts).
// Buffers are transferred back, not copied. Malformed requests get an error reply, never a throw.

import { buildChunkData, type ChunkRequest } from '../chunkGeometry';
import { validateChunkRequest, type ChunkReplyMessage } from '../workerProtocol';

export interface WorkerReply {
  message: ChunkReplyMessage;
  transfer: Transferable[];
}

/** Pure message handler, exported for tests. */
export function handleChunkMessage(data: unknown): WorkerReply {
  const raw = (typeof data === 'object' && data !== null ? data : {}) as { id?: unknown; request?: unknown };
  const id = Number.isInteger(raw.id) ? (raw.id as number) : -1;
  const problem = id < 0 ? 'missing job id' : validateChunkRequest(raw.request);
  if (problem) return { message: { id, ok: false, error: problem }, transfer: [] };

  try {
    const chunk = buildChunkData(raw.request as ChunkRequest);
    return {
      message: { id, ok: true, data: chunk },
      transfer: [chunk.positions.buffer, chunk.normals.buffer, chunk.colors.buffer],
    };
  } catch (error) {
    return { message: { id, ok: false, error: String(error) }, transfer: [] };
  }
}

// Only wire up the listener inside a real worker, so tests can import the handler directly.
if (typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== 'undefined') {
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  scope.onmessage = (event: MessageEvent<unknown>) => {
    const { message, transfer } = handleChunkMessage(event.data);
    scope.postMessage(message, transfer);
  };
}
