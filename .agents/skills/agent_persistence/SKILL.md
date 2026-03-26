---
name: Agent Persistence & Self-Awareness
description: Guidelines for maintaining project continuity and memory through structured artifacts.
---

# Agent Persistence Skill

This skill ensures the AI Agent (Antigravity) maintains a high level of "memory" and continuity throughout a project's lifecycle.

## Core Instructions

1. **Mission Control Updates**: Always call `task_boundary` at the start of any significant move. Update it every 5-10 tool calls to reflect progress.
2. **Task Checklist**: Maintain a `task.md` file in the artifacts directory. Mark items as `[/]` (in progress) and `[x]` (completed).
3. **Walkthrough Documentation**: After finishing a major task, create or update `walkthrough.md`. Include:
    - Steps taken.
    - Code diffs.
    - Embedded media (screenshots/recordings) of UI changes.
4. **Context Retrieval**: At the start of a new session, read previous KIs and conversation logs to avoid redundant questions.

## Multi-Step Procedures

### Update Progress
1. Call `task_boundary` with updated `TaskStatus`.
2. Edit `task.md` to reflect the change in project state.

### Finalize Task
1. Run verification commands.
2. Capture screenshots if UI is involved.
3. Write `walkthrough.md`.
4. Call `notify_user` with paths to review.
