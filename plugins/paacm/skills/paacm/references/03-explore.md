# Phase 3: Explore

**When:** STANDARD and DEEP; FAST only when you do not know where the change goes.

1. `paacm task phase exploring`
2. **Delegate to `paacm-explorer`** with precise questions. A good exploration request:

   ```text
   Find, in this repository:
   1. Where <behaviour> is implemented (entry points and the functions on its path).
   2. Which tests cover it, and the command that runs them.
   3. The conventions nearby code follows for <aspect>.
   Return path:line pointers with short quoted snippets, the build and test commands, and open questions. Do not propose a solution.
   ```

   The explorer returns pointers, not conclusions. Ask a follow-up question rather than accepting a vague summary.

3. **Read only the pointed-to ranges you need.** Do not open whole directories or large files end to end.
4. **Check the pointers resolve.** Every file and function the plan will rely on must exist where the explorer said.
5. Record what matters: `paacm task log "explore: <key pointers and commands>"`.

**If `paacm-explorer` is not installed** (core layer), use the IDE's built-in exploration subagent (`Explore` in Claude Code, `explore` in Cursor) with the same request. If no subagent is available, search yourself with targeted searches and read only matching ranges.
