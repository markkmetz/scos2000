"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEntrySearchIndex = buildEntrySearchIndex;
exports.scoreEntryMatch = scoreEntryMatch;
exports.rankEntries = rankEntries;
exports.getTelecommandTokenFromLine = getTelecommandTokenFromLine;
exports.isRequiredParam = isRequiredParam;
exports.getAvailableOptionalParamIds = getAvailableOptionalParamIds;
exports.normalizeCompletionToken = normalizeCompletionToken;
exports.shouldShowFullEnumList = shouldShowFullEnumList;
function buildEntrySearchIndex(entries) {
    const index = [];
    for (const entry of entries) {
        index.push({
            entry,
            idLower: entry.id.toLowerCase(),
            nameLower: (entry.name ?? "").toLowerCase(),
            descLower: (entry.description ?? "").toLowerCase(),
            paramNamesLower: entry.params.map((param) => param.name.toLowerCase())
        });
    }
    return index;
}
function scoreEntryMatch(item, queryLower) {
    if (!queryLower) {
        return 0;
    }
    if (item.idLower.includes(queryLower) || item.nameLower.includes(queryLower)) {
        return 3;
    }
    if (item.paramNamesLower.some((name) => name.includes(queryLower))) {
        return 2;
    }
    if (item.descLower.includes(queryLower)) {
        return 1;
    }
    return 0;
}
function rankEntries(entryIndex, query, limit) {
    const queryLower = query.toLowerCase();
    return entryIndex
        .map((item) => ({ entry: item.entry, score: scoreEntryMatch(item, queryLower) }))
        .filter((rankedItem) => rankedItem.score > 0 || queryLower.length === 0)
        .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
        .slice(0, limit);
}
function getTelecommandTokenFromLine(line) {
    const trimmed = line.trim();
    if (!trimmed) {
        return undefined;
    }
    const parts = trimmed.split(/\s+/);
    return parts[0];
}
function isRequiredParam(paramName, kind) {
    if (!paramName || paramName.toLowerCase() === "filler") {
        return false;
    }
    if (!kind) {
        return true;
    }
    const normalized = kind.toUpperCase();
    if (normalized === "A") {
        return false;
    }
    return true;
}
function getAvailableOptionalParamIds(entry, lineText) {
    const usedParamIds = new Set();
    const usedMatches = lineText.matchAll(/\{\s*([A-Za-z0-9_]+)/g);
    for (const match of usedMatches) {
        const usedId = match[1];
        if (usedId) {
            usedParamIds.add(usedId);
        }
    }
    const optionalParamIds = entry.params
        .filter((param) => !isRequiredParam(param.name, param.kind))
        .map((param) => param.paramId || param.name)
        .filter((id) => Boolean(id && id.length > 0))
        .filter((id) => !usedParamIds.has(id));
    return Array.from(new Set(optionalParamIds));
}
function normalizeCompletionToken(value) {
    return value.trim().replace(/^[^A-Za-z0-9_]+|[^A-Za-z0-9_]+$/g, "");
}
function shouldShowFullEnumList(selectedText, valuePrefix) {
    if (!selectedText) {
        return false;
    }
    const normalizedSelected = normalizeCompletionToken(selectedText).toLowerCase();
    const normalizedPrefix = normalizeCompletionToken(valuePrefix).toLowerCase();
    if (!normalizedSelected || !normalizedPrefix) {
        return false;
    }
    return normalizedSelected === normalizedPrefix;
}
//# sourceMappingURL=search.js.map