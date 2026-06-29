# Agent Notifications — Design Spec

**Date:** 2026-06-29
**Status:** Approved, pending implementation plan

## Goal

The ghost nudges the user when a coding agent (**Claude Code** or **Codex**)
either **finishes a turn** or **requires action** (needs permission / input).
Reuses the existing reminder-bubble path; preserves the never-steal-focus rule.

## Decisions (from brainstorming)

- **Agents:** Claude Code **and** Codex.
- **Identity in bubble:** real vendor logos (Claude/Anthropic + Codex/OpenAI),
  shipped as small image assets in `src/`.
- **Mood:** `finished` → happy bubble; `needs-action` → angry + lit `#flames`
  (the existing poltergeist look) **and** the chime (respects the mute setting).
- **Hook install:** one-click from a new settings **Agents** tab (auto-merge into
  the agents' own config files, never clobber).

## A. Signaling channel

**Chosen: CLI subcommand + file-drop + poll.**

- New exe subcommand: `poltergeist.exe notify --agent <claude|codex> --event <finished|needs-action>`.
  - Intercepted at the **top of `main()`**, *before* any Tauri/window init: it
    writes one JSON file into the inbox dir and `std::process::exit(0)`. Never
    spawns a window, so it's cheap to call per agent event.
  - File: `<config>/cozy-reminder/inbox/<unix_nanos>-<rand>.json`, contents
    `{ "agent": "...", "event": "...", "ts": <unix_secs> }`.
- The running app scans the inbox dir on a tokio tick, and for each file:
  reads it → deletes it → emits `reminder-due` with the bubble payload.
  Malformed files are deleted and ignored.

**Rejected alternatives:**
- Local HTTP endpoint — needs an HTTP dep + fixed port + risks a Windows firewall
  prompt. Against stdlib-before-deps.
- single-instance plugin forwarding — needs the plugin and spawning the GUI exe
  per event; heavier and flakier.

**Why chosen:** no new deps, no network, cross-platform, matches the existing
polling architecture, and the hook config becomes one clean portable command
instead of shell-specific `echo > file` quoting that breaks across PowerShell/bash.

## B. Frontend (bubble + mood)

- New bubble ids: `__agent__<agent>__<event>__<ts>` — treated like the existing
  no-sulk sentinels (`__cal__`, `__break__`, `__update__`): **no sulk timer, no
  `ack_reminder`**, dismissed on click.
- `reminder-due` payload gains optional fields: `agent` (`"claude"|"codex"`) and
  `kind` (`"finished"|"needs-action"`). The bubble renders the matching vendor
  logo (`<img>`, asset in `src/`) beside the text.
- On show (not on a timer):
  - `finished` → happy face.
  - `needs-action` → angry + light `#flames` + play chime (respects mute pref).
- Labels: e.g. `✅ Claude finished` / `⚡ Codex needs you`.
- The click handler dismisses `__agent__…` ids without calling `ack_reminder`
  (same branch shape as the `__cal__` case).

## C. Rust side

- `notify` subcommand as described in A.
- Inbox scan on a **dedicated 2s tick** (snappier than folding into the 10s
  reminder tick — a 10s lag on "finished" feels laggy). Plain tokio interval like
  the existing loops.
- Delete files after emitting; ignore/delete malformed ones.
- The inbox dir lives under the existing `cozy-reminder` config dir (created on
  startup if missing).

## D. One-click hook install (settings Agents tab)

- New **Agents** tab in `settings.html`/`settings.js` with, per agent:
  *Install hooks* / *Uninstall hooks* buttons and a detected install-state line.
- New Tauri commands (Rust) to read/merge/write the agents' config files:
  - **Claude Code:** merge `Stop` and `Notification` hook entries into
    `~/.claude/settings.json`. Parse JSON → merge (preserve existing hooks) →
    write. Each entry runs `poltergeist.exe notify --agent claude --event …`.
  - **Codex:** merge a `notify` entry into Codex `config.toml`. Codex uses a
    single `notify` program for all events; it passes an event-type JSON, so the
    wrapper/subcommand maps `agent-turn-complete` → finished and approval/input
    requests → needs-action. (Exact Codex mapping verified at implementation —
    see Risks.)
- Install state detected by scanning those config files for the Poltergeist entry.
- Merge is non-destructive: read → merge → write; never drop unrelated keys.
- If a new window/command requires it, add the needed entry to
  `capabilities/default.json` (Tauri v2 scopes permissions per window).

## E. Testing & docs

- **Rust unit tests:**
  - inbox file JSON → bubble payload mapping (incl. malformed → ignored).
  - config-merge functions: merging the Poltergeist entry into a sample
    `settings.json` / `config.toml` preserves unrelated keys and is idempotent.
- **Frontend:** inline `console.assert` for the id/label builder (project style).
- **Docs:** update `CLAUDE.md` (new `notify` subcommand, inbox dir + 2s tick,
  Agents tab, any capabilities entry) and `README.md` (the feature + setup).

## Risks / to verify at implementation time

- **External interfaces:** exact Claude Code hook schema (`Stop`, `Notification`)
  and especially Codex's `notify` invocation/payload are external and must be
  verified against current docs — not trusted from memory (highest wasted-work
  risk if wrong).
- **Touching external files:** editing `~/.claude/settings.json` and Codex
  `config.toml` is the only part outside this repo. Keep the merge careful and
  non-destructive.

## Out of scope (YAGNI)

- Other agents/tools beyond Claude Code + Codex.
- Persisting agent-notification history.
- Per-project or per-session filtering of which turns notify.
