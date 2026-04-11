---
id: BACK-405
title: Expose automated QA settings in config list output
status: To Do
assignee: []
created_date: '2026-04-03 21:19'
labels:
  - bug
  - automation
  - cli
  - p2
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The new automatedQa configuration persists correctly and is available through the browser API, but `backlog config list` does not currently display it. This makes project verification harder after enabling automated QA in a backlog instance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `backlog config list` displays automatedQa settings when configured
- [ ] #2 The output remains readable and consistent with other advanced config fields
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
