export type ParamEntry = {
  name: string;
  kind?: string;
  bitLength?: string;
  bitOffset?: string;
  paramId?: string;
  enumSetId?: string;
  raw: string[];
  enumerations?: string[];
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

export type TelemetryEntry = {
  sid: string;
  service?: string;
  subService?: string;
  description?: string;
  sourcePath: string;
  sourceLine: number;
  params: ParamEntry[];
};

export type MibIndex = {
  tcById: Map<string, TcEntry>;
  tcByName: Map<string, TcEntry>;
  telemetryBySid: Map<string, TelemetryEntry>;
};

type PcfEntry = {
  paramId: string;
  name?: string;
  enumSetId?: string;
  raw: string[];
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

export function parsePidLines(lines: string[], sourcePath: string): TelemetryEntry[] {
  const entries: TelemetryEntry[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.trim().length === 0 || line.trim().startsWith("#")) {
      continue;
    }

    const cols = splitDatLine(line);
    const service = cols[0];
    const subService = cols[1];
    const sid = cols[5];

    if (!sid) {
      continue;
    }

    entries.push({
      sid,
      service,
      subService,
      description: cols[6],
      sourcePath,
      sourceLine: i + 1,
      params: []
    });
  }

  return entries;
}

export function parsePcfLines(lines: string[]): Map<string, PcfEntry> {
  const entries = new Map<string, PcfEntry>();

  for (const line of lines) {
    if (!line || line.trim().length === 0 || line.trim().startsWith("#")) {
      continue;
    }

    const cols = splitDatLine(line);
    const paramId = cols[0];
    if (!paramId) {
      continue;
    }

    entries.set(paramId, {
      paramId,
      name: cols[1],
      enumSetId: cols[11],
      raw: cols
    });
  }

  return entries;
}

export function parsePlfLines(
  lines: string[],
  telemetryBySid: Map<string, TelemetryEntry>,
  pcfByParamId: Map<string, PcfEntry>
): void {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.trim().length === 0 || line.trim().startsWith("#")) {
      continue;
    }

    const cols = splitDatLine(line);
    const paramId = cols[0];
    const sid = cols[1];

    if (!paramId || !sid) {
      continue;
    }

    const target = telemetryBySid.get(sid);
    if (!target) {
      continue;
    }

    const pcfEntry = pcfByParamId.get(paramId);

    target.params.push({
      name: pcfEntry?.name || paramId,
      paramId,
      enumSetId: pcfEntry?.enumSetId,
      kind: "P",
      raw: cols
    });
  }
}

export function parseCveLines(lines: string[], tcById: Map<string, TcEntry>): void {
  const valuesByParamId = new Map<string, Set<string>>();

  for (const line of lines) {
    if (!line || line.trim().length === 0 || line.trim().startsWith("#")) {
      continue;
    }

    const cols = splitDatLine(line);
    const valueId = cols[1];
    const valueType = cols[2];
    const valueRange = cols[3];

    if (!valueId) {
      continue;
    }

    if (!valuesByParamId.has(valueId)) {
      valuesByParamId.set(valueId, new Set());
    }

    // Collect human-readable values
    if (valueType === "E" && valueRange) {
      valuesByParamId.get(valueId)!.add(valueRange);
    }
  }

  // Attach values to TC parameters
  for (const entry of tcById.values()) {
    for (const param of entry.params) {
      if (param.paramId && valuesByParamId.has(param.paramId)) {
        param.enumerations = Array.from(valuesByParamId.get(param.paramId)!).sort();
      }
    }
  }
}

export function parseCvpLines(lines: string[], tcById: Map<string, TcEntry>): void {
  const valuesByTcId = new Map<string, Set<string>>();

  for (const line of lines) {
    if (!line || line.trim().length === 0 || line.trim().startsWith("#")) {
      continue;
    }

    const cols = splitDatLine(line);
    const tcId = cols[0];
    const valueId = cols[2];

    if (!tcId || !valueId) {
      continue;
    }

    if (!valuesByTcId.has(tcId)) {
      valuesByTcId.set(tcId, new Set());
    }

    valuesByTcId.get(tcId)!.add(valueId);
  }
}

export function parseTxpLines(lines: string[], telemetryBySid: Map<string, TelemetryEntry>): void {
  const enumsByEnumSetId = new Map<string, Set<string>>();

  for (const line of lines) {
    if (!line || line.trim().length === 0 || line.trim().startsWith("#")) {
      continue;
    }

    const cols = splitDatLine(line);
    const enumSetId = cols[0];
    const enumValue = cols[cols.length - 1]; // Last column is the text value (e.g., "ON", "OFF")

    if (!enumSetId || !enumValue) {
      continue;
    }

    if (!enumsByEnumSetId.has(enumSetId)) {
      enumsByEnumSetId.set(enumSetId, new Set());
    }

    enumsByEnumSetId.get(enumSetId)!.add(enumValue.trim());
  }

  // Attach enumeration values to telemetry parameters
  for (const entry of telemetryBySid.values()) {
    for (const param of entry.params) {
      if (param.enumSetId && enumsByEnumSetId.has(param.enumSetId)) {
        param.enumerations = Array.from(enumsByEnumSetId.get(param.enumSetId)!).sort();
      }
    }
  }
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
  cdfFiles: Array<{ path: string; lines: string[] }>,
  pidFiles: Array<{ path: string; lines: string[] }>,
  plfFiles: Array<{ path: string; lines: string[] }>,
  pcfFiles: Array<{ path: string; lines: string[] }>,
  cveFiles: Array<{ path: string; lines: string[] }>,
  cvpFiles: Array<{ path: string; lines: string[] }>,
  txpFiles: Array<{ path: string; lines: string[] }>
): MibIndex {
  const tcById = new Map<string, TcEntry>();
  const tcByName = new Map<string, TcEntry>();
  const telemetryBySid = new Map<string, TelemetryEntry>();
  const pcfByParamId = new Map<string, PcfEntry>();

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

  for (const file of pidFiles) {
    const entries = parsePidLines(file.lines, file.path);
    for (const entry of entries) {
      telemetryBySid.set(entry.sid, entry);
    }
  }

  for (const file of pcfFiles) {
    const entries = parsePcfLines(file.lines);
    for (const [paramId, entry] of entries) {
      if (!pcfByParamId.has(paramId)) {
        pcfByParamId.set(paramId, entry);
      }
    }
  }

  for (const file of plfFiles) {
    parsePlfLines(file.lines, telemetryBySid, pcfByParamId);
  }

  for (const file of cveFiles) {
    parseCveLines(file.lines, tcById);
  }

  for (const file of cvpFiles) {
    parseCvpLines(file.lines, tcById);
  }

  for (const file of txpFiles) {
    parseTxpLines(file.lines, telemetryBySid);
  }

  return { tcById, tcByName, telemetryBySid };
}
