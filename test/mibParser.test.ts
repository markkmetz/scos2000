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

    const index = buildMibIndexFromLines([ccf], [cdf]);
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

    const index = buildMibIndexFromLines([ccf], [cdf]);
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
});
