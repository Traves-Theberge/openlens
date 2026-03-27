# openlens Agent Rewrite Plan

## Goal

Rebuild all four agents from the ground up using skills.sh patterns, CodeRabbit/Semgrep/CodeQL/Infer research, and the obra/superpowers structural framework. Each agent becomes a world-class code reviewer, not just a prompt with a checklist.

## Structure Template (all agents follow this)

Every agent will use this skeleton derived from the top skills.sh patterns:

```
1. IRON LAW (non-negotiable gate — 1 bold sentence)
2. PHASED INVESTIGATION (gated pipeline, not a checklist)
   Phase 1: TRIAGE — classify changes, filter irrelevant
   Phase 2: INVESTIGATE — read files, grep patterns, trace flows
   Phase 3: ASSESS — assign confidence with evidence requirements
3. WHAT TO LOOK FOR (domain-specific checklist — expanded from research)
4. DECISION TREES (if/then for ambiguous cases)
5. SCOPE BOUNDARIES (what not to flag — with decision procedures, not just lists)
6. RED FLAGS (self-monitoring — stop and reassess signals)
7. RATIONALIZATION PREVENTION (excuse → reality table)
8. EVIDENCE REQUIREMENTS (what proof is needed per confidence level)
9. EXAMPLES (3+ good/bad pairs with investigation trail shown)
10. COMMON FALSE POSITIVES (patterns to skip)
11. OUTPUT FORMAT (strict JSON schema with severity enforcement)
```

---

## Agent 1: Security

### Research Sources
- Semgrep rules (taint analysis, injection patterns)
- CodeQL queries (interprocedural data flow)
- Snyk Code patterns (secrets, crypto misuse)
- OWASP Top 10 + API Security Top 10
- CWE Top 25 Most Dangerous Software Weaknesses

### Iron Law
**"NO SECURITY ISSUE REPORTED WITHOUT TRACING DATA FLOW FROM SOURCE TO SINK"**

### Expanded Checklist (from research)
Current: 11 items (injection, XSS, auth, secrets, path traversal, deserialization, validation, eval, SSRF, crypto, deps)

Add:
- Taint analysis across function boundaries (trace user input 3-5 layers deep)
- Prototype pollution (recursive merge, obj[userInput])
- ReDoS (nested quantifiers on user input)
- Timing side channels (string comparison of secrets)
- BOLA/IDOR (object-level access control)
- Dependency confusion (mixed registries)
- path.join vs path.resolve (path.join doesn't prevent absolute paths)
- Cryptographic misuse details (ECB mode, static IVs, Math.random for security)
- Authorization bypass through missing ownership checks
- Template literal injection

### Investigation Strategy
- Phase 1: Identify all entry points in the diff (HTTP handlers, message consumers, file readers)
- Phase 2: For each entry point, trace user-controlled data through function calls to sinks
- Phase 3: For each potential vulnerability, check if sanitization/validation exists between source and sink

### Decision Tree
```
Found potential injection?
  → Can you trace user input to the sink?
    Yes → Can you find sanitization between source and sink?
      No sanitization found → HIGH confidence, CRITICAL severity
      Sanitization exists but incomplete → MEDIUM confidence, WARNING severity
    No → Cannot trace → Do not report
```

### Rationalization Prevention
| Excuse | Reality |
|--------|---------|
| "The input is validated elsewhere" | Grep for the validation. If you can't find it, report. |
| "This is internal-only code" | Internal code gets promoted to external. Flag it. |
| "The framework handles this" | Read the framework config to confirm. |
| "It's just a test file" | Unless it leaks real credentials, skip. |

### Examples (3 pairs)
1. SQL injection: show full trace from req.body → function call → query concatenation
2. Auth bypass: show missing ownership check on resource endpoint
3. Path traversal: show path.join with user input (NOT safe)

### Common False Positives
- Parameterized queries flagged as injection
- Framework CSRF protection flagged as missing
- Development-only debug flags guarded by NODE_ENV

---

## Agent 2: Bugs

### Research Sources
- Facebook Infer (null safety, resource leaks, race conditions)
- Qodana/IntelliJ inspections (type narrowing, boundary conditions)
- Coverity (concurrency, error handling)
- ErrorProne (Java patterns adapted to TS)

### Iron Law
**"NO BUG REPORTED WITHOUT VERIFYING AT LEAST ONE CALLER OR INPUT THAT TRIGGERS THE CONDITION"**

### Expanded Checklist (from research)
Current: 12 items

Add:
- Resource leaks on all paths (including error paths)
- Off-by-one in pagination (skip/offset calculations)
- Async/await gaps (floating promises, try/catch scope, Promise.all vs allSettled)
- State mutation through reference aliases
- Type coercion specifics (parseInt without radix, Number(""), Array.sort without comparator)
- Error swallowing (catch that logs but doesn't re-throw, generic "an error occurred")
- Race conditions in async (check-then-act, shared mutable state, read-modify-write without transactions)
- Incorrect boolean logic (De Morgan violations, always-true/false conditions)
- Contract violations across boundaries (changed return type breaks callers)
- Stale closures (React hooks capturing old values)

### Investigation Strategy
- Phase 1: For each changed function, identify its inputs, outputs, error cases, and side effects
- Phase 2: Grep for all callers. Check if any caller passes inputs that would trigger the bug
- Phase 3: Trace the error path — what happens when this operation fails?

### Decision Tree
```
Found potential null dereference?
  → Grep for callers
    Callers pass null/undefined? → HIGH confidence
    All callers guard against null? → Do not report
    Cannot determine? → Read type definitions
      Types allow null? → MEDIUM confidence
      Types exclude null (no `any` or assertions)? → Do not report
```

### Rationalization Prevention
| Excuse | Reality |
|--------|---------|
| "This would never happen in practice" | Grep callers. If ANY caller can trigger it, report. |
| "The types prevent this" | Check for `any`, type assertions (`as`), or `!` operator upstream. |
| "The error is caught somewhere" | Trace the catch. Does it re-throw or swallow? |
| "This is an edge case" | Edge cases cause production incidents. Report. |

### Examples (3 pairs)
1. Null deref: show grepping callers, finding one that passes undefined
2. Resource leak: show stream opened in try, not closed in catch
3. Async gap: show floating promise without await

### Common False Positives
- Optional chaining (`?.`) flagged as "missing null check" — it IS the check
- Exhaustive switch flagged as "missing default" when all enum values covered
- TypeScript `!` assertion flagged when the developer knows the value is non-null from context

---

## Agent 3: Performance

### Research Sources
- Lighthouse/Web Vitals (rendering, LCP, CLS)
- Clinic.js (Node.js profiling patterns)
- eslint-plugin-perf-standard
- Database optimization guides (index usage, query plans)

### Iron Law
**"NO PERFORMANCE ISSUE REPORTED WITHOUT CONFIRMING THE CODE PATH IS HOT (CALLED IN A LOOP, REQUEST HANDLER, OR FREQUENTLY)"**

### Expanded Checklist (from research)
Current: 10 items

Add:
- Subtle N+1 (ORM lazy loading in serialization, GraphQL per-field resolvers)
- Unbounded data accumulation (in-memory caches without eviction, event listener accumulation)
- Missing memoization in render loops (React useMemo/useCallback, inline objects in JSX)
- Inefficient data structures (Array.includes in loop → use Set, repeated indexOf → build Map)
- Memory leaks (closures capturing large scopes, setInterval without clearInterval, detached DOM)
- Bundle size (importing whole libraries, barrel file re-exports defeating tree-shaking)
- Unoptimized DB access (SELECT *, missing LIMIT, transaction scope too large)
- Network waterfall (sequential awaits that could be Promise.all)
- Startup costs (top-level await, synchronous I/O at module load, eager initialization)
- String concatenation in loops (should use array + join)

### Investigation Strategy
- Phase 1: Identify the execution context — is this a request handler, a startup script, a background job, a render function?
- Phase 2: For each changed function, check if it's called in a loop, from a hot path, or from multiple concurrent callers
- Phase 3: Calculate complexity — what happens at 10x, 100x, 10,000x the current scale?

### Decision Tree
```
Found expensive operation?
  → Is it in a request handler or render function?
    Yes → Is it called per-request or per-render?
      Yes → HIGH confidence, WARNING severity
      No (cached/memoized) → Do not report
    No → Is it in a loop?
      Yes → What's the loop bound? User-controlled? → HIGH confidence
      No → Is it startup-only? → Do not report
```

### Rationalization Prevention
| Excuse | Reality |
|--------|---------|
| "This only runs once" | Check callers. Request handlers run per-request. |
| "Premature optimization" | N+1 queries are never premature. Measure the impact. |
| "It's fast enough" | At 10x scale? At 100x? Quantify. |
| "The database handles it" | Without an index, the database does a full table scan. |

### Examples (3 pairs)
1. N+1: show ORM lazy loading inside .map(), suggest batch query
2. Unbounded cache: show `const cache = {}` growing without limit, suggest LRU
3. Sequential await: show two independent API calls awaited sequentially, suggest Promise.all

### Common False Positives
- One-time startup initialization flagged as "blocking"
- Small array operations flagged as "inefficient" (micro-optimization on cold path)
- Console.log in development code flagged as "performance issue"

---

## Agent 4: Style

### Research Sources
- CodeRabbit's style analysis
- Sourcery's refactoring suggestions
- SonarQube code smells
- Clean Code principles (Robert Martin)
- Project-specific convention detection

### Iron Law
**"NO STYLE ISSUE REPORTED WITHOUT EVIDENCE FROM THE EXISTING CODEBASE SHOWING THE CONVENTION"**

### Expanded Checklist (from research)
Current: 7 items

Add:
- Naming precision (variable names that don't match content, inconsistent verb patterns: get/fetch/load)
- Function complexity (>20 lines with multiple nesting levels, >4 parameters)
- API design consistency (parameter order, return type patterns, HTTP conventions)
- Structural duplication (same control flow with different variables, repeated try/catch)
- Dead code detection (conditions always true/false from types, unused exports)
- Comment quality (comments that repeat code, outdated comments contradicting code, TODO without tracking)
- Module boundary violations (utility reaching into domain internals, wrong dependency direction)
- Test quality (happy-path-only tests, no assertions, brittle implementation-detail tests)
- Magic values (hardcoded strings, numbers, timeouts that should be constants)
- Convention drift (90% of codebase uses pattern A, new code uses pattern B)

### Investigation Strategy
- Phase 1: Read 2-3 existing files in the same module/directory to establish conventions
- Phase 2: Compare the new code against those conventions — naming, structure, error handling
- Phase 3: Grep the codebase for the pattern in question — is the new code consistent?

### Decision Tree
```
Found naming inconsistency?
  → Grep codebase for both patterns
    Existing convention is clear (>80% one way)? → HIGH confidence
    Mixed conventions (50/50)? → Do not report — no clear convention
    New pattern is actually better? → INFO severity with suggestion, not a demand
```

### Rationalization Prevention
| Excuse | Reality |
|--------|---------|
| "This naming is clearer" | Consistency beats individual preference. Check what the codebase uses. |
| "The function isn't that long" | If it has 3+ responsibilities, it's too long regardless of line count. |
| "It works" | Working code can still be unmaintainable. |
| "Style is subjective" | Project conventions are not subjective — they're documented patterns. |

### Examples (3 pairs)
1. Naming: show grepping codebase for "getUserById" pattern (15 matches) vs new "fetchOrder" (0 matches)
2. Complexity: show 40-line function with 4 levels of nesting, suggest extraction
3. Dead code: show exported function with 0 importers found via grep

### Common False Positives
- Formatting issues handled by Prettier/ESLint (tabs, semicolons, quotes)
- Patterns that match what the codebase already does (consistent with existing "bad" patterns)
- Generated code or vendor code
- Test files with intentionally verbose setup

---

## Implementation Order

1. **Security agent** — highest impact, most complex investigation patterns
2. **Bugs agent** — second most critical, builds on security's investigation framework
3. **Performance agent** — distinct investigation style (hot path analysis)
4. **Style agent** — most dependent on codebase context

## Per-Agent Process

For each agent:
1. Write the new prompt following the template
2. Run `openlens agent validate` to verify it parses
3. Test against the auth example code (examples/auth/) to verify quality
4. Compare findings against the old agent's findings
5. Commit

## Estimated Time
~30 minutes per agent, ~2 hours total
