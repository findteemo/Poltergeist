# Product

## Register

product

## Users

People who sit at a computer for long, focused stretches and lose track of their
body and their time:

- **Desk workers and developers** who forget to hydrate, fix their posture, or
  stand up — and want a nudge that doesn't yank them out of flow.
- **The focus / ADHD crowd** who benefit from an externalized, gentle prompt and
  a built-in Pomodoro loop, without a nagging task-master breathing down their neck.
- **Cozy-aesthetic / desktop-pet fans** who personalize their setup and want a
  little companion with charm, not another utility chrome window.

Their context: the app is *always on screen* during real work in another app.
The user is mid-task; Poltergeist lives in the corner of their attention, never
the center. Secondary: surfacing upcoming Google Calendar events as the same kind
of soft nudge.

## Product Purpose

Poltergeist is a draggable, always-on-top pixel **ghost** that nudges you to take
care of yourself — hydrate, fix posture, stretch, focus, take a break — **without
ever stealing focus** from the app you're working in. It also runs a Pomodoro
focus timer and can surface calendar events.

Why it exists: ordinary reminder apps interrupt. They pop modals, steal keyboard
focus, demand acknowledgment. Poltergeist's entire reason to exist is the
opposite — a presence you *notice* but are never *interrupted* by. Success is when
the user keeps it running for weeks because it earns its place: it helps without
ever costing them a dropped keystroke or a broken train of thought.

## Brand Personality

**Cozy, spectral, gentle.** A friendly little haunting. The ghost has moods —
happy, sad, sulking, angry, focused — so it reads as a companion with feelings,
not a notification engine. Voice is soft and lowercase, playful but never
saccharine ("gentle nudges from your little ghost", "+ summon reminder"). It can
be a touch spooky and dramatic (poltergeist mode lights up in purple flames) but
the baseline is calm and warm. Charming, not cutesy; present, not pushy.

## Anti-references

- **Corporate / clinical productivity tools** (Outlook reminders, Jira, Asana):
  boxy, sterile, soulless. Poltergeist is the opposite of a task dashboard.
- **Nagging / aggressive notification UX**: red badges, count-up guilt, modal
  interrupts, anything that steals focus or pressures the user. This violates the
  core promise — nudges stay dismissible and never grab the keyboard.
- **Generic flat SaaS**: rounded cards, soft blue gradients, the interchangeable
  AI-startup look. The pixel/spectral identity is the whole point of *not* being
  this.

(Note: cuteness itself is welcome — the anti-reference is *saccharine* cuteness,
not charm.)

## Design Principles

1. **Never steal focus.** The first rule of every surface and interaction. A
   nudge the user has to dismiss with the keyboard, a window that grabs focus, a
   click that drops a keystroke in their real app — all failures, no matter how
   pretty. Presence over interruption.
2. **A companion, not a console.** It has moods and reactions; it celebrates,
   sulks, and haunts. Personality is a feature, not decoration. Design choices
   should make it feel alive, not administrative.
3. **Calm by default, dramatic on purpose.** The resting state is quiet and warm.
   Intensity (flames, anger, urgency) is earned and rare, so it lands when it
   appears.
4. **Earn the corner.** It's always on screen, so every pixel and every CPU cycle
   is rent. Stay small, stay light, never clutter — the user invited a ghost, not
   a panel.
5. **Cohesive haunting.** One spectral pixel language across every window (ghost,
   settings, to-do, calendar). Consistency is what makes it read as one creature
   rather than four utilities.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**: ≥4.5:1 contrast for body text and labels (including the
tiny monospace ones), proper labels on every control, visible keyboard focus.
**Reduced motion is first-class** — the ghost is perpetually on screen, so
`prefers-reduced-motion` must fully quiet the bob/aura/flicker/flames while
keeping the ghost legible (already implemented across all windows; keep it that
way). Known constraint: the overlay is intentionally non-activating, which limits
keyboard operability of the ghost itself; calendar/to-do/settings windows should
still be fully keyboard-operable.
