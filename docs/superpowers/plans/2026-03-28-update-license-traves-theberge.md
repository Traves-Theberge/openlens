# Update License Traves Theberge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Traves Theberge" name to the MIT license copyright line

**Architecture:** Simple text replacement in LICENSE file copyright line to properly attribute the software to Traves Theberge

**Tech Stack:** File editing, git version control

---

### Task 1: Update LICENSE File Copyright

**Files:**
- Modify: `LICENSE:3` (copyright line)

- [ ] **Step 1: Read current LICENSE file**

Read the LICENSE file to confirm current state and identify the exact line needing modification.

Expected: Line 3 shows "Copyright (c) 2026 " without the author name

- [ ] **Step 2: Update copyright line to include Traves Theberge**

```
Copyright (c) 2026 Traves Theberge
```

Replace the incomplete copyright line with the proper attribution including the full name.

- [ ] **Step 3: Verify the change is correct**

Read the updated LICENSE file to confirm:
- Line 3 now shows "Copyright (c) 2026 Traves Theberge"
- All other lines remain unchanged
- Standard MIT license format is preserved

- [ ] **Step 4: Commit the license update**

```bash
git add LICENSE
git commit -m "feat(OPENLENS-3): Update license to include Traves Theberge name

- Add Traves Theberge to copyright line in MIT license
- Resolves missing attribution in LICENSE file"
```

### Task 2: Verify Consistency

**Files:**
- Read: `package.json` (author field reference)
- Read: Various documentation files (for consistency check)

- [ ] **Step 5: Check author consistency across project**

Verify that the name "Traves Theberge" in the LICENSE file matches the format used in other project files:

Expected findings:
- `package.json` shows `"author": "Traves Theberge"`
- Documentation references use "Traves-Theberge" in URLs (hyphenated)
- LICENSE should use the same format as package.json author field

- [ ] **Step 6: Verify final state**

Confirm the LICENSE file now properly attributes the software to Traves Theberge and matches the author attribution used elsewhere in the project.

Expected: LICENSE file copyright line now reads "Copyright (c) 2026 Traves Theberge"

- [ ] **Step 7: Final verification that change compiles/passes**

Run basic project verification to ensure the license change doesn't break anything:

```bash
bun run typecheck
```

Expected: TypeScript compilation succeeds (license change should not affect code)