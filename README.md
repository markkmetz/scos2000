# SCOS-2000 MIB Hover (VS Code Extension)

Hover over telecommand names to see matching entries in MIB text files in your workspace.

## Features
- Hover over a token (e.g., `TC_FOO_BAR`) in a plaintext or Tcl file.
- The hover shows matching lines from MIB files in the workspace.
- For SCOS-2000 ASCII MIBs, the hover parses `ccf.dat` for telecommand metadata and `cdf.dat` for parameters.

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

## Next Steps
- Parse real SCOS-2000 MIB formats (e.g., `*.dat`, `*.mib`) more precisely.
- Add parameter validation for telecommands.

## Public MIBs for testing
If you have a URL or dataset you can share, I can add it to the workspace and wire it into the hover provider.
