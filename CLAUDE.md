# CLAUDE.md

Guidance for AI assistants (Claude Code and other agents) working in this repository.

## What this project is

**WeMadeAGame** is an experiment in AI-driven product development. The goal is to
use AI agents to **research, plan, execute, test, iterate, and polish** a product
until it qualifies for publishing in one or more major app stores (Apple App Store,
Google Play, Steam, etc.).

Direction comes from the repository owner, and decisions are meant to be driven by
**profit-based calculations** — agents should weigh effort, market fit, and
monetization potential when proposing or making choices, and surface the trade-offs
rather than deciding silently.

See `README.md` for the owner's own framing of the vision.

## Current state of the repository

> **This is a greenfield repository.** As of this writing it contains only
> `README.md` and this `CLAUDE.md`. There is no application code, build tooling,
> dependency manifest, test suite, or CI configuration yet.

Because nothing is committed yet, the following have **not been decided**:

- **Target platform(s)** — mobile, desktop, web, or console.
- **Engine / tech stack** — e.g. Unity, Godot, Unreal, a web stack (JS/TS + a
  canvas/WebGL framework), or something else.
- **Language(s), package manager, and project layout.**
- **The game itself** — genre, mechanics, art direction, scope.

Do not assume any of these. When work starts, one of the first tasks is to help the
owner choose them deliberately, and then **update this file** to reflect the actual
stack, structure, and workflows.

## How to work here

Since there are no established build/test/lint commands yet, there is nothing to run.
As the project takes shape, keep this section current with the real commands, e.g.:

```
# examples to fill in once the stack exists
# install:   <package-manager> install
# run:       <command to launch the game locally>
# test:      <command to run the test suite>
# lint:      <command to lint/format>
# build:     <command to produce a release/store build>
```

**When you add tooling, document it here in the same commit.** A stale CLAUDE.md is
worse than none — treat this file as living documentation.

## Conventions for agents

- **Be honest about state.** If something isn't built, tested, or verified, say so.
  Don't describe planned work as done.
- **Make decisions explicit.** Given the profit-driven mandate, when you propose a
  direction (platform, engine, feature, monetization model), state the reasoning and
  the trade-offs so the owner can steer.
- **Keep scope shippable.** The north star is a product that can actually pass store
  review and reach users — prefer choices that get to a publishable build over
  open-ended experimentation.
- **Update this file** whenever the structure, stack, workflows, or conventions
  change. Add sections (architecture, directory layout, asset pipeline, store-submission
  checklist) as they become real.
- **Respect store requirements early.** App-store review covers privacy policies,
  content ratings, icons/screenshots, and platform guidelines. Factor these in when
  planning, not just at submission time.

## Git & branch workflow

- **Default branch:** `main`.
- **Remote:** `origin` → `Bannon-github/WeMadeAGame`.
- Do development on a **feature branch**, not directly on `main`.
- Write clear, descriptive commit messages.
- Push with `git push -u origin <branch-name>`.
- **Do not open a pull request unless explicitly asked.**
- If a feature branch's PR has already been merged, treat follow-up work as a fresh
  change: restart the branch from the latest `main` rather than stacking new commits
  on already-merged history.
