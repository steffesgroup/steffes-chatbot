export type DashboardRange = '24h' | '7d' | '30d' | 'all';

export type DashboardRangeInfo = {
  range: DashboardRange;
  startIso?: string;
  minTsSeconds?: number;
};

export function parseDashboardRange(input: unknown): DashboardRangeInfo {
  const range = normalizeRange(input);
  if (range === 'all') return { range };

  const now = Date.now();
  const ms =
    range === '24h'
      ? 24 * 60 * 60 * 1000
      : range === '7d'
      ? 7 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;

  const startMs = now - ms;
  const startIso = new Date(startMs).toISOString();
  const minTsSeconds = Math.floor(startMs / 1000);

  return { range, startIso, minTsSeconds };
}

function normalizeRange(input: unknown): DashboardRange {
  if (typeof input !== 'string') return '7d';

  const value = input.trim().toLowerCase();
  if (value === '24h' || value === '7d' || value === '30d' || value === 'all') {
    return value;
  }

  return '7d';
}
