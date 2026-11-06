export const ARTIFACT_PREFIX: string;
export const WORKFLOW_FILE: string;
export interface PullLike { number: number; merged_at: string | null; merge_commit_sha: string | null; head: { sha: string } }
export interface RunLike { id: number; status: string; conclusion: string | null; created_at?: string; run_number?: number }
export interface ArtifactLike { name: string; expired?: boolean }
export interface GateInput { sha: string; mergedTree: string; pulls: PullLike[] | null; headTree: string | null; runs: RunLike[] | null; artifacts: ArtifactLike[] | null }
export interface GateDecision { tests: 'skip' | 'run'; reason: string; pr?: number; headSha?: string; headTree?: string | null; mergedTree?: string; runId?: number }
export function decide(input: GateInput): GateDecision;
export function evaluate(io: { sha: string; mergedTree: string; repo: string; fetchJson: (path: string) => Promise<any> }): Promise<GateDecision>;
export function summary(d: GateDecision): string;
export function githubFetchJson(token: string, api?: string): (path: string) => Promise<any>;
export function main(env?: Record<string, string | undefined>): Promise<GateDecision>;
