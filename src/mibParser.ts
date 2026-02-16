export type ParamEntry = {
  name: string;
  kind?: string;
  bitLength?: string;
  bitOffset?: string;
  paramId?: string;
  raw: string[];
};

export type TcEntry = {
  id: string;
  name?: string;
  description?: string;
  header?: string;
  serviceType?: string;
  subService?: string;
  apid?: string;
  sourcePath: string;
  sourceLine: number;
  params: ParamEntry[];
};

export type MibIndex = {
  tcById: Map<string, TcEntry>;
  tcByName: Map<string, TcEntry>;
};

function splitDatLine(line: string): string[] {
  return line.split("\t").map((value) => value.trim());
}

export function parseCcfLines(lines: string[], sourcePath: string): TcEntry[] {
  const entries: TcEntry[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.trim().length === 0 || line.trim().startsWith("#")) {
      continue;
    }

    const cols = splitDatLine(line);
    const id = cols[0];
    if (!id) {
      continue;
    }

    entries.push({
      id,
      name: cols[1],
      description: cols[2],
      header: cols[5],
      serviceType: cols[6],
      subService: cols[7],
      apid: cols[8],
      sourcePath,
      sourceLine: i + 1,
      params: []
    });
  }

  return entries;
}

export function parseCdfLines(lines: string[], tcById: Map<string, TcEntry>): void {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.trim().length === 0 || line.trim().startsWith("#")) {
      continue;
    }

    const cols = splitDatLine(line);
    const tcId = cols[0];
    if (!tcId) {
      continue;
    }

    const target = tcById.get(tcId);
    if (!target) {
      continue;
    }

    target.params.push({
      name: cols[2] ?? "",
      kind: cols[1],
      bitLength: cols[3],
      bitOffset: cols[4],
      paramId: cols[6],
      raw: cols
    });
  }
}

export function buildMibIndexFromLines(
  ccfFiles: Array<{ path: string; lines: string[] }>,
  cdfFiles: Array<{ path: string; lines: string[] }>
): MibIndex {
  const tcById = new Map<string, TcEntry>();
  const tcByName = new Map<string, TcEntry>();

  for (const file of ccfFiles) {
    const entries = parseCcfLines(file.lines, file.path);
    for (const entry of entries) {
      tcById.set(entry.id, entry);
      if (entry.name) {
        tcByName.set(entry.name, entry);
      }
    }
  }

  for (const file of cdfFiles) {
    parseCdfLines(file.lines, tcById);
  }

  return { tcById, tcByName };
}
