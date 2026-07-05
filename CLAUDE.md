# CLAUDE.md — Poltergeist

Cozy desktop reminder app: a draggable, always-on-top pixel **ghost** that
nudges you to hydrate / fix posture / stretch, **without ever stealing focus**
from your active app. Tauri 2 (Rust + OS webview), plain static HTML/CSS/JS
frontend.

> Product name is **Poltergeist**; the Rust crate/binary is `poltergeist`
> (`poltergeist.exe`). The config/data dir is still `cozy-reminder` on purpose.

All architecture, commands, layout, and hard-won gotchas:
@docs/ARCHITECTURE.md

## Conventions

- **Gotchas are the lessons file.** After any correction from the user or any
  "why didn't that work" discovery, append the rule (with the symptom it
  presents as) to the **Hard-won gotchas** section of `docs/ARCHITECTURE.md`.
  Don't create a parallel lessons/todo file.
- **Specs and plans** go in `docs/superpowers/specs/` and
  `docs/superpowers/plans/` as dated files (see the existing ones).
- **Docs stay true:** a change that contradicts `docs/ARCHITECTURE.md` or the
  README updates it in the same commit.
- Ponytail mode governs style: laziest solution that works, stdlib/native
  before deps, shortest diff, `// ponytail:` comments on deliberate shortcuts,
  one runnable check for non-trivial logic.
