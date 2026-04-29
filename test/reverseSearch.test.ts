import * as assert from "assert";

describe("Reverse Search Configuration", () => {
  it("verifies Ctrl+Alt+M keybinding triggers reverse search", () => {
    const packageJson = require("../package.json");
    const keybindings = packageJson.contributes.keybindings;
    
    const ctrlAltM = keybindings.find((kb: any) => kb.key === "ctrl+alt+m");
    assert.ok(ctrlAltM, "Ctrl+Alt+M keybinding should exist");
    assert.strictEqual(
      ctrlAltM.command, 
      "scos2000MibHover.reverseSearch",
      "Ctrl+Alt+M should trigger reverse search (for TCs, TMs, HKs), not autocomplete"
    );
  });

  it("verifies reverse search command is defined", () => {
    const packageJson = require("../package.json");
    const commands = packageJson.contributes.commands;
    
    const reverseSearchCmd = commands.find((cmd: any) => 
      cmd.command === "scos2000MibHover.reverseSearch"
    );
    
    assert.ok(reverseSearchCmd, "Reverse search command should be defined");
    assert.strictEqual(
      reverseSearchCmd.title,
      "SCOS-2000: Reverse MIB Search",
      "Command title should be correct"
    );
  });

  it("verifies autocomplete is not bound to Ctrl+Alt+M", () => {
    const packageJson = require("../package.json");
    const keybindings = packageJson.contributes.keybindings;
    
    const ctrlAltM = keybindings.find((kb: any) => kb.key === "ctrl+alt+m");
    assert.notStrictEqual(
      ctrlAltM?.command,
      "editor.action.triggerSuggest",
      "Ctrl+Alt+M should NOT be bound to autocomplete (was changed in v0.0.17, reverting in v0.0.20+)"
    );
  });

  it("verifies enabled file extensions setting exists", () => {
    const packageJson = require("../package.json");
    const settings = packageJson.contributes.configuration.properties;
    const enabledSetting = settings["scos2000MibHover.enabledFileExtensions"];

    assert.ok(enabledSetting, "enabledFileExtensions setting should exist");
    assert.strictEqual(enabledSetting.type, "string", "enabledFileExtensions must be a string setting");
  });

  it("verifies enabled file extensions default is .tcl", () => {
    const packageJson = require("../package.json");
    const settings = packageJson.contributes.configuration.properties;
    const enabledSetting = settings["scos2000MibHover.enabledFileExtensions"];

    assert.strictEqual(enabledSetting.default, ".tcl", "Default enabled extension should be .tcl");
  });
});
