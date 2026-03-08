# Example telecommand sequence (SCOS-2000 ASCII MIB)
# Use this file to test hover in the extension.

# Telecommand IDs from mibs/ASCII_CSIM/ccf.dat
S2KTC001
S2KTC002
S2KTC003

# Has required params (Memory ID, Base, Offset, Number of Words, Memory Load Data)
# plus optional Filler
S2KTC033 {S2KCP027 1} {S2KCP029 4096} {S2KCP030 0} {S2KCP031 2} {S2KCP032 DEADBEEF}

# Has required params (Sub-schedule ID, Time Tag, TC Packet)
S2KTC044 {S2KCP037 1} {S2KCP038 2026-03-07T12:00:00} {S2KCP039 18AB34}

# Has required param with enum (Housekeeping SID)
S2KTC007 {S2KCP013 HK_SID_1}

# Has multiple enum params (Function ID=DEVICE_*, Direction=FORWARD/BACKWARD) plus Level (numeric)
S2KTC039 {S2KCP089 50} {S2KCP034 DEVICE_1} {S2KCP090 FORWARD}
