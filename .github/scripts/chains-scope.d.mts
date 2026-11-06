export const CHAIN_PATHS: string[];
export const TITLE_MARKER: string;
export function decideChains(input: { event: string; files: string[] | null; title?: string }): { chains: 'run' | 'skip'; reason: string };
export function main(env?: Record<string, string | undefined>): Promise<{ chains: 'run' | 'skip'; reason: string }>;
