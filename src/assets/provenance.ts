// Checks for public/assets/provenance.json, the per-file record of where each imported asset
// came from (tools/assets/import-packs.mjs writes it). Pure functions: callers supply file
// reads and hashing, so the same checks run in tests and in tooling.

export interface LicenceRef {
  /** Path of the committed licence file, relative to public/assets/. */
  path: string;
  upstreamPath: string;
  sha256: string;
  id: 'CC0-1.0';
}

export interface ProvenanceEntry {
  sha256: string;
  bytes: number;
  source: { repo: string; commit: string; path: string; sha256?: string; note?: string };
  /** Present when the file was produced from the source by a script (e.g. FBX to GLB). */
  generated?: { tool: string; script: string; clips?: string[] };
  licence: LicenceRef;
}

export interface Provenance {
  files: Record<string, ProvenanceEntry>;
}

export type ReadFile = (relPath: string) => Uint8Array | null;
export type Sha256 = (bytes: Uint8Array) => string;

const HEX64 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;

/** Problems with one entry; an empty list means the committed file matches its record. */
export function verifyEntry(rel: string, entry: ProvenanceEntry, read: ReadFile, sha256: Sha256): string[] {
  const issues: string[] = [];
  if (!HEX64.test(entry.sha256)) issues.push(`${rel}: malformed sha256`);
  if (!COMMIT.test(entry.source.commit)) issues.push(`${rel}: source commit is not a full SHA`);
  if (entry.licence.id !== 'CC0-1.0') issues.push(`${rel}: licence is not CC0-1.0`);
  const bytes = read(rel);
  if (!bytes) return [...issues, `${rel}: file missing`];
  if (bytes.length !== entry.bytes) issues.push(`${rel}: ${bytes.length} bytes, provenance says ${entry.bytes}`);
  if (sha256(bytes) !== entry.sha256) issues.push(`${rel}: sha256 mismatch`);
  const lic = read(entry.licence.path);
  if (!lic) issues.push(`${rel}: licence file ${entry.licence.path} missing`);
  else if (sha256(lic) !== entry.licence.sha256) issues.push(`${rel}: licence file ${entry.licence.path} sha256 mismatch`);
  return issues;
}

/** The glTF JSON of a .gltf or .glb file. Throws on anything else. */
export function gltfJson(bytes: Uint8Array, name: string): any {
  if (name.endsWith('.glb')) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) throw new Error(`${name}: not a GLB`);
    const len = view.getUint32(12, true);
    if (20 + len > bytes.byteLength) throw new Error(`${name}: truncated GLB`);
    return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)));
  }
  if (name.endsWith('.gltf')) return JSON.parse(new TextDecoder().decode(bytes));
  throw new Error(`${name}: not a glTF file`);
}

/** External (non data:) buffer and image URIs a glTF references, decoded. */
export function externalUris(json: any): { buffers: { uri: string; byteLength: number }[]; images: string[] } {
  const ext = (u: unknown): u is string => typeof u === 'string' && !u.startsWith('data:');
  return {
    buffers: (json.buffers ?? []).filter((b: any) => ext(b.uri)).map((b: any) => ({ uri: decodeURIComponent(b.uri), byteLength: b.byteLength })),
    images: (json.images ?? []).map((i: any) => i.uri).filter(ext).map((u: string) => decodeURIComponent(u)),
  };
}
