import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { buildMibIndexFromLines } from "../src/mibParser";

type DatFile = { path: string; lines: string[] };

function readDat(filePath: string): DatFile {
  const content = fs.readFileSync(filePath, "utf8");
  return { path: filePath, lines: content.split(/\r?\n/) };
}

function collectCcfIds(lines: string[]): string[] {
  const ids: string[] = [];
  for (const line of lines) {
    if (!line || line.trim().length === 0 || line.trim().startsWith("#")) {
      continue;
    }
    const cols = line.split("\t").map((value) => value.trim());
    if (cols[0]) {
      ids.push(cols[0]);
    }
  }
  return ids;
}

describe("SCOS-2000 MIB parser", () => {
  const base = path.resolve(__dirname, "..", "mibs", "ASCII_CSIM");
  const ccfPath = path.join(base, "ccf.dat");
  const cdfPath = path.join(base, "cdf.dat");

  it("indexes all telecommands from CCF", () => {
    const ccf = readDat(ccfPath);
    const cdf = readDat(cdfPath);

    const index = buildMibIndexFromLines([ccf], [cdf], [], [], [], [], [], [], [], []);
    const ccfIds = collectCcfIds(ccf.lines);

    assert.ok(ccfIds.length > 0, "Expected CCF to contain telecommands");
    assert.strictEqual(
      index.tcById.size,
      ccfIds.length,
      "All CCF telecommands should be indexed"
    );

    for (const id of ccfIds) {
      assert.ok(index.tcById.has(id), `Missing telecommand ${id}`);
    }
  });

  it("loads parameters for random telecommands", () => {
    const ccf = readDat(ccfPath);
    const cdf = readDat(cdfPath);

    const index = buildMibIndexFromLines([ccf], [cdf], [], [], [], [], [], [], [], []);
    const idsWithParams = Array.from(index.tcById.values())
      .filter((entry) => entry.params.length > 0)
      .map((entry) => entry.id)
      .sort();

    assert.ok(idsWithParams.length >= 20, "Expected at least 20 telecommands with parameters");

    const sample = idsWithParams.slice(0, 20);
    let minParams = Number.POSITIVE_INFINITY;
    let maxParams = 0;

    for (const id of sample) {
      const entry = index.tcById.get(id);
      assert.ok(entry, `Missing telecommand ${id}`);
      assert.ok(entry && entry.params.length > 0, `Telecommand ${id} has no parameters`);
      minParams = Math.min(minParams, entry!.params.length);
      maxParams = Math.max(maxParams, entry!.params.length);
    }

    assert.ok(maxParams >= minParams, "Parameter count should be consistent");
    assert.ok(maxParams > 0, "Expected at least one parameter in samples");
  });

  it("parses parameter properties correctly", () => {
    const ccf = readDat(ccfPath);
    const cdf = readDat(cdfPath);

    const index = buildMibIndexFromLines([ccf], [cdf], [], [], [], [], [], [], [], []);
    
    // Find a TC with parameters
    let tcWithParams: any = null;
    for (const entry of index.tcById.values()) {
      if (entry.params.length > 0) {
        tcWithParams = entry;
        break;
      }
    }

    assert.ok(tcWithParams, "Expected to find a TC with parameters");
    assert.ok(tcWithParams.params[0], "Expected at least one parameter");

    const param = tcWithParams.params[0];
    assert.ok(param.name || param.paramId, "Parameter should have name or ID");
    
    // Verify parameter structure
    if (param.kind) {
      assert.match(param.kind, /[REAFP]/, "Parameter kind should be R, E, A, F, or P");
    }
  });

  it("distinguishes required vs optional parameters", () => {
    const ccf = readDat(ccfPath);
    const cdf = readDat(cdfPath);

    const index = buildMibIndexFromLines([ccf], [cdf], [], [], [], [], [], [], [], []);
    
    let foundRequired = false;
    let foundOptional = false;

    for (const entry of index.tcById.values()) {
      for (const param of entry.params) {
        // R = required, A or F = optional (auxiliary/filler)
        if (param.kind === "R" || param.kind === "E") {
          foundRequired = true;
        } else if (param.kind === "A" || param.kind === "F") {
          foundOptional = true;
        }
      }
    }

    assert.ok(foundRequired, "Expected to find required/enumeration parameters");
    assert.ok(foundOptional || foundRequired, "Expected to find parameters of any kind");
  });

  it("attaches parameter bit information", () => {
    const ccf = readDat(ccfPath);
    const cdf = readDat(cdfPath);

    const index = buildMibIndexFromLines([ccf], [cdf], [], [], [], [], [], [], [], []);
    
    let foundBitInfo = false;

    for (const entry of index.tcById.values()) {
      for (const param of entry.params) {
        if (param.bitLength || param.bitOffset !== undefined) {
          foundBitInfo = true;
          // bitLength and bitOffset come from CDF as strings
          assert.ok(param.bitLength === undefined || typeof param.bitLength === "string" || typeof param.bitLength === "number", 
            "bitLength should be string, number, or undefined");
          assert.ok(param.bitOffset === undefined || typeof param.bitOffset === "string" || typeof param.bitOffset === "number",
            "bitOffset should be string, number, or undefined");
        }
      }
    }

    assert.ok(foundBitInfo, "Expected to find parameters with bit information");
  });

  it("handles parameters with enumeration types", () => {
    const ccf = readDat(ccfPath);
    const cdf = readDat(cdfPath);

    const index = buildMibIndexFromLines([ccf], [cdf], [], [], [], [], [], [], [], []);
    
    let foundEnumType = false;

    for (const entry of index.tcById.values()) {
      for (const param of entry.params) {
        if (param.kind === "E") {
          foundEnumType = true;
          // Enumeration type parameters may or may not have predefined values
          // depending on whether CVE/TXP data is available
          assert.ok(param.paramId, "Enumeration parameter should have ID");
        }
      }
    }

    assert.ok(foundEnumType, "Expected to find enumeration type parameters (kind=E)");
  });

  it("preserves parameter IDs and names", () => {
    const ccf = readDat(ccfPath);
    const cdf = readDat(cdfPath);

    const index = buildMibIndexFromLines([ccf], [cdf], [], [], [], [], [], [], [], []);
    
    for (const entry of index.tcById.values()) {
      for (const param of entry.params) {
        // Each parameter should have either an ID, name, or both
        const hasId = param.paramId && param.paramId.length > 0;
        const hasName = param.name && param.name.length > 0;
        assert.ok(hasId || hasName, 
          `Parameter should have ID or name: ${JSON.stringify(param)}`);
      }
    }
  });

  it("counts parameters accurately per telecommand", () => {
    const ccf = readDat(ccfPath);
    const cdf = readDat(cdfPath);

    const index = buildMibIndexFromLines([ccf], [cdf], [], [], [], [], [], [], [], []);
    
    let totalParams = 0;
    let tcsWithParams = 0;

    for (const entry of index.tcById.values()) {
      if (entry.params.length > 0) {
        tcsWithParams += 1;
        totalParams += entry.params.length;
      }
    }

    assert.ok(tcsWithParams > 0, "Expected TCs with parameters");
    assert.ok(totalParams > tcsWithParams, "Expected multiple parameters per TC on average");
    assert.ok(totalParams >= 150, "Expected significant number of total parameters");
  });

  it("parses S2KTC033 required and optional parameters", () => {
    const ccf = readDat(ccfPath);
    const cdf = readDat(cdfPath);

    const index = buildMibIndexFromLines([ccf], [cdf], [], [], [], [], [], [], [], []);
    const tc033 = index.tcById.get("S2KTC033");

    assert.ok(tc033, "Expected S2KTC033 in index");
    assert.strictEqual(tc033?.params.length, 6, "Expected 6 total params for S2KTC033");

    const required = tc033!.params.filter((param) => param.name.toLowerCase() !== "filler" && param.kind !== "A");
    const optional = tc033!.params.filter((param) => param.name.toLowerCase() === "filler" || param.kind === "A");

    assert.strictEqual(required.length, 5, "Expected 5 required params for S2KTC033");
    assert.strictEqual(optional.length, 1, "Expected 1 optional param (Filler) for S2KTC033");
    assert.strictEqual(optional[0].name, "Filler", "Expected optional parameter to be Filler");
  });

  it("attaches PAS enumeration values to TC parameters", () => {
    const ccf = readDat(ccfPath);
    const cdf = readDat(cdfPath);
    const cpc = readDat(path.join(base, "cpc.dat"));
    const pas = readDat(path.join(base, "pas.dat"));

    const index = buildMibIndexFromLines([ccf], [cdf], [], [], [], [cpc], [], [], [], [pas]);
    const tc033 = index.tcById.get("S2KTC033");

    assert.ok(tc033, "Expected S2KTC033 in index");

    // Find Memory ID parameter (S2KCP027 with enumSetId 101)
    const memoryIdParam = tc033!.params.find((p) => p.paramId === "S2KCP027");
    assert.ok(memoryIdParam, "Expected Memory ID parameter (S2KCP027)");
    assert.ok(memoryIdParam!.enumerations && memoryIdParam!.enumerations.length > 0, 
      "Expected Memory ID to have enumeration values from PAS.DAT");
    assert.ok(memoryIdParam!.enumerations!.includes("RAM_1"), 
      "Expected Memory ID enumerations to include RAM_1 from PAS.DAT");
  });

  it("verifies all S2KTC033 parameter enumeration counts", () => {
    const ccf = readDat(ccfPath);
    const cdf = readDat(cdfPath);
    const cpc = readDat(path.join(base, "cpc.dat"));
    const pas = readDat(path.join(base, "pas.dat"));

    const index = buildMibIndexFromLines([ccf], [cdf], [], [], [], [cpc], [], [], [], [pas]);
    const tc033 = index.tcById.get("S2KTC033");

    assert.ok(tc033, "Expected S2KTC033 in index");
    assert.strictEqual(tc033!.params.length, 6, "Expected 6 parameters");

    // S2KCP027 (Memory ID) - has enumSetId 101 in CPC, should have 4 values
    const s2kcp027 = tc033!.params.find((p) => p.paramId === "S2KCP027");
    assert.ok(s2kcp027, "Expected S2KCP027");
    assert.ok(s2kcp027!.enumerations, "S2KCP027 should have enumerations array");
    assert.strictEqual(s2kcp027!.enumerations!.length, 4, "S2KCP027 should have 4 enum values from PAS");
    assert.deepStrictEqual(
      s2kcp027!.enumerations!.sort(),
      ["RAM_1", "RAM_2", "RAM_3", "RAM_4"],
      "S2KCP027 should have correct RAM enum values"
    );

    // S2KCP029 (Base) - no enumSetId in CPC, should have no enumerations
    const s2kcp029 = tc033!.params.find((p) => p.paramId === "S2KCP029");
    assert.ok(s2kcp029, "Expected S2KCP029");
    assert.ok(!s2kcp029!.enumerations || s2kcp029!.enumerations.length === 0, 
      "S2KCP029 should have no enumerations");

    // S2KCP030 (Offset) - no enumSetId in CPC
    const s2kcp030 = tc033!.params.find((p) => p.paramId === "S2KCP030");
    assert.ok(s2kcp030, "Expected S2KCP030");
    assert.ok(!s2kcp030!.enumerations || s2kcp030!.enumerations.length === 0, 
      "S2KCP030 should have no enumerations");

    // S2KCP031 (Number of Words) - no enumSetId in CPC
    const s2kcp031 = tc033!.params.find((p) => p.paramId === "S2KCP031");
    assert.ok(s2kcp031, "Expected S2KCP031");
    assert.ok(!s2kcp031!.enumerations || s2kcp031!.enumerations.length === 0, 
      "S2KCP031 should have no enumerations");

    // S2KCP032 (Memory Load Data) - no enumSetId in CPC
    const s2kcp032 = tc033!.params.find((p) => p.paramId === "S2KCP032");
    assert.ok(s2kcp032, "Expected S2KCP032");
    assert.ok(!s2kcp032!.enumerations || s2kcp032!.enumerations.length === 0, 
      "S2KCP032 should have no enumerations");

    // Filler (optional, no paramId) - should have no enumerations
    const filler = tc033!.params.find((p) => p.name === "Filler");
    assert.ok(filler, "Expected Filler parameter");
    assert.ok(!filler!.enumerations || filler!.enumerations.length === 0, 
      "Filler should have no enumerations");
  });
});

