# SCOS-2000 MIB Hover (VS Code Extension)

Hover over telecommand names to see matching entries in MIB text files in your workspace.

## Features
- Hover over a token (e.g., `TC_FOO_BAR`) in a plaintext or Tcl file.
- The hover shows matching lines from MIB files in the workspace.
- For SCOS-2000 ASCII MIBs, the hover parses `ccf.dat` for telecommand metadata, `cdf.dat` for
  parameters, and `txf.dat` for textual calibration descriptions on telemetry parameters.

## Setup
1. Install dependencies:
   - `npm install`
2. Build:
   - `npm run compile`
3. Press `F5` to launch an Extension Development Host.

## Configuration
- `scos2000MibHover.mibGlobs`: Glob patterns to scan for MIBs. Default: `**/*.mib`, `**/*.txt`, `**/pcf.dat`, `**/pcd.dat`, `**/tcd.dat`, `**/vpd.dat`, `**/*.dat`
- `scos2000MibHover.maxFiles`: Maximum number of MIB files to scan on hover. Default: `200`

## Sample MIB
A minimal sample file is included at:
- `mibs/sample.mib`

## ASCII_CSIM MIB dataset
Pulled from:
- https://github.com/oswald2/AURIS/tree/master/esa-mib/ASCII_CSIM

Local path:
- `mibs/ASCII_CSIM/`

License:
- BSD 3-Clause (see https://github.com/oswald2/AURIS/blob/master/esa-mib/LICENSE)

## SCOS-2000 MIB File Reference

### Currently parsed .dat files

| File | Purpose | Key fields used |
|------|---------|----------------|
| `ccf.dat` | Telecommand definitions | ID, name, description, service type, APID, header |
| `cdf.dat` | Telecommand parameters | TC ID, param name, kind, bit length, bit offset, param ID |
| `pid.dat` | Telemetry packet definitions | Service, subservice, SID, description |
| `plf.dat` | Telemetry parameter list | Param ID, SID (links parameters to packets) |
| `pcf.dat` | Parameter catalog | Param ID, name, calibration set ID |
| `cve.dat` | TC enumeration values | Param ID, value type, value range |
| `cvp.dat` | TC value parameter links | TC ID, value ID |
| `txp.dat` | TM text calibration values | Calibration set ID, from/to range, text label |
| `txf.dat` | TM textual calibration definitions | Calibration ID, description, raw format, alias count |

### Unused .dat files and how to add them

The MIB datasets contain many more files that are not yet parsed. Below is a guide to the
most useful ones, including how you would wire each into the extension.

#### `vpd.dat` — Variable Packet Definition
Defines variable-length parts of telecommand or telemetry packets (e.g., repeating groups).

**Sample data (Eden Router dataset):**
```
65535   0   RTNTCS  0   0   N   N   N_TCs   1   R   N   2   N   0
```

**Key fields:** Packet SID, position, parameter name, group size, repetition count, display options.

**How to add support:**
1. Add a `VpdEntry` type to `mibParser.ts`:
   ```typescript
   export type VpdEntry = {
     tpsd: string;    // VPD_TPSD — parent packet SID
     pos: number;     // VPD_POS — field position
     name: string;    // VPD_NAME — parameter name
     grpSize?: number;  // VPD_GRPSIZE — repeating group size
   };
   ```
2. Add `parseVpdLines(lines, telemetryBySid)` to attach variable fields to TM packets.
3. Add `findVpdFiles` / load in `loadMibIndex` in `extension.ts`.
4. Show variable-length structure in the telemetry hover.

---

#### `mcf.dat` — Mathematical (Polynomial) Calibration
Defines polynomial calibration curves applied to raw TM parameter values to produce
engineering unit values.

**Sample data:**
```
201   TM Poly Curve 1   0.5   -0.4   0.3   -0.2   0.1
```

**Key fields:** Calibration ID, description, 5 polynomial coefficients (a₀ … a₄).

**How to add support:**
1. Add a `McfEntry` type to `mibParser.ts`:
   ```typescript
   export type McfEntry = {
     calibId: string;    // MCF_IDENT
     description: string; // MCF_DESCR
     coefficients: number[]; // MCF_POL1 through MCF_POL5
   };
   ```
2. Add `parseMcfLines(lines)` returning `Map<string, McfEntry>`.
3. Add `mcfByCalibId` to `MibIndex`.
4. Wire into the TM parameter hover to display the calibration formula
   (e.g., `y = 0.5 - 0.4x + 0.3x² ...`).

---

#### `ocf.dat` — Out-of-Limit / On-Board Control Function
Associates telemetry parameters with monitoring check names. Used to determine
which parameters trigger alarms.

**Sample data:**
```
S2KTP202   2   1   C   A
```

**Key fields:** Param name, number of checks, intercept, coding, read-only flag.

**How to add support:**
1. Add an `OcfEntry` type to `mibParser.ts`.
2. Parse and store in `MibIndex` as `ocfByParamName`.
3. Show "Monitored: yes (N checks)" in TM parameter hover.

---

#### `grp.dat` / `grpa.dat` / `grpk.dat` — Parameter Groups
Groups related telemetry parameters together for display or processing.

**Sample data:**
```
GRP01   Misc Par   PA
GRP02   Dyn UDC Par   PA
```

**Key fields:** Group name, description, group type (PA=parameter, PK=packet).

**How to add support:**
1. Add `GrpEntry` type and `parseGrpLines` in `mibParser.ts`.
2. Store in `MibIndex` as `grpByName`.
3. Optionally load `grpa.dat` (group-to-parameter assignments) and `grpk.dat`
   (group-to-packet assignments) to list members.
4. Show a "Groups: GRP01 (Misc Par)" line in parameter or packet hover.

---

#### `tcp.dat` — TC Polynomial Calibration
Similar to `mcf.dat` but for telecommand parameters — defines polynomial calibration
curves used to convert engineering values to raw TC parameter values.

**How to add support:** Follow the same pattern as `mcf.dat` above but link calibration
IDs from `cdf.dat` or `pcf.dat` columns referencing TC calibration.

---

#### `caf.dat` — Calibration Applicability
Maps parameter values to applicable calibration definitions. Used to select the
correct calibration curve based on the current raw value range.

**How to add support:** Parse and use to select the right `mcf` or `txf` entry
for a parameter given its current raw value.

---

#### Other unused files

| File | Purpose |
|------|---------|
| `cap.dat` | Calibration applicability (range-based calibration selection) |
| `cca.dat` | Command criticality assessment |
| `ccs.dat` | Command control state |
| `cpc.dat` | Command pre-condition check |
| `cps.dat` | Command post-condition / status |
| `csf.dat` | Custom status flags |
| `csp.dat` | Command status parameters |
| `css.dat` | Command status sequences |
| `cur.dat` | Unit definitions |
| `cvs.dat` | Value set definitions |
| `dpc.dat` | Derived parameter calculations |
| `dpf.dat` | Derived parameter format |
| `dst.dat` | Data store definitions |
| `gpc.dat` | Global parameter catalog |
| `gpf.dat` | Global parameter format |
| `lgf.dat` | Log file definitions |
| `mdf.dat` | Monitoring definitions |
| `ocp.dat` | On-board control procedure (OCP) definition |
| `paf.dat` | Parameter action function |
| `pas.dat` | Parameter action sequence |
| `pcdf.dat` | Parameter command dispatch function |
| `pcpc.dat` | Parameter command pre-condition check |
| `pic.dat` | Packet identification criteria |
| `prf.dat` | Parameter report file |
| `prv.dat` | Parameter report value |
| `psm.dat` | Packet structure map |
| `pst.dat` | Packet store table |
| `psv.dat` | Packet store value |
| `ptv.dat` | Parameter table value |
| `pvs.dat` | Parameter value set |
| `sdf.dat` | Sequence definition file |
| `spc.dat` | Service/protocol configuration |
| `spf.dat` | Service protocol format |
| `tpcf.dat` | TC packet configuration |
| `vdf.dat` | Variable data format |
| `gsid.dat` | Ground station identifiers |
| `TPKTconfigTable.dat` | TPKT simulator configuration |
| `TPKTconnTable.dat` | TPKT connection table |
| `TPKTsimGSIDs.dat` | TPKT simulator ground station IDs |
| `TPKTsimSIDs.dat` | TPKT simulator SIDs |

---

### How to implement a new .dat file type (step-by-step)

1. **Add a type** in `src/mibParser.ts`:
   ```typescript
   export type MyEntry = {
     id: string;
     description: string;
     // ... other fields from the dat file
   };
   ```

2. **Add a parse function** in `src/mibParser.ts`:
   ```typescript
   export function parseMyLines(lines: string[]): Map<string, MyEntry> {
     const entries = new Map<string, MyEntry>();
     for (const line of lines) {
       if (!line || line.trim().length === 0 || line.trim().startsWith("#")) continue;
       const cols = line.split("\t").map(v => v.trim());
       const id = cols[0];
       if (!id) continue;
       entries.set(id, { id, description: cols[1] ?? "" });
     }
     return entries;
   }
   ```

3. **Add the map to `MibIndex`** in `src/mibParser.ts`:
   ```typescript
   export type MibIndex = {
     // ... existing fields
     myById: Map<string, MyEntry>;
   };
   ```

4. **Call the parser** in `buildMibIndexFromLines` and populate the new map.

5. **Add `findMyFiles`** in `src/extension.ts`:
   ```typescript
   async function findMyFiles(maxFiles: number): Promise<vscode.Uri[]> {
     const lower = await vscode.workspace.findFiles("**/my.dat", "**/node_modules/**", maxFiles);
     const upper = await vscode.workspace.findFiles("**/MY.DAT", "**/node_modules/**", maxFiles);
     return Array.from(new Map([...lower, ...upper].map(f => [f.toString(), f])).values());
   }
   ```

6. **Load the files** in `loadMibIndex` (add to `allFiles`, read and pass to `buildMibIndexFromLines`).

7. **Use in the hover** — look up `index.myById.get(token)` and append to the `MarkdownString`.

8. **Add tests** in `test/mibParser.test.ts` using real data from `mibs/ASCII_CSIM/`.

## Next Steps
- Add support for `mcf.dat` (polynomial calibration) to show engineering unit formulas in TM hover.
- Add `vpd.dat` support for variable-length packet structure display.
- Add parameter validation for telecommands using `cpc.dat`/`cps.dat`.

## Public MIBs for testing
If you have a URL or dataset you can share, I can add it to the workspace and wire it into the hover provider.
