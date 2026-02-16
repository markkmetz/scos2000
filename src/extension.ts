import * as vscode from "vscode";
import { buildMibIndexFromLines, MibIndex, TcEntry } from "./mibParser";
import { buildEntrySearchIndex, getTelecommandTokenFromLine, isRequiredParam, rankEntries } from "./search";

type CachedIndex = {
  index: MibIndex;
  cacheKey: string;
};

let cachedIndex: CachedIndex | null = null;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readDatLines(uri: vscode.Uri): Promise<string[]> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  const content = Buffer.from(bytes).toString("utf8");
  return content.split(/\r?\n/);
}

async function findMibMatches(
  token: string,
  maxFiles: number,
  globs: string[]
): Promise<Array<{ uri: vscode.Uri; line: number; text: string }>> {
  if (!token) {
    return [];
  }

  const regex = new RegExp(`\\b${escapeRegExp(token)}\\b`);
  const matches: Array<{ uri: vscode.Uri; line: number; text: string }> = [];

  const files: vscode.Uri[] = [];
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

type ReverseResult =
  | { kind: "tc"; entry: TcEntry }
  | { kind: "text"; match: { uri: vscode.Uri; line: number; text: string } };

type QuickPickResult = vscode.QuickPickItem & { result: ReverseResult };

function buildQuickPickItems(
  entryIndex: ReturnType<typeof buildEntrySearchIndex>,
  query: string,
  limit: number
): QuickPickResult[] {
  const ranked = rankEntries(entryIndex, query, limit);

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

async function runReverseSearch(
  token: string | undefined,
  maxFiles: number,
  globs: string[]
): Promise<void> {
  const index = await loadMibIndex(maxFiles);

  const quickPick = vscode.window.createQuickPick<QuickPickResult>();
  quickPick.title = "SCOS-2000 Reverse MIB Search";
  quickPick.placeholder = "Type to search telecommand name/ID, parameters, then description";
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = false;
  quickPick.value = token ?? "";

  const entryIndex = index ? buildEntrySearchIndex(index.tcById.values()) : [];
  const limit = 200;

  const updateItems = async (query: string) => {
    if (entryIndex.length > 0) {
      quickPick.items = buildQuickPickItems(entryIndex, query, limit);
      if (quickPick.items.length > 0) {
        return;
      }
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

    if (selection.result.kind === "tc") {
      const entry = selection.result.entry;
      const uri = vscode.Uri.file(entry.sourcePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);
      const position = new vscode.Position(Math.max(entry.sourceLine - 1, 0), 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position));
      return;
    }

    const { uri, line } = selection.result.match;
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(Math.max(line - 1, 0), 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position));
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

async function findCcfFiles(maxFiles: number): Promise<vscode.Uri[]> {
  const lower = await vscode.workspace.findFiles("**/ccf.dat", "**/node_modules/**", maxFiles);
  const upper = await vscode.workspace.findFiles("**/CCF.DAT", "**/node_modules/**", maxFiles);
  return Array.from(new Map([...lower, ...upper].map((f) => [f.toString(), f])).values());
}

async function findCdfFiles(maxFiles: number): Promise<vscode.Uri[]> {
  const lower = await vscode.workspace.findFiles("**/cdf.dat", "**/node_modules/**", maxFiles);
  const upper = await vscode.workspace.findFiles("**/CDF.DAT", "**/node_modules/**", maxFiles);
  return Array.from(new Map([...lower, ...upper].map((f) => [f.toString(), f])).values());
}

async function getIndexCacheKey(files: vscode.Uri[]): Promise<string> {
  const parts: string[] = [];
  for (const uri of files) {
    const stat = await vscode.workspace.fs.stat(uri);
    parts.push(`${uri.toString()}|${stat.mtime}`);
  }
  return parts.sort().join(";");
}

async function loadMibIndex(maxFiles: number): Promise<MibIndex | null> {
  const ccfFiles = await findCcfFiles(maxFiles);
  const cdfFiles = await findCdfFiles(maxFiles);
  const allFiles = [...ccfFiles, ...cdfFiles];

  if (allFiles.length === 0) {
    return null;
  }

  const cacheKey = await getIndexCacheKey(allFiles);
  if (cachedIndex && cachedIndex.cacheKey === cacheKey) {
    return cachedIndex.index;
  }

  const ccfPayload = await Promise.all(
    ccfFiles.map(async (uri) => ({ path: uri.fsPath, lines: await readDatLines(uri) }))
  );
  const cdfPayload = await Promise.all(
    cdfFiles.map(async (uri) => ({ path: uri.fsPath, lines: await readDatLines(uri) }))
  );

  const index = buildMibIndexFromLines(ccfPayload, cdfPayload);
  cachedIndex = { index, cacheKey };
  return index;
}

function findEntryCaseInsensitive(index: MibIndex, token: string): TcEntry | undefined {
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

function findTelecommandOnLine(lineText: string, index: MibIndex): TcEntry | undefined {
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

export function activate(context: vscode.ExtensionContext): void {
  const hoverProvider = vscode.languages.registerHoverProvider(
    [{ language: "plaintext" }, { language: "tcl" }],
    {
      async provideHover(document: vscode.TextDocument, position: vscode.Position) {
        const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_\-]+/);
        if (!wordRange) {
          return undefined;
        }

        const token = document.getText(wordRange);
        const config = vscode.workspace.getConfiguration("scos2000MibHover");
        const globs = config.get<string[]>("mibGlobs", ["**/*.mib", "**/*.txt"]);
        const maxFiles = config.get<number>("maxFiles", 200);

        const index = await loadMibIndex(maxFiles);
        const entry = index ? findEntryCaseInsensitive(index, token) : undefined;

        if (entry) {
          const md = new vscode.MarkdownString();
          const title = entry.name ? `${entry.id} (${entry.name})` : entry.id;
          md.appendMarkdown(`**Telecommand** \`${title}\`\n\n`);

          if (entry.description) {
            md.appendMarkdown(`${entry.description}\n\n`);
          }

          const details: string[] = [];
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

          const rel = vscode.workspace.asRelativePath(vscode.Uri.file(entry.sourcePath));
          md.appendMarkdown(`Source: ${rel}:${entry.sourceLine}\n\n`);

          if (entry.params.length > 0) {
            const required = entry.params.filter((param) => isRequiredParam(param.name, param.kind));
            const optional = entry.params.filter((param) => !isRequiredParam(param.name, param.kind));

            if (required.length > 0) {
              md.appendMarkdown(`**Required Parameters**\n`);
              for (const param of required) {
                const bits = param.bitLength ? `, ${param.bitLength}b` : "";
                const offset = param.bitOffset ? `@${param.bitOffset}` : "";
                const pid = param.paramId ? ` (ID: ${param.paramId})` : "";
                md.appendMarkdown(`- ${param.name}${bits}${offset}${pid}\n`);
              }
            }

            if (optional.length > 0) {
              md.appendMarkdown(`**Optional Parameters**\n`);
              for (const param of optional) {
                const bits = param.bitLength ? `, ${param.bitLength}b` : "";
                const offset = param.bitOffset ? `@${param.bitOffset}` : "";
                const pid = param.paramId ? ` (ID: ${param.paramId})` : "";
                md.appendMarkdown(`- ${param.name}${bits}${offset}${pid}\n`);
              }
            }
          } else {
            md.appendMarkdown(`No parameters found in CDF.\n`);
          }

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
    }
  );

  const reverseSearch = vscode.commands.registerCommand("scos2000MibHover.reverseSearch", async () => {
    const editor = vscode.window.activeTextEditor;
    const selectionText = editor?.document.getText(editor.selection).trim();
    const token = selectionText && selectionText.length > 0 ? selectionText : undefined;

    const config = vscode.workspace.getConfiguration("scos2000MibHover");
    const globs = config.get<string[]>("mibGlobs", ["**/*.mib", "**/*.txt"]);
    const maxFiles = config.get<number>("maxFiles", 200);

    await runReverseSearch(token, maxFiles, globs);
  });

  context.subscriptions.push(hoverProvider);
  context.subscriptions.push(reverseSearch);

  const completionProvider = vscode.languages.registerCompletionItemProvider(
    [{ language: "plaintext" }, { language: "tcl" }],
    {
      async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
        const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z0-9_\-]+/);
        const prefix = wordRange ? document.getText(wordRange) : "";

        const config = vscode.workspace.getConfiguration("scos2000MibHover");
        const maxFiles = config.get<number>("maxFiles", 200);
        const index = await loadMibIndex(maxFiles);
        if (!index) {
          return undefined;
        }

        const items: vscode.CompletionItem[] = [];
        const lowered = prefix.toLowerCase();

        const lineText = document.lineAt(position.line).text;
        const tcEntry = findTelecommandOnLine(lineText, index);
        console.log("Autocomplete: lineText=", lineText, "tcEntry=", tcEntry?.id, "prefix=", prefix);

        // Only offer optional param completion if we found a TC on this line
        // and we're not on the TC token itself
        if (tcEntry) {
          // Show only OPTIONAL parameters (not required)
          const optionalParams = tcEntry.params
            .filter((param) => !isRequiredParam(param.name, param.kind))
            .map((param) => param.paramId || param.name)
            .filter((id) => id && id.length > 0);

          const unique = Array.from(new Set(optionalParams));
          for (const id of unique) {
            if (!prefix || id.toLowerCase().startsWith(lowered)) {
              const item = new vscode.CompletionItem(id, vscode.CompletionItemKind.Field);
              item.insertText = `{${id} \$\{value\}}`;
              item.detail = `Optional parameter for ${tcEntry.id}`;
              items.push(item);
            }
          }

          if (items.length > 0) {
            console.log("Returning optional param completions");
            return items;
          }
        }

        for (const entry of index.tcById.values()) {
          const idMatch = entry.id.toLowerCase().startsWith(lowered);
          const nameMatch = entry.name ? entry.name.toLowerCase().startsWith(lowered) : false;

          if (!prefix || idMatch || nameMatch) {
            const label = entry.name ? `${entry.id} (${entry.name})` : entry.id;
            const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Function);
            
            // Build snippet with TC ID + required parameters
            const requiredParams = entry.params
              .filter((param) => isRequiredParam(param.name, param.kind))
              .map((param) => param.paramId || param.name)
              .filter((id) => id && id.length > 0);
            
            const unique = Array.from(new Set(requiredParams));
            if (unique.length > 0) {
              const snippetParts = [entry.id];
              for (let i = 0; i < unique.length; i += 1) {
                const id = unique[i];
                const tabStop = i + 1;
                snippetParts.push(`{${id} \${${tabStop}:value}}`);
              }
              item.insertText = new vscode.SnippetString(snippetParts.join(" "));
              item.detail = `${entry.description ?? "Telecommand"} (${unique.length} required params)`;
            } else {
              item.insertText = entry.id;
              item.detail = entry.description ?? "Telecommand";
            }
            
            items.push(item);
          }

          if (items.length >= 200) {
            break;
          }
        }

        return items;
      }
    },
    "_",
    "-"
  );

  context.subscriptions.push(completionProvider);
}

export function deactivate(): void {
  // no-op
}
