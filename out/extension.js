"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const mibParser_1 = require("./mibParser");
const search_1 = require("./search");
let cachedIndex = null;
function getEnabledFileTokens() {
    const config = vscode.workspace.getConfiguration("scos2000MibHover");
    const raw = config.get("enabledFileExtensions", ".tcl");
    const tokens = raw
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0);
    return tokens.length > 0 ? tokens : [".tcl"];
}
function isFeatureEnabledForDocument(document) {
    const tokens = getEnabledFileTokens();
    if (tokens.includes("*")) {
        return true;
    }
    const extension = path.extname(document.fileName).toLowerCase();
    const languageId = document.languageId.toLowerCase();
    const extWithoutDot = extension.startsWith(".") ? extension.slice(1) : extension;
    return tokens.some((token) => {
        if (token.startsWith(".")) {
            return token === extension;
        }
        return token === languageId || token === extWithoutDot;
    });
}
function buildTelecommandSnippet(entry) {
    const requiredParams = entry.params.filter((param) => (0, search_1.isRequiredParam)(param.name, param.kind));
    if (requiredParams.length === 0) {
        return new vscode.SnippetString(`${entry.id} `);
    }
    let snippetText = entry.id;
    let tabStopIndex = 1;
    for (const param of requiredParams) {
        const id = param.paramId || param.name;
        if (param.enumerations && param.enumerations.length > 0) {
            snippetText += ` {${id} \${${tabStopIndex}|${param.enumerations.join(",")}|}}`;
        }
        else {
            snippetText += ` {${id} \${${tabStopIndex}:value}}`;
        }
        tabStopIndex += 1;
    }
    return new vscode.SnippetString(snippetText);
}
function getParamValueContext(linePrefix) {
    const lastOpenBrace = linePrefix.lastIndexOf("{");
    const lastCloseBrace = linePrefix.lastIndexOf("}");
    if (lastOpenBrace <= lastCloseBrace) {
        return undefined;
    }
    const inside = linePrefix.slice(lastOpenBrace + 1);
    const insideTrim = inside.trimStart();
    const match = insideTrim.match(/^([A-Za-z0-9_]+)\s+([A-Za-z0-9_]*)$/);
    if (!match) {
        return undefined;
    }
    return {
        paramId: match[1],
        valuePrefix: match[2] ?? ""
    };
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
async function readDatLines(uri) {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const content = Buffer.from(bytes).toString("utf8");
    return content.split(/\r?\n/);
}
async function findMibMatches(token, maxFiles, globs) {
    if (!token) {
        return [];
    }
    const regex = new RegExp(`\\b${escapeRegExp(token)}\\b`);
    const matches = [];
    const files = [];
    for (const glob of globs) {
        const found = await vscode.workspace.findFiles(glob, "**/node_modules/**", maxFiles);
        files.push(...found);
    }
    const uniqueFiles = Array.from(new Map(files.map((f) => [f.toString(), f])).values()).slice(0, maxFiles);
    for (const uri of uniqueFiles) {
        const lines = await readDatLines(uri);
        for (let i = 0; i < lines.length; i += 1) {
            if (regex.test(lines[i])) {
                matches.push({ uri, line: i + 1, text: lines[i].trim() });
                if (matches.length >= 5) {
                    return matches;
                }
            }
        }
    }
    return matches;
}
function buildQuickPickItems(entryIndex, query, limit) {
    const ranked = (0, search_1.rankEntries)(entryIndex, query, limit);
    return ranked.map(({ entry, score }) => {
        const label = entry.name ? `${entry.id} (${entry.name})` : entry.id;
        const description = entry.description ?? "";
        const detailPrefix = score === 3 ? "Match: Name/ID" : score === 2 ? "Match: Parameter" : "Match: Description";
        return {
            label,
            description,
            detail: `${detailPrefix} • ${entry.sourcePath}`,
            result: { kind: "tc", entry }
        };
    });
}
async function runReverseSearch(token, maxFiles, globs) {
    const index = await loadMibIndex(maxFiles);
    const quickPick = vscode.window.createQuickPick();
    quickPick.title = "SCOS-2000 Reverse MIB Search";
    quickPick.placeholder = "Type to search TCs, TM parameters, HK packets by name/description";
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = false;
    quickPick.value = token ?? "";
    const entryIndex = index ? (0, search_1.buildEntrySearchIndex)(index.tcById.values()) : [];
    const limit = 200;
    const updateItems = async (query) => {
        const items = [];
        const queryLower = query.toLowerCase();
        // Search TCs
        if (entryIndex.length > 0) {
            const tcItems = buildQuickPickItems(entryIndex, query, limit);
            items.push(...tcItems);
        }
        // Search TM parameters from PCF
        if (index && query.trim().length > 0) {
            for (const [paramId, pcfEntry] of index.pcfByParamId.entries()) {
                const paramIdLower = paramId.toLowerCase();
                const nameLower = (pcfEntry.name ?? "").toLowerCase();
                if (paramIdLower.includes(queryLower) || nameLower.includes(queryLower)) {
                    const matchType = paramIdLower.includes(queryLower) ? "Match: Param ID" : "Match: Param Name";
                    items.push({
                        label: `${paramId} (${pcfEntry.name ?? ""})`,
                        description: "TM Parameter",
                        detail: `${matchType} • TM parameter`,
                        result: {
                            kind: "tmParam",
                            paramId,
                            paramName: pcfEntry.name ?? "",
                            sourcePath: "" // PCF doesn't have a single source file
                        }
                    });
                    if (items.length >= limit)
                        break;
                }
            }
            // Search HK/TM packets from telemetry index
            for (const [sid, tmEntry] of index.telemetryBySid.entries()) {
                const sidLower = sid.toLowerCase();
                const descLower = (tmEntry.description ?? "").toLowerCase();
                if (sidLower.includes(queryLower) || descLower.includes(queryLower)) {
                    const matchType = sidLower.includes(queryLower) ? "Match: SID" : "Match: Description";
                    items.push({
                        label: `${sid} - ${tmEntry.description ?? "No description"}`,
                        description: "HK/TM Packet",
                        detail: `${matchType} • ${tmEntry.sourcePath}`,
                        result: { kind: "tm", telemetryEntry: tmEntry }
                    });
                    if (items.length >= limit)
                        break;
                }
            }
        }
        if (items.length > 0) {
            quickPick.items = items;
            return;
        }
        if (query.trim().length === 0) {
            quickPick.items = [];
            return;
        }
        const matches = await findMibMatches(query, maxFiles, globs);
        quickPick.items = matches.map((match) => {
            const rel = vscode.workspace.asRelativePath(match.uri);
            return {
                label: `${rel}:${match.line}`,
                description: match.text,
                detail: match.uri.fsPath,
                result: { kind: "text", match }
            };
        });
    };
    const onChange = quickPick.onDidChangeValue((value) => {
        void updateItems(value);
    });
    const onAccept = quickPick.onDidAccept(async () => {
        const selection = quickPick.selectedItems[0];
        quickPick.hide();
        if (!selection) {
            return;
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("Open a target editor to insert the selected value.");
            return;
        }
        if (selection.result.kind === "tc") {
            const entry = selection.result.entry;
            const snippet = buildTelecommandSnippet(entry);
            await editor.insertSnippet(snippet);
            void vscode.commands.executeCommand("editor.action.triggerSuggest");
            return;
        }
        if (selection.result.kind === "tm") {
            const tmEntry = selection.result.telemetryEntry;
            await editor.edit((editBuilder) => {
                for (const selectionRange of editor.selections) {
                    editBuilder.replace(selectionRange, tmEntry.sid);
                }
            });
            return;
        }
        if (selection.result.kind === "tmParam") {
            const paramId = selection.result.paramId;
            await editor.edit((editBuilder) => {
                for (const selectionRange of editor.selections) {
                    editBuilder.replace(selectionRange, paramId);
                }
            });
            return;
        }
        const { uri, line } = selection.result.match;
        const document = await vscode.workspace.openTextDocument(uri);
        const sourceEditor = await vscode.window.showTextDocument(document);
        const position = new vscode.Position(Math.max(line - 1, 0), 0);
        sourceEditor.selection = new vscode.Selection(position, position);
        sourceEditor.revealRange(new vscode.Range(position, position));
    });
    const onHide = quickPick.onDidHide(() => {
        onChange.dispose();
        onAccept.dispose();
        onHide.dispose();
        quickPick.dispose();
    });
    await updateItems(quickPick.value);
    quickPick.show();
}
async function findCcfFiles(maxFiles) {
    const lower = await vscode.workspace.findFiles("**/ccf.dat", "**/node_modules/**", maxFiles);
    const upper = await vscode.workspace.findFiles("**/CCF.DAT", "**/node_modules/**", maxFiles);
    return Array.from(new Map([...lower, ...upper].map((f) => [f.toString(), f])).values());
}
async function findCdfFiles(maxFiles) {
    const lower = await vscode.workspace.findFiles("**/cdf.dat", "**/node_modules/**", maxFiles);
    const upper = await vscode.workspace.findFiles("**/CDF.DAT", "**/node_modules/**", maxFiles);
    return Array.from(new Map([...lower, ...upper].map((f) => [f.toString(), f])).values());
}
async function findPidFiles(maxFiles) {
    const lower = await vscode.workspace.findFiles("**/pid.dat", "**/node_modules/**", maxFiles);
    const upper = await vscode.workspace.findFiles("**/PID.DAT", "**/node_modules/**", maxFiles);
    return Array.from(new Map([...lower, ...upper].map((f) => [f.toString(), f])).values());
}
async function findPlfFiles(maxFiles) {
    const lower = await vscode.workspace.findFiles("**/plf.dat", "**/node_modules/**", maxFiles);
    const upper = await vscode.workspace.findFiles("**/PLF.DAT", "**/node_modules/**", maxFiles);
    return Array.from(new Map([...lower, ...upper].map((f) => [f.toString(), f])).values());
}
async function findPcfFiles(maxFiles) {
    const lower = await vscode.workspace.findFiles("**/pcf.dat", "**/node_modules/**", maxFiles);
    const upper = await vscode.workspace.findFiles("**/PCF.DAT", "**/node_modules/**", maxFiles);
    return Array.from(new Map([...lower, ...upper].map((f) => [f.toString(), f])).values());
}
async function findCpcFiles(maxFiles) {
    const lower = await vscode.workspace.findFiles("**/cpc.dat", "**/node_modules/**", maxFiles);
    const upper = await vscode.workspace.findFiles("**/CPC.DAT", "**/node_modules/**", maxFiles);
    return Array.from(new Map([...lower, ...upper].map((f) => [f.toString(), f])).values());
}
async function findCveFiles(maxFiles) {
    const lower = await vscode.workspace.findFiles("**/cve.dat", "**/node_modules/**", maxFiles);
    const upper = await vscode.workspace.findFiles("**/CVE.DAT", "**/node_modules/**", maxFiles);
    return Array.from(new Map([...lower, ...upper].map((f) => [f.toString(), f])).values());
}
async function findCvpFiles(maxFiles) {
    const lower = await vscode.workspace.findFiles("**/cvp.dat", "**/node_modules/**", maxFiles);
    const upper = await vscode.workspace.findFiles("**/CVP.DAT", "**/node_modules/**", maxFiles);
    return Array.from(new Map([...lower, ...upper].map((f) => [f.toString(), f])).values());
}
async function findTxpFiles(maxFiles) {
    const lower = await vscode.workspace.findFiles("**/txp.dat", "**/node_modules/**", maxFiles);
    const upper = await vscode.workspace.findFiles("**/TXP.DAT", "**/node_modules/**", maxFiles);
    return Array.from(new Map([...lower, ...upper].map((f) => [f.toString(), f])).values());
}
async function findPasFiles(maxFiles) {
    const lower = await vscode.workspace.findFiles("**/pas.dat", "**/node_modules/**", maxFiles);
    const upper = await vscode.workspace.findFiles("**/PAS.DAT", "**/node_modules/**", maxFiles);
    return Array.from(new Map([...lower, ...upper].map((f) => [f.toString(), f])).values());
}
async function getIndexCacheKey(files) {
    const parts = [];
    for (const uri of files) {
        const stat = await vscode.workspace.fs.stat(uri);
        parts.push(`${uri.toString()}|${stat.mtime}`);
    }
    return parts.sort().join(";");
}
async function loadMibIndex(maxFiles) {
    const ccfFiles = await findCcfFiles(maxFiles);
    const cdfFiles = await findCdfFiles(maxFiles);
    const pidFiles = await findPidFiles(maxFiles);
    const plfFiles = await findPlfFiles(maxFiles);
    const pcfFiles = await findPcfFiles(maxFiles);
    const cpcFiles = await findCpcFiles(maxFiles);
    const cveFiles = await findCveFiles(maxFiles);
    const cvpFiles = await findCvpFiles(maxFiles);
    const txpFiles = await findTxpFiles(maxFiles);
    const pasFiles = await findPasFiles(maxFiles);
    const allFiles = [...ccfFiles, ...cdfFiles, ...pidFiles, ...plfFiles, ...pcfFiles, ...cpcFiles, ...cveFiles, ...cvpFiles, ...txpFiles, ...pasFiles];
    if (allFiles.length === 0) {
        return null;
    }
    const cacheKey = await getIndexCacheKey(allFiles);
    if (cachedIndex && cachedIndex.cacheKey === cacheKey) {
        return cachedIndex.index;
    }
    const ccfPayload = await Promise.all(ccfFiles.map(async (uri) => ({ path: uri.fsPath, lines: await readDatLines(uri) })));
    const cdfPayload = await Promise.all(cdfFiles.map(async (uri) => ({ path: uri.fsPath, lines: await readDatLines(uri) })));
    const pidPayload = await Promise.all(pidFiles.map(async (uri) => ({ path: uri.fsPath, lines: await readDatLines(uri) })));
    const plfPayload = await Promise.all(plfFiles.map(async (uri) => ({ path: uri.fsPath, lines: await readDatLines(uri) })));
    const pcfPayload = await Promise.all(pcfFiles.map(async (uri) => ({ path: uri.fsPath, lines: await readDatLines(uri) })));
    const cpcPayload = await Promise.all(cpcFiles.map(async (uri) => ({ path: uri.fsPath, lines: await readDatLines(uri) })));
    const cvePayload = await Promise.all(cveFiles.map(async (uri) => ({ path: uri.fsPath, lines: await readDatLines(uri) })));
    const cvpPayload = await Promise.all(cvpFiles.map(async (uri) => ({ path: uri.fsPath, lines: await readDatLines(uri) })));
    const txpPayload = await Promise.all(txpFiles.map(async (uri) => ({ path: uri.fsPath, lines: await readDatLines(uri) })));
    const pasPayload = await Promise.all(pasFiles.map(async (uri) => ({ path: uri.fsPath, lines: await readDatLines(uri) })));
    const index = (0, mibParser_1.buildMibIndexFromLines)(ccfPayload, cdfPayload, pidPayload, plfPayload, pcfPayload, cpcPayload, cvePayload, cvpPayload, txpPayload, pasPayload);
    cachedIndex = { index, cacheKey };
    return index;
}
function findEntryCaseInsensitive(index, token) {
    const direct = index.tcById.get(token) ?? index.tcByName.get(token);
    if (direct) {
        return direct;
    }
    const lowered = token.toLowerCase();
    for (const entry of index.tcById.values()) {
        if (entry.id.toLowerCase() === lowered) {
            return entry;
        }
        if (entry.name && entry.name.toLowerCase() === lowered) {
            return entry;
        }
    }
    return undefined;
}
function findTelecommandOnLine(lineText, index) {
    const trimmed = lineText.trim();
    if (!trimmed) {
        return undefined;
    }
    // Extract first token (should be the TC ID)
    const firstToken = trimmed.split(/\s+/)[0];
    if (!firstToken) {
        return undefined;
    }
    return findEntryCaseInsensitive(index, firstToken);
}
function formatDirectoryTree(relativePath) {
    const parts = relativePath.split("/");
    const tree = [];
    for (let i = 0; i < parts.length; i += 1) {
        const isLast = i === parts.length - 1;
        const prefix = isLast ? "└─ " : "├─ ";
        const indent = "   ".repeat(i);
        tree.push(`${indent}${prefix}${parts[i]}`);
    }
    return tree.join("\n");
}
class MibCodeLensProvider {
    constructor() {
        this.cache = new Map();
        this._onDidChangeCodeLenses = new vscode.EventEmitter();
        this.onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
    }
    // Clear cache and refresh when configuration changes
    refresh() {
        this.cache.clear();
        this._onDidChangeCodeLenses.fire();
    }
    async provideCodeLenses(document) {
        const codeLenses = [];
        if (!isFeatureEnabledForDocument(document)) {
            return codeLenses;
        }
        // Check if feature is enabled
        const config = vscode.workspace.getConfiguration("scos2000MibHover");
        const showDescriptions = config.get("showDescriptions", true);
        if (!showDescriptions) {
            return codeLenses;
        }
        // Check cache first (based on document URI + version)
        const cacheKey = document.uri.toString();
        const cached = this.cache.get(cacheKey);
        if (cached && cached.version === document.version) {
            return cached.lenses;
        }
        // Check if this document is visible - only process visible documents for performance
        const visibleEditor = vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === document.uri.toString());
        if (!visibleEditor) {
            // Document not visible, return cached or empty
            return cached?.lenses ?? codeLenses;
        }
        const index = await loadMibIndex(200);
        if (!index) {
            return codeLenses;
        }
        // Only process visible ranges for performance with large documents
        const visibleRanges = visibleEditor.visibleRanges;
        const linesToProcess = new Set();
        for (const range of visibleRanges) {
            for (let i = range.start.line; i <= range.end.line && i < document.lineCount; i++) {
                linesToProcess.add(i);
            }
        }
        for (const i of linesToProcess) {
            const line = document.lineAt(i);
            const text = line.text.trim();
            if (!text || text.startsWith("#")) {
                continue;
            }
            // Match TC identifiers (S2KTC followed by 3+ digits for performance)
            const tcMatch = text.match(/\b(S2KTC\d{3,})\b/);
            if (tcMatch) {
                const tcId = tcMatch[1];
                const entry = findEntryCaseInsensitive(index, tcId);
                if (entry && entry.description) {
                    const range = new vscode.Range(i, 0, i, 0);
                    const codeLens = new vscode.CodeLens(range);
                    codeLens.command = {
                        title: `${entry.description}`,
                        command: "",
                    };
                    codeLenses.push(codeLens);
                }
            }
            // Match TM parameter identifiers (3 letters + 5 digits)
            const tmMatch = text.match(/\b([A-Z]{3}\d{5})\b/);
            if (tmMatch) {
                const paramId = tmMatch[1];
                const pcfEntry = index.pcfByParamId.get(paramId);
                if (pcfEntry && pcfEntry.name) {
                    const range = new vscode.Range(i, 0, i, 0);
                    const codeLens = new vscode.CodeLens(range);
                    codeLens.command = {
                        title: `${pcfEntry.name}`,
                        command: "",
                    };
                    codeLenses.push(codeLens);
                }
            }
            // Match TM packet/SID identifiers (5 digits)
            const sidMatch = text.match(/\b(\d{5})\b/);
            if (sidMatch && !tmMatch) { // Don't double-match param IDs
                const sid = sidMatch[1];
                const tmEntry = index.telemetryBySid.get(sid);
                if (tmEntry && tmEntry.description) {
                    const range = new vscode.Range(i, 0, i, 0);
                    const codeLens = new vscode.CodeLens(range);
                    codeLens.command = {
                        title: `${tmEntry.description}`,
                        command: "",
                    };
                    codeLenses.push(codeLens);
                }
            }
        }
        // Cache the results
        this.cache.set(cacheKey, {
            version: document.version,
            lenses: codeLenses
        });
        return codeLenses;
    }
}
function activate(context) {
    const hoverProvider = vscode.languages.registerHoverProvider([{ language: "plaintext" }, { language: "tcl" }], {
        async provideHover(document, position) {
            if (!isFeatureEnabledForDocument(document)) {
                return undefined;
            }
            const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_\-]+/);
            if (!wordRange) {
                return undefined;
            }
            const token = document.getText(wordRange);
            const config = vscode.workspace.getConfiguration("scos2000MibHover");
            const globs = config.get("mibGlobs", ["**/*.mib", "**/*.txt"]);
            const maxFiles = config.get("maxFiles", 200);
            const index = await loadMibIndex(maxFiles);
            // First, try to find as a telemetry parameter
            if (index) {
                // Look up in PCF (telemetry parameter catalog)
                const pcfEntry = index.pcfByParamId.get(token);
                if (pcfEntry) {
                    // Find which packets contain this parameter
                    const containingPackets = [];
                    for (const [sid, tmEntry] of index.telemetryBySid.entries()) {
                        const hasParam = tmEntry.params.some(p => p.paramId === token);
                        if (hasParam) {
                            containingPackets.push({ sid, entry: tmEntry });
                        }
                    }
                    if (containingPackets.length > 0) {
                        const md = new vscode.MarkdownString();
                        md.appendMarkdown(`**Telemetry Parameter** \`${token}\`\n\n`);
                        if (pcfEntry.name) {
                            md.appendMarkdown(`**Name:** ${pcfEntry.name}\n\n`);
                        }
                        md.appendMarkdown(`**Found in ${containingPackets.length} packet(s):**\n`);
                        for (const packet of containingPackets) {
                            const desc = packet.entry.description ? ` — ${packet.entry.description}` : "";
                            md.appendMarkdown(`- \`${packet.sid}\`${desc}\n`);
                        }
                        md.appendMarkdown(`\n`);
                        // Show TXP enum values if available
                        if (pcfEntry.enumSetId) {
                            const enumValues = [];
                            for (const [sid, tmEntry] of index.telemetryBySid.entries()) {
                                const param = tmEntry.params.find(p => p.paramId === token);
                                if (param?.enumerations) {
                                    enumValues.push(...param.enumerations);
                                }
                            }
                            const uniqueEnums = Array.from(new Set(enumValues));
                            if (uniqueEnums.length > 0) {
                                md.appendMarkdown(`**Enumeration Values** (from TXP)\n`);
                                for (const enumVal of uniqueEnums.slice(0, 10)) {
                                    md.appendMarkdown(`- \`${enumVal}\`\n`);
                                }
                                if (uniqueEnums.length > 10) {
                                    md.appendMarkdown(`- _(+${uniqueEnums.length - 10} more)_\n`);
                                }
                                md.appendMarkdown(`\n`);
                            }
                        }
                        md.isTrusted = false;
                        return new vscode.Hover(md, wordRange);
                    }
                }
            }
            // Second, try to find as a parameter in any TC
            if (index) {
                for (const tcEntry of index.tcById.values()) {
                    const paramMatch = tcEntry.params.find(p => (p.paramId && p.paramId.toLowerCase() === token.toLowerCase()) ||
                        (p.name && p.name.toLowerCase() === token.toLowerCase()));
                    if (paramMatch) {
                        const md = new vscode.MarkdownString();
                        const paramName = paramMatch.name || paramMatch.paramId || "Unknown";
                        md.appendMarkdown(`**Parameter** \`${paramName}\`\n\n`);
                        if (paramMatch.paramId && paramMatch.paramId !== paramName) {
                            md.appendMarkdown(`**ID:** \`${paramMatch.paramId}\`\n\n`);
                        }
                        const kindMap = {
                            "R": "Required — Must be provided",
                            "A": "Optional — Auxiliary/Filler parameter",
                            "F": "Filler — Padding/unused bits",
                            "E": "Enumeration — Predefined value list",
                            "P": "Parameter — Standard parameter"
                        };
                        if (paramMatch.kind) {
                            md.appendMarkdown(`**Type:** ${kindMap[paramMatch.kind] || paramMatch.kind}\n\n`);
                        }
                        if (paramMatch.bitLength) {
                            md.appendMarkdown(`**Bit Length:** ${paramMatch.bitLength} bits`);
                            if (paramMatch.bitOffset) {
                                md.appendMarkdown(` @ offset ${paramMatch.bitOffset}`);
                            }
                            md.appendMarkdown(`\n\n`);
                        }
                        if (paramMatch.enumerations && paramMatch.enumerations.length > 0) {
                            md.appendMarkdown(`**Enumeration Values** — Select one of these predefined values\n`);
                            for (const enumVal of paramMatch.enumerations) {
                                md.appendMarkdown(`- \`${enumVal}\`\n`);
                            }
                            md.appendMarkdown(`\n`);
                        }
                        else if (paramMatch.kind === "E") {
                            md.appendMarkdown(`**Enumeration Values** — This parameter accepts enumeration values, but no specific values are defined in the MIB database\n\n`);
                        }
                        // Show which TC uses this parameter
                        const tcUsageCount = Array.from(index.tcById.values()).filter(tc => tc.params.some(p => (p.paramId === paramMatch.paramId) ||
                            (p.name === paramMatch.name))).length;
                        md.appendMarkdown(`**Used by:** ${tcUsageCount} telecommand(s)\n\n`);
                        md.isTrusted = false;
                        return new vscode.Hover(md, wordRange);
                    }
                }
            }
            const entry = index ? findEntryCaseInsensitive(index, token) : undefined;
            if (entry) {
                const md = new vscode.MarkdownString();
                const title = entry.name ? `${entry.id} (${entry.name})` : entry.id;
                md.appendMarkdown(`**Telecommand** \`${title}\`\n\n`);
                if (entry.description) {
                    md.appendMarkdown(`${entry.description}\n\n`);
                }
                const details = [];
                if (entry.serviceType) {
                    details.push(`Service: ${entry.serviceType}`);
                }
                if (entry.subService) {
                    details.push(`Subservice: ${entry.subService}`);
                }
                if (entry.apid) {
                    details.push(`APID: ${entry.apid}`);
                }
                if (entry.header) {
                    details.push(`Header: ${entry.header}`);
                }
                if (details.length > 0) {
                    md.appendMarkdown(`${details.join(" | ")}\n\n`);
                }
                // Additional CCF metadata
                const metadata = [];
                if (entry.critical === "Y") {
                    metadata.push(`⚠️ Critical`);
                }
                if (entry.danger === "Y") {
                    metadata.push(`⚡ Danger`);
                }
                if (entry.planRelease === "Y") {
                    metadata.push(`📋 Plan Release`);
                }
                if (entry.tcType) {
                    const typeMap = {
                        "C": "Command",
                        "A": "Acknowledge",
                        "R": "Report",
                        "O": "Other",
                        "S": "Simulation",
                        "F": "FARM",
                        "T": "Test"
                    };
                    const typeName = typeMap[entry.tcType] || entry.tcType;
                    metadata.push(`Type: ${typeName}`);
                }
                if (entry.execMode) {
                    const execMap = {
                        "N": "Normal",
                        "L": "Later",
                        "S": "Scheduled",
                        "B": "Both"
                    };
                    const execName = execMap[entry.execMode] || entry.execMode;
                    metadata.push(`Exec: ${execName}`);
                }
                if (entry.mapId && entry.mapId !== "0") {
                    metadata.push(`Map: ${entry.mapId}`);
                }
                if (metadata.length > 0) {
                    md.appendMarkdown(`${metadata.join(" • ")}\n\n`);
                }
                if (entry.params.length > 0) {
                    const required = entry.params.filter((param) => (0, search_1.isRequiredParam)(param.name, param.kind));
                    const optional = entry.params.filter((param) => !(0, search_1.isRequiredParam)(param.name, param.kind));
                    if (required.length > 0) {
                        md.appendMarkdown(`**Required Parameters**\n`);
                        for (const param of required) {
                            const bits = param.bitLength ? `, ${param.bitLength}b` : "";
                            const offset = param.bitOffset ? `@${param.bitOffset}` : "";
                            const pid = param.paramId ? ` (ID: ${param.paramId})` : "";
                            md.appendMarkdown(`- ${param.name}${bits}${offset}${pid}\n`);
                            if (param.enumerations && param.enumerations.length > 0) {
                                const enumValues = param.enumerations.slice(0, 5).map(v => `\`${v}\``).join(", ");
                                const more = param.enumerations.length > 5 ? ` +${param.enumerations.length - 5} more` : "";
                                md.appendMarkdown(`  - Values: ${enumValues}${more}\n`);
                            }
                        }
                        md.appendMarkdown(`\n`);
                    }
                    if (optional.length > 0) {
                        md.appendMarkdown(`**Optional Parameters**\n`);
                        for (const param of optional) {
                            const bits = param.bitLength ? `, ${param.bitLength}b` : "";
                            const offset = param.bitOffset ? `@${param.bitOffset}` : "";
                            const pid = param.paramId ? ` (ID: ${param.paramId})` : "";
                            md.appendMarkdown(`- ${param.name}${bits}${offset}${pid}\n`);
                            if (param.enumerations && param.enumerations.length > 0) {
                                const enumValues = param.enumerations.slice(0, 5).map(v => `\`${v}\``).join(", ");
                                const more = param.enumerations.length > 5 ? ` +${param.enumerations.length - 5} more` : "";
                                md.appendMarkdown(`  - Values: ${enumValues}${more}\n`);
                            }
                        }
                    }
                }
                else {
                    md.appendMarkdown(`No parameters found in CDF.\n`);
                }
                const rel = vscode.workspace.asRelativePath(vscode.Uri.file(entry.sourcePath));
                md.appendMarkdown(`\n**Source Location**\n\`\`\`\n${formatDirectoryTree(rel)}\n\`\`\`\nLine ${entry.sourceLine}\n\n`);
                md.isTrusted = false;
                return new vscode.Hover(md, wordRange);
            }
            // Try telemetry (SID)
            const telemetryEntry = index?.telemetryBySid.get(token);
            if (telemetryEntry) {
                const md = new vscode.MarkdownString();
                md.appendMarkdown(`**Telemetry Packet** \`${telemetryEntry.sid}\`\n\n`);
                if (telemetryEntry.description) {
                    md.appendMarkdown(`${telemetryEntry.description}\n\n`);
                }
                const details = [];
                if (telemetryEntry.service) {
                    details.push(`Service: ${telemetryEntry.service}`);
                }
                if (telemetryEntry.subService) {
                    details.push(`Subservice: ${telemetryEntry.subService}`);
                }
                if (details.length > 0) {
                    md.appendMarkdown(`${details.join(" | ")}\n\n`);
                }
                if (telemetryEntry.params.length > 0) {
                    md.appendMarkdown(`**Parameters (${telemetryEntry.params.length})**\n`);
                    for (const param of telemetryEntry.params) {
                        const name = param.name || param.paramId || "";
                        const label = param.paramId && param.paramId !== name ? `${name} (ID: ${param.paramId})` : name;
                        md.appendMarkdown(`- ${label}\n`);
                        if (param.enumerations && param.enumerations.length > 0) {
                            const values = param.enumerations.map((value) => `\`${value}\``).join(", ");
                            md.appendMarkdown(`  - Values: ${values}\n`);
                        }
                    }
                }
                else {
                    md.appendMarkdown(`No parameters found in PLF.\n`);
                }
                const rel = vscode.workspace.asRelativePath(vscode.Uri.file(telemetryEntry.sourcePath));
                md.appendMarkdown(`\n**Source Location**\n\`\`\`\n${formatDirectoryTree(rel)}\n\`\`\`\nLine ${telemetryEntry.sourceLine}\n\n`);
                md.isTrusted = false;
                return new vscode.Hover(md, wordRange);
            }
            const matches = await findMibMatches(token, maxFiles, globs);
            if (matches.length === 0) {
                return undefined;
            }
            const md = new vscode.MarkdownString();
            md.appendMarkdown(`**MIB matches for** \`${token}\`\n\n`);
            for (const match of matches) {
                const rel = vscode.workspace.asRelativePath(match.uri);
                md.appendMarkdown(`- ${rel}:${match.line} — ${match.text}\n`);
            }
            md.isTrusted = false;
            return new vscode.Hover(md, wordRange);
        }
    });
    const reverseSearch = vscode.commands.registerCommand("scos2000MibHover.reverseSearch", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("Open a target editor first.");
            return;
        }
        if (!isFeatureEnabledForDocument(editor.document)) {
            const configured = getEnabledFileTokens().join(", ");
            vscode.window.showInformationMessage(`SCOS-2000 MIB features are disabled for this file type. Enabled types: ${configured}`);
            return;
        }
        const selectionText = editor?.document.getText(editor.selection).trim();
        const token = selectionText && selectionText.length > 0 ? selectionText : undefined;
        const config = vscode.workspace.getConfiguration("scos2000MibHover");
        const globs = config.get("mibGlobs", ["**/*.mib", "**/*.txt"]);
        const maxFiles = config.get("maxFiles", 200);
        await runReverseSearch(token, maxFiles, globs);
    });
    context.subscriptions.push(hoverProvider);
    context.subscriptions.push(reverseSearch);
    // CodeLens provider with caching and performance optimizations
    const codeLensProviderInstance = new MibCodeLensProvider();
    const codeLensProvider = vscode.languages.registerCodeLensProvider([{ language: "plaintext" }, { language: "tcl" }], codeLensProviderInstance);
    context.subscriptions.push(codeLensProvider);
    // Refresh CodeLens when configuration changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("scos2000MibHover.showDescriptions") ||
            e.affectsConfiguration("scos2000MibHover.enabledFileExtensions")) {
            codeLensProviderInstance.refresh();
        }
    }));
    // Refresh CodeLens when visible text editors change (e.g., switching tabs)
    context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(() => {
        codeLensProviderInstance.refresh();
    }));
    const completionProvider = vscode.languages.registerCompletionItemProvider([{ language: "plaintext" }, { language: "tcl" }], {
        async provideCompletionItems(document, position, _token, context) {
            if (!isFeatureEnabledForDocument(document)) {
                return undefined;
            }
            const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_\-]+/);
            const wordPrefix = wordRange ? document.getText(wordRange) : "";
            const config = vscode.workspace.getConfiguration("scos2000MibHover");
            const maxFiles = config.get("maxFiles", 200);
            const index = await loadMibIndex(maxFiles);
            if (!index) {
                return undefined;
            }
            const items = [];
            const lowered = wordPrefix.toLowerCase();
            const lineText = document.lineAt(position.line).text;
            const linePrefix = lineText.slice(0, position.character);
            const paramPrefixMatch = linePrefix.match(/\{\s*([A-Za-z0-9_]*)$/);
            const paramPrefix = paramPrefixMatch ? paramPrefixMatch[1] : "";
            const loweredParamPrefix = paramPrefix.toLowerCase();
            const tcEntry = findTelecommandOnLine(lineText, index);
            const valueContext = getParamValueContext(linePrefix);
            console.log("Autocomplete: lineText=", lineText, "tcEntry=", tcEntry?.id, "wordPrefix=", wordPrefix, "paramPrefix=", paramPrefix);
            const triggeredBySpace = context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter
                && context.triggerCharacter === " ";
            // Offer OPTIONAL parameter completion if we found a TC on this line
            if (tcEntry) {
                // If editing a parameter value, prioritize enum value completion for that parameter.
                if (valueContext) {
                    const { paramId, valuePrefix } = valueContext;
                    const loweredValuePrefix = valuePrefix.toLowerCase();
                    const activeEditor = vscode.window.activeTextEditor;
                    const activeSelection = activeEditor?.selection;
                    const selectedText = activeEditor && activeSelection && !activeSelection.isEmpty
                        ? activeEditor.document.getText(activeSelection)
                        : "";
                    const useFullEnumList = !!activeEditor &&
                        activeEditor.document.uri.toString() === document.uri.toString() &&
                        !!activeSelection &&
                        !activeSelection.isEmpty &&
                        activeSelection.start.line === position.line &&
                        (0, search_1.shouldShowFullEnumList)(selectedText, valuePrefix);
                    const param = tcEntry.params.find((p) => (p.paramId || p.name) === paramId);
                    if (param?.enumerations && param.enumerations.length > 0) {
                        const enumItems = [];
                        for (const enumValue of param.enumerations) {
                            if (useFullEnumList || !loweredValuePrefix || enumValue.toLowerCase().startsWith(loweredValuePrefix)) {
                                const enumItem = new vscode.CompletionItem(enumValue, vscode.CompletionItemKind.EnumMember);
                                enumItem.insertText = enumValue;
                                enumItem.detail = `${paramId} value`;
                                enumItem.sortText = `0_${enumValue}`;
                                enumItems.push(enumItem);
                            }
                        }
                        if (enumItems.length > 0) {
                            return enumItems;
                        }
                    }
                }
                const unique = (0, search_1.getAvailableOptionalParamIds)(tcEntry, lineText);
                for (const id of unique) {
                    if (!paramPrefix || id.toLowerCase().startsWith(loweredParamPrefix)) {
                        const param = tcEntry.params.find(p => p.paramId === id || p.name === id);
                        if (!param)
                            continue;
                        const isRequired = (0, search_1.isRequiredParam)(param.name, param.kind);
                        const item = new vscode.CompletionItem(id, vscode.CompletionItemKind.Field);
                        // Optional params use intellisense list + snippet insertion
                        if (param.enumerations && param.enumerations.length > 0) {
                            item.insertText = new vscode.SnippetString(`{${id} \${1|${param.enumerations.join(",")}|}}`);
                        }
                        else {
                            item.insertText = new vscode.SnippetString(`{${id} \${1:value}}`);
                        }
                        // Build detail with parameter info
                        const kindLabel = isRequired ? "Required" : "Optional";
                        const bits = param.bitLength ? ` (${param.bitLength}b)` : "";
                        let detail = `${kindLabel} parameter${bits}`;
                        if (param.enumerations && param.enumerations.length > 0) {
                            item.documentation = `Values: ${param.enumerations.join(", ")}`;
                        }
                        item.detail = detail;
                        item.sortText = `1_${id}`;
                        items.push(item);
                    }
                }
                if (items.length > 0) {
                    console.log("Returning parameter completions");
                    return items;
                }
            }
            // If this invocation came specifically from a space trigger and we didn't match a TC line,
            // do not spam global TC suggestions.
            if (triggeredBySpace && !tcEntry) {
                return undefined;
            }
            // Performance optimization: require at least 3 characters before showing TC suggestions
            // when there are many TCs (thousands)
            if (wordPrefix.length > 0 && wordPrefix.length < 3) {
                return undefined;
            }
            for (const entry of index.tcById.values()) {
                const idMatch = entry.id.toLowerCase().startsWith(lowered);
                const nameMatch = entry.name ? entry.name.toLowerCase().startsWith(lowered) : false;
                if (!wordPrefix || idMatch || nameMatch) {
                    const label = entry.name ? `${entry.id} (${entry.name})` : entry.id;
                    const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Function);
                    // Build snippet with all required parameters
                    const requiredParams = entry.params.filter((param) => (0, search_1.isRequiredParam)(param.name, param.kind));
                    if (requiredParams.length > 0) {
                        let snippetText = entry.id;
                        let tabStopIndex = 1;
                        for (const param of requiredParams) {
                            const id = param.paramId || param.name;
                            if (param.enumerations && param.enumerations.length > 0) {
                                // Enum parameter with choices
                                snippetText += ` {${id} \${${tabStopIndex}|${param.enumerations.join(",")}|}}`;
                            }
                            else {
                                // Free-form parameter
                                snippetText += ` {${id} \${${tabStopIndex}:value}}`;
                            }
                            tabStopIndex++;
                        }
                        item.insertText = new vscode.SnippetString(snippetText);
                        item.command = {
                            command: 'editor.action.triggerSuggest',
                            title: 'Suggest optional parameters'
                        };
                    }
                    else {
                        // No required params - just insert TC ID and trigger suggest for optional params
                        item.insertText = entry.id + ' ';
                        item.command = {
                            command: 'editor.action.triggerSuggest',
                            title: 'Suggest parameters'
                        };
                    }
                    // Show parameter count in detail
                    const requiredCount = entry.params.filter((param) => (0, search_1.isRequiredParam)(param.name, param.kind)).length;
                    const optionalCount = entry.params.length - requiredCount;
                    let paramInfo = '';
                    if (requiredCount > 0) {
                        paramInfo = ` (${requiredCount} required`;
                        if (optionalCount > 0) {
                            paramInfo += `, ${optionalCount} optional`;
                        }
                        paramInfo += ')';
                    }
                    else if (optionalCount > 0) {
                        paramInfo = ` (${optionalCount} optional)`;
                    }
                    item.detail = `${entry.description ?? "Telecommand"}${paramInfo}`;
                    // Prioritize over TCL snippets
                    item.sortText = `0_${entry.id}`;
                    item.preselect = true;
                    items.push(item);
                }
                if (items.length >= 200) {
                    break;
                }
            }
            return items;
        }
    }, "_", "-", "{", " ");
    context.subscriptions.push(completionProvider);
    let lastAutoSuggestKey = "";
    let lastAutoSuggestTime = 0;
    const enumValueAutoSuggest = vscode.window.onDidChangeTextEditorSelection(async (event) => {
        const editor = event.textEditor;
        const selection = editor.selection;
        const allowSelectionTrigger = !selection.isEmpty &&
            selection.start.line === selection.end.line &&
            /^[A-Za-z0-9_]+$/.test(editor.document.getText(selection));
        if (!selection.isEmpty && !allowSelectionTrigger) {
            return;
        }
        const document = editor.document;
        if (!isFeatureEnabledForDocument(document)) {
            return;
        }
        if (document.languageId !== "tcl" && document.languageId !== "plaintext") {
            return;
        }
        const position = selection.active;
        const lineText = document.lineAt(position.line).text;
        const linePrefix = lineText.slice(0, position.character);
        const valueContext = getParamValueContext(linePrefix);
        if (!valueContext) {
            return;
        }
        const paramId = valueContext.paramId;
        if (!paramId) {
            return;
        }
        const config = vscode.workspace.getConfiguration("scos2000MibHover");
        const maxFiles = config.get("maxFiles", 200);
        const index = await loadMibIndex(maxFiles);
        if (!index) {
            return;
        }
        const tcEntry = findTelecommandOnLine(lineText, index);
        if (!tcEntry) {
            return;
        }
        const param = tcEntry.params.find((p) => (p.paramId || p.name) === paramId);
        if (!param?.enumerations || param.enumerations.length === 0) {
            return;
        }
        const now = Date.now();
        const key = `${document.uri.toString()}:${position.line}:${position.character}:${paramId}`;
        if (key === lastAutoSuggestKey && now - lastAutoSuggestTime < 300) {
            return;
        }
        lastAutoSuggestKey = key;
        lastAutoSuggestTime = now;
        void vscode.commands.executeCommand("editor.action.triggerSuggest");
    });
    context.subscriptions.push(enumValueAutoSuggest);
}
function deactivate() {
    // no-op
}
//# sourceMappingURL=extension.js.map