# SCOS-2000 MIB Hover

VS Code extension for poking at SCOS MIB stuff.

It mostly targets ASCII SCOS `.dat` files.
There is also a dumb text search fallback for files matched by the configured globs.

## What it does

- Hover telecommand names and show parsed MIB info.
- Show TC params if `ccf.dat` and `cdf.dat` are around.
- Show some TM info from `pid.dat`, `plf.dat`, `pcf.dat`, `txp.dat` and friends.
- Run reverse search from the command palette.

## What it expects

Real parsed features are based on these SCOS table names:

- `ccf.dat`
- `cdf.dat`
- `pid.dat`
- `plf.dat`
- `pcf.dat`
- `cpc.dat`
- `cve.dat`
- `cvp.dat`
- `txp.dat`
- `pas.dat`

Case does not matter. `.DAT` works too.

If those files are not there, the extension can still do plain text matches over files from `scos2000MibHover.mibGlobs`.

## Run it

1. `npm install`
2. `npm run compile`
3. Press `F5`

## Config

- `scos2000MibHover.enabledFileExtensions`: file types where the extension is active. Default is `.tcl`.
- `scos2000MibHover.mibGlobs`: extra files for fallback text search. Current default is `**/*.mib`, `**/*.txt`.
- `scos2000MibHover.maxFiles`: max files to scan. Default is `200`.

## Test data

- `mibs/sample.mib`
- `mibs/ASCII_CSIM/`

ASCII_CSIM came from:
https://github.com/oswald2/AURIS/tree/master/esa-mib/ASCII_CSIM

License there is BSD 3-Clause.

## Notes

- README is short on purpose.
- If something looks wrong, check the code.
