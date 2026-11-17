# SheetQuest Codex Rules

## Objective

Implement only the explicitly requested task.

## Scope

- Inspect relevant files only.
- Do not scan the entire repository by default.
- Do not refactor unrelated code.
- Do not add dependencies without approval.
- Preserve existing architecture and APIs.

## Execution

- Make the smallest correct change.
- Do not repeat successful commands.
- Run targeted tests first.
- Run full regression only when requested.
- Do not run Docker builds unless necessary.
- Avoid unnecessary browser automation.

## Documentation

- Do not rewrite documentation after each edit.
- Update task status at milestone completion.
- Keep summaries under 120 words.

## Efficiency

- Do not spawn subagents.
- Do not perform unsolicited research.
- If blocked after two attempts, stop and report.
- Ask before expanding scope.

## Completion

Report:

1. Changed files
2. What was implemented
3. Tests and results
4. Remaining issues
