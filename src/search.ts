import { TcEntry } from "./mibParser";

export type EntrySearchIndex = {
  entry: TcEntry;
  idLower: string;
  nameLower: string;
  descLower: string;
  paramNamesLower: string[];
};

export function buildEntrySearchIndex(entries: Iterable<TcEntry>): EntrySearchIndex[] {
  const index: EntrySearchIndex[] = [];
  for (const entry of entries) {
    index.push({
      entry,
      idLower: entry.id.toLowerCase(),
      nameLower: (entry.name ?? "").toLowerCase(),
      descLower: (entry.description ?? "").toLowerCase(),
      paramNamesLower: entry.params.map((param) => param.name.toLowerCase())
    });
  }
  return index;
}

export function scoreEntryMatch(item: EntrySearchIndex, queryLower: string): number {
  if (!queryLower) {
    return 0;
  }

  if (item.idLower.includes(queryLower) || item.nameLower.includes(queryLower)) {
    return 3;
  }

  if (item.paramNamesLower.some((name) => name.includes(queryLower))) {
    return 2;
  }

  if (item.descLower.includes(queryLower)) {
    return 1;
  }

  return 0;
}

export type RankedEntry = {
  entry: TcEntry;
  score: number;
};

export function rankEntries(
  entryIndex: EntrySearchIndex[],
  query: string,
  limit: number
): RankedEntry[] {
  const queryLower = query.toLowerCase();
  return entryIndex
    .map((item) => ({ entry: item.entry, score: scoreEntryMatch(item, queryLower) }))
    .filter((rankedItem) => rankedItem.score > 0 || queryLower.length === 0)
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .slice(0, limit);
}

export function getTelecommandTokenFromLine(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }

  const parts = trimmed.split(/\s+/);
  return parts[0];
}

export function isRequiredParam(paramName: string, kind?: string): boolean {
  if (!paramName || paramName.toLowerCase() === "filler") {
    return false;
  }

  if (!kind) {
    return true;
  }

  const normalized = kind.toUpperCase();
  if (normalized === "A") {
    return false;
  }

  return true;
}
