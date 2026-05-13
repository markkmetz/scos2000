"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCcfLines = parseCcfLines;
exports.parsePidLines = parsePidLines;
exports.parsePcfLines = parsePcfLines;
exports.parseCpcLines = parseCpcLines;
exports.parsePlfLines = parsePlfLines;
exports.parseCveLines = parseCveLines;
exports.parseCvpLines = parseCvpLines;
exports.parseTxpLines = parseTxpLines;
exports.parsePasLines = parsePasLines;
exports.parseCdfLines = parseCdfLines;
exports.buildMibIndexFromLines = buildMibIndexFromLines;
function splitDatLine(line) {
    return line.split("\t").map((value) => value.trim());
}
function parseCcfLines(lines, sourcePath) {
    const entries = [];
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
            critical: cols[4],
            mapId: cols[9],
            danger: cols[10],
            planRelease: cols[11],
            execMode: cols[12],
            tcType: cols[13],
            sourcePath,
            sourceLine: i + 1,
            params: []
        });
    }
    return entries;
}
function parsePidLines(lines, sourcePath) {
    const entries = [];
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
function parsePcfLines(lines) {
    const entries = new Map();
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
function parseCpcLines(lines) {
    const entries = new Map();
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
            enumSetId: cols[10],
            raw: cols
        });
    }
    return entries;
}
function parsePlfLines(lines, telemetryBySid, pcfByParamId) {
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
function parseCveLines(lines, tcById) {
    const valuesByParamId = new Map();
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
            valuesByParamId.get(valueId).add(valueRange);
        }
    }
    // Attach values to TC parameters
    for (const entry of tcById.values()) {
        for (const param of entry.params) {
            if (param.paramId && valuesByParamId.has(param.paramId)) {
                param.enumerations = Array.from(valuesByParamId.get(param.paramId)).sort();
            }
        }
    }
}
function parseCvpLines(lines, tcById) {
    const valuesByTcId = new Map();
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
        valuesByTcId.get(tcId).add(valueId);
    }
}
function parseTxpLines(lines, telemetryBySid) {
    const enumsByEnumSetId = new Map();
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
        enumsByEnumSetId.get(enumSetId).add(enumValue.trim());
    }
    // Attach enumeration values to telemetry parameters
    for (const entry of telemetryBySid.values()) {
        for (const param of entry.params) {
            if (param.enumSetId && enumsByEnumSetId.has(param.enumSetId)) {
                param.enumerations = Array.from(enumsByEnumSetId.get(param.enumSetId)).sort();
            }
        }
    }
}
function parsePasLines(lines, tcById, cpcByParamId) {
    const enumsByEnumSetId = new Map();
    for (const line of lines) {
        if (!line || line.trim().length === 0 || line.trim().startsWith("#")) {
            continue;
        }
        const cols = splitDatLine(line);
        const enumSetId = cols[0];
        const enumValue = cols[1];
        if (!enumSetId || !enumValue) {
            continue;
        }
        if (!enumsByEnumSetId.has(enumSetId)) {
            enumsByEnumSetId.set(enumSetId, new Set());
        }
        enumsByEnumSetId.get(enumSetId).add(enumValue.trim());
    }
    // Attach enumeration values to TC parameters via CPC enumSetId linkage
    for (const entry of tcById.values()) {
        for (const param of entry.params) {
            if (param.paramId) {
                const cpcEntry = cpcByParamId.get(param.paramId);
                if (cpcEntry?.enumSetId && enumsByEnumSetId.has(cpcEntry.enumSetId)) {
                    param.enumerations = Array.from(enumsByEnumSetId.get(cpcEntry.enumSetId)).sort();
                }
            }
        }
    }
}
function parseCdfLines(lines, tcById) {
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
function buildMibIndexFromLines(ccfFiles, cdfFiles, pidFiles, plfFiles, pcfFiles, cpcFiles, cveFiles, cvpFiles, txpFiles, pasFiles) {
    const tcById = new Map();
    const tcByName = new Map();
    const telemetryBySid = new Map();
    const pcfByParamId = new Map();
    const cpcByParamId = new Map();
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
    for (const file of cpcFiles) {
        const entries = parseCpcLines(file.lines);
        for (const [paramId, entry] of entries) {
            if (!cpcByParamId.has(paramId)) {
                cpcByParamId.set(paramId, entry);
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
    for (const file of pasFiles) {
        parsePasLines(file.lines, tcById, cpcByParamId);
    }
    return { tcById, tcByName, telemetryBySid, pcfByParamId };
}
//# sourceMappingURL=mibParser.js.map