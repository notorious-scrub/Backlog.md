---
id: doc-014
title: Backlog CLI and Application Experience Pain Points Report 2026-04-18
type: other
created_date: '2026-04-18 23:16'
---

# Backlog CLI and Application Experience Pain Points Report (2026-04-18)

## Purpose
This report captures the concrete issues, trust gaps, and product shortcomings encountered while using the Backlog CLI/browser/API to perform backlog governance work, with emphasis on the CF2 cleanup session completed on 2026-04-18.

The goal is to give the Backlog developer a backlog-ready problem list that can be converted into implementation tasks without rewriting the underlying problem statements.

## Scope Of Observations
- Task creation and editing from PowerShell through the local `backlog` wrapper and direct `bun ... cli.ts` invocation
- Document creation through Backlog.md
- Cross-checking CLI state against generated markdown files
- Governance-style work such as documentation backfill, label normalization, milestone hygiene, and wave-parent modeling
- General trust and usability concerns in the surrounding Backlog browser/API application model

## Executive Summary
- The largest problem is trust. After several write operations, the safest way to confirm state was to inspect the underlying markdown files directly instead of trusting the CLI response alone.
- The second-largest problem is automation friction. The CLI is workable for individual interactive edits, but it is missing the structured outputs, deterministic flag semantics, and bulk operations needed for reliable backlog governance.
- The third-largest problem is backlog modeling. The current relationship primitives are strong enough for blockers, but weak for hierarchical planning, milestone summary ownership, and contract-driven governance.

## Priority Summary
- `P1`: Deterministic edit semantics and reliable post-write confirmation
- `P1`: Structured machine-readable output for automation
- `P1`: Native validation/lint support for governance checks
- `P2`: First-class parent/summary relationships that are not blocker dependencies
- `P2`: Bulk metadata operations
- `P2`: Better governance-oriented search/filter/query support
- `P3`: Runtime/surface transparency improvements

## Detailed Issues

### Issue 1: `task edit` write semantics are not trustworthy enough for governance work
**Priority:** `P1`  
**Area:** CLI write-path reliability

**Observed behavior**
- Multi-field edits from PowerShell were not trustworthy enough to accept at face value.
- CLI output could suggest success, but I still needed to inspect the underlying markdown files before considering the result safe.
- Acceptance criteria editing in particular did not feel deterministic when replacing or reshaping a set of items.

**Impact**
- Adds verification overhead to every significant edit.
- Makes governance cleanup risky because subtle metadata drift can survive a "successful" CLI write.
- Pushes the operator toward direct markdown editing, which should be a fallback, not the normal trust path.

**Expected behavior**
- A successful edit command should be authoritative and reproducible.
- Repeated flags and list-like fields should have clear replace/append semantics.
- The output should make it obvious exactly what changed.

**Recommended fix**
- Define explicit flag semantics for every mutable field:
  - replace
  - append
  - clear/remove
- Return a normalized post-write representation of the record.
- Add tests covering repeated flags, multi-line text, and PowerShell quoting.

**Acceptance ideas**
- A documented command using repeated `--ac` flags produces the same result every time.
- The CLI can clearly report whether a field was replaced, appended, or left unchanged.
- The CLI output after edit matches the persisted markdown state exactly.

### Issue 2: The CLI lacks structured output suitable for reliable automation
**Priority:** `P1`  
**Area:** CLI output contract

**Observed behavior**
- `--plain` is readable for humans, but brittle for automation.
- `task create` does not return a concise machine-readable result with the created ID/path/metadata contract.
- Create/view/list/edit/search flows all require text scraping instead of structured parsing.

**Impact**
- Forces wrappers and scripts to rely on fragile text parsing.
- Makes automated validation and bulk maintenance much harder than it should be.
- Raises the cost of integrating Backlog.md into agent-driven workflows.

**Expected behavior**
- Core read/write commands should support `--json`.
- Create/edit commands should return a stable response contract suitable for chaining.

**Recommended fix**
- Add `--json` support to:
  - `task create`
  - `task edit`
  - `task view`
  - `task list`
  - `search`
  - relevant doc/decision/milestone commands
- Standardize create/edit responses to include:
  - `id`
  - `title`
  - `path`
  - `status`
  - `milestone`
  - `labels`
  - `updated_at`

**Acceptance ideas**
- A script can create a task, capture the new ID from JSON, then edit it without text scraping.
- A JSON view of a task contains the same field set every time.

### Issue 3: There is no first-class backlog lint/validate flow for governance hygiene
**Priority:** `P1`  
**Area:** Governance and quality tooling

**Observed behavior**
- I had to create ad hoc checks for missing documentation links, label drift, and milestone summary-parent gaps.
- The product is good at CRUD, but weak at governance verification.

**Impact**
- Teams cannot efficiently prevent backlog entropy.
- Contract-driven programs have to invent their own one-off audit scripts.
- The lack of a native validator increases long-term backlog inconsistency risk.

**Expected behavior**
- The tool should support a standard validation pass for common backlog hygiene rules.
- Projects should be able to add repo-specific required metadata rules.

**Recommended fix**
- Add `backlog validate` or `backlog lint`.
- Support built-in rules such as:
  - missing required metadata
  - invalid labels
  - broken dependencies
  - missing docs references
  - malformed milestones
- Support project-configurable rules in repo config for custom governance contracts.

**Acceptance ideas**
- A repo can declare "all open tasks require documentation links" and receive a failing validation report when violated.
- Validation output is available in both human-readable and JSON form.

### Issue 4: Backlog hierarchy is under-modeled for real planning work
**Priority:** `P2`  
**Area:** Data model / work-item relationships

**Observed behavior**
- Dependencies represent blocker semantics, not hierarchy semantics.
- The built-in child-task pattern conflicts with the desired no-dotted-ID workflow, leaving no clean first-class representation for summary parents or milestone wave owners.
- I had to introduce manual wave-parent conventions in task notes to preserve auditability.

**Impact**
- Epics, wave summaries, milestone parents, and contract parents become conventions instead of modeled entities.
- Reporting and closure audits are weaker than they should be.
- Users are forced to overload dependencies or invent local conventions.

**Expected behavior**
- The product should distinguish:
  - "blocked by"
  - "belongs to"
  - "summary parent of"

**Recommended fix**
- Add a non-dotted first-class parent/child or summary/child relationship model.
- Keep dependency/blocker relationships separate from hierarchy.
- Expose hierarchy in CLI, browser, and API consistently.

**Acceptance ideas**
- A task can belong to a summary parent without being blocked by it.
- Milestone-level summary tasks can be queried directly from the model instead of inferred from notes.

### Issue 5: Bulk metadata operations are missing or too weak
**Priority:** `P2`  
**Area:** CLI ergonomics / maintenance workflows

**Observed behavior**
- Large-scale cleanup required repetitive per-task editing.
- There is no strong native flow for bulk-add/bulk-replace operations across a task range or filtered result set.

**Impact**
- High-friction backlog hygiene work.
- Easy to make inconsistent edits across a wave.
- Discourages teams from fixing metadata debt early.

**Expected behavior**
- Common hygiene operations should support filtered bulk updates.

**Recommended fix**
- Add bulk update commands for labels, documentation references, notes, milestone assignment, and status where appropriate.
- Allow operations against:
  - explicit ID sets
  - search results
  - filtered task lists

**Acceptance ideas**
- A user can backfill one documentation link across all tasks in a milestone without scripting.
- A user can normalize one label across a filtered result set with a preview step before applying changes.

### Issue 6: PowerShell and Windows quoting remain too fragile
**Priority:** `P2`  
**Area:** Windows operator experience

**Observed behavior**
- Because the local `backlog` command is a PowerShell wrapper over `bun`, quoting and repeated flags remain more fragile than they should be.
- Safe usage often requires the explicit argument-array pattern rather than straightforward command strings.

**Impact**
- Normal Windows usage is more error-prone than necessary.
- Agents and human operators need wrapper-specific workarounds instead of relying on normal CLI behavior.

**Expected behavior**
- Common create/edit commands should behave predictably from PowerShell without requiring special handling beyond normal quoting rules.

**Recommended fix**
- Harden the Windows invocation path.
- Publish and test supported PowerShell calling patterns in the main CLI docs.
- Where possible, reduce wrapper sensitivity to repeated flags and multi-word arguments.

**Acceptance ideas**
- Common create/edit examples from PowerShell work without argument loss.
- Repeated `--ac` and multi-sentence descriptions survive intact through the wrapper path.

### Issue 7: Governance-oriented search and reporting are not strong enough
**Priority:** `P2`  
**Area:** Query/search/reporting

**Observed behavior**
- Discovery is fine for title/text lookup, but weak for governance questions.
- I needed queries closer to:
  - open tasks missing documentation
  - tasks with non-canonical labels
  - tasks in a milestone without a summary parent

**Impact**
- Governance work requires custom scripting instead of using the product directly.
- Teams cannot easily monitor backlog health over time.

**Expected behavior**
- Search/list commands and the browser should support metadata health queries.

**Recommended fix**
- Add richer filtering and reporting over metadata completeness and rule violations.
- Consider saved views for common governance audits.

**Acceptance ideas**
- A single command can list all active tasks missing a required field.
- The browser can surface validation failures as a first-class view.

### Issue 8: Cross-surface trust is weaker than it should be
**Priority:** `P2`  
**Area:** Product consistency

**Observed behavior**
- For significant changes, I did not feel comfortable relying on one surface alone.
- The real confidence path became:
  - CLI write
  - CLI read
  - direct markdown inspection
- That is too many layers for routine backlog operations.

**Impact**
- Users lose confidence in the application model.
- The product feels file-backed first and application-driven second.

**Expected behavior**
- CLI/browser/API/file state should feel like one coherent system, not separate surfaces that must be manually reconciled.

**Recommended fix**
- Strengthen post-write confirmation and cross-surface consistency.
- Expose the persisted path and normalized current record after writes.
- Consider optional integrity checks after mutation commands.

**Acceptance ideas**
- After an edit, the CLI can show a normalized persisted snapshot and file path.
- Browser and CLI reads reflect the same result immediately after a successful write.

### Issue 9: Runtime identity is still too opaque when browser/API behavior looks wrong
**Priority:** `P3`  
**Area:** Runtime transparency / operational debugging

**Observed behavior**
- When the browser surface looks stale or incomplete, it is too easy to suspect data corruption before suspecting runtime/version mismatch.
- In practice, operator trust improves only after checking process identity and API version explicitly.

**Impact**
- Wastes time on the wrong root-cause path.
- Makes healthy backlog data look broken when the wrong runtime is serving the UI.

**Expected behavior**
- The browser/API surface should make its runtime identity and version obvious.

**Recommended fix**
- Surface runtime version/build/source information directly in the browser UI and API diagnostics.
- Make runtime mismatch easier to detect before users start debugging data.

**Acceptance ideas**
- The browser shows the current runtime version and project source clearly.
- A stale or incompatible runtime produces an explicit warning instead of silent capability mismatch.

## Recommended Delivery Order
1. Fix write-contract reliability for `task edit`.
2. Add structured `--json` output for read/write operations.
3. Add `backlog validate` / `backlog lint` with configurable project rules.
4. Add first-class parent/summary relationships distinct from blockers.
5. Add bulk metadata operations.
6. Expand governance-oriented search/filter/reporting.
7. Improve runtime transparency and surface identity.

## Suggested Backlog Breakdown
- One task for deterministic edit semantics and tests
- One task for structured JSON output across CLI commands
- One task for validation/lint infrastructure
- One task for hierarchy modeling
- One task for bulk metadata operations
- One task for governance query/reporting improvements
- One task for runtime transparency and diagnostics

## Closing Note
These issues do not mean Backlog.md is unusable. They mean that once the work moves beyond ordinary task CRUD into contract-heavy, milestone-heavy, or governance-heavy backlog management, the current toolchain starts leaking implementation detail and operator uncertainty. That is the gap worth closing.
