# Progress: <task-id>

Append-only. One line per event: `- <UTC timestamp> <event>`. Written by `paacm task log`.

- <timestamp> started: route <FAST|STANDARD|DEEP>, autonomy <level>, base <commit> — <summary>
- <timestamp> input: <kind> <location> — <how it is used>
- <timestamp> decision: <what was decided and by whom>
- <timestamp> task <n> done: <commit>
- <timestamp> gate: <tier> <passed|failed: label>
