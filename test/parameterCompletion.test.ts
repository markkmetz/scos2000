import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { buildMibIndexFromLines } from "../src/mibParser";
import { getAvailableOptionalParamIds, getTelecommandTokenFromLine, isRequiredParam } from "../src/search";

type DatFile = { path: string; lines: string[] };

function readDat(filePath: string): DatFile {
  const content = fs.readFileSync(filePath, "utf8");
  return { path: filePath, lines: content.split(/\r?\n/) };
}

describe("Parameter completion helpers", () => {
  it("extracts telecommand token from line", () => {
    assert.strictEqual(getTelecommandTokenFromLine("S2KTC001 PARAM=1"), "S2KTC001");
    assert.strictEqual(getTelecommandTokenFromLine("  S2KTC002  X=1 Y=2"), "S2KTC002");
    assert.strictEqual(getTelecommandTokenFromLine(""), undefined);
    assert.strictEqual(getTelecommandTokenFromLine("   "), undefined);
  });

  it("identifies required parameters", () => {
    assert.strictEqual(isRequiredParam("PARAM", "E"), true);
    assert.strictEqual(isRequiredParam("PARAM", "F"), true);
    assert.strictEqual(isRequiredParam("PARAM", undefined), true);
    assert.strictEqual(isRequiredParam("PARAM", "A"), false);
    assert.strictEqual(isRequiredParam("Filler", "E"), false);
  });

  it("finds optional parameter completion for S2KTC033", () => {
    const base = path.resolve(__dirname, "..", "mibs", "ASCII_CSIM");
    const ccf = readDat(path.join(base, "ccf.dat"));
    const cdf = readDat(path.join(base, "cdf.dat"));

    const index = buildMibIndexFromLines([ccf], [cdf], [], [], [], [], [], [], [], []);
    const tc033 = index.tcById.get("S2KTC033");
    assert.ok(tc033, "S2KTC033 should be present");

    const requiredIds = (tc033?.params ?? [])
      .filter((param) => isRequiredParam(param.name, param.kind))
      .map((param) => param.paramId || param.name)
      .filter((id): id is string => Boolean(id));

    assert.ok(requiredIds.length > 0, "S2KTC033 should have required params");

    const commandLine = `S2KTC033 ${requiredIds.map((id) => `{${id} 1}`).join(" ")}`;
    const optionalIds = getAvailableOptionalParamIds(tc033!, commandLine);

    assert.ok(optionalIds.includes("Filler"), "Expected optional completion to include Filler for S2KTC033");
  });

  it("hides optional parameter once already used on line", () => {
    const base = path.resolve(__dirname, "..", "mibs", "ASCII_CSIM");
    const ccf = readDat(path.join(base, "ccf.dat"));
    const cdf = readDat(path.join(base, "cdf.dat"));

    const index = buildMibIndexFromLines([ccf], [cdf], [], [], [], [], [], [], [], []);
    const tc033 = index.tcById.get("S2KTC033");
    assert.ok(tc033, "S2KTC033 should be present");

    const optionalIds = getAvailableOptionalParamIds(tc033!, "S2KTC033 {Filler 0}");
    assert.ok(!optionalIds.includes("Filler"), "Filler should not be re-suggested once already on the line");
  });
});
