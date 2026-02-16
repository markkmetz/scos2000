import * as assert from "assert";
import { getTelecommandTokenFromLine, isRequiredParam } from "../src/search";

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
});
