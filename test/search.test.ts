import * as assert from "assert";
import { buildEntrySearchIndex, rankEntries } from "../src/search";
import { TcEntry } from "../src/mibParser";

function makeEntry(options: Partial<TcEntry> & { id: string }): TcEntry {
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    header: options.header,
    serviceType: options.serviceType,
    subService: options.subService,
    apid: options.apid,
    sourcePath: options.sourcePath ?? "/tmp/ccf.dat",
    sourceLine: options.sourceLine ?? 1,
    params: options.params ?? []
  };
}

describe("Search ranking", () => {
  it("prioritizes telecommand name/ID matches", () => {
    const entries: TcEntry[] = [
      makeEntry({ id: "TC_A", name: "DEPLOY" }),
      makeEntry({ id: "TC_B", name: "RESET" })
    ];

    const index = buildEntrySearchIndex(entries);
    const ranked = rankEntries(index, "deploy", 10);

    assert.strictEqual(ranked[0].entry.id, "TC_A");
    assert.strictEqual(ranked[0].score, 3);
  });

  it("matches parameter names when no name/ID match", () => {
    const entries: TcEntry[] = [
      makeEntry({ id: "TC_A", name: "DEPLOY", params: [{ name: "MODE", raw: [] }] }),
      makeEntry({ id: "TC_B", name: "RESET", params: [{ name: "TARGET", raw: [] }] })
    ];

    const index = buildEntrySearchIndex(entries);
    const ranked = rankEntries(index, "target", 10);

    assert.strictEqual(ranked[0].entry.id, "TC_B");
    assert.strictEqual(ranked[0].score, 2);
  });

  it("matches description when no name or parameter match", () => {
    const entries: TcEntry[] = [
      makeEntry({ id: "TC_A", name: "DEPLOY", description: "Deploy solar array" }),
      makeEntry({ id: "TC_B", name: "RESET", description: "Reboot payload" })
    ];

    const index = buildEntrySearchIndex(entries);
    const ranked = rankEntries(index, "payload", 10);

    assert.strictEqual(ranked[0].entry.id, "TC_B");
    assert.strictEqual(ranked[0].score, 1);
  });
});
