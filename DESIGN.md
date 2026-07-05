---
name: Poltergeist
description: Cozy spectral pixel-ghost desktop companion — chunky borders, one mono voice, purple candlelight on near-black.
colors:
  void-black: "#0e0a14"
  haunt-panel: "#1b1230"
  haunt-row: "#221636"
  haunt-row-hover: "#241640"
  seance-purple: "#9d7bd8"
  wisp-lavender: "#c4a6f5"
  deep-coven: "#3d2459"
  ectoplasm-white: "#ece4fa"
  ectoplasm-shade: "#c9b8ec"
  moon-ink: "#ddd0f5"
  faded-sigil: "#9a86bd"
  candle-amber: "#e3b23c"
  warning-rose: "#cc7777"
  warning-rose-bright: "#ee8899"
  tear-blue: "#8fc7f5"
typography:
  display:
    fontFamily: "Cascadia Code, Consolas, SF Mono, Menlo, monospace"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "4px"
  headline:
    fontFamily: "Cascadia Code, Consolas, SF Mono, Menlo, monospace"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "2.5px"
  title:
    fontFamily: "Cascadia Code, Consolas, SF Mono, Menlo, monospace"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "2px"
  body:
    fontFamily: "Cascadia Code, Consolas, SF Mono, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Cascadia Code, Consolas, SF Mono, Menlo, monospace"
    fontSize: "9px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "1.5px"
rounded:
  none: "0px"
spacing:
  sp1: "4px"
  sp2: "8px"
  sp3: "12px"
  sp4: "16px"
  sp5: "24px"
components:
  button-primary:
    backgroundColor: "{colors.wisp-lavender}"
    textColor: "{colors.void-black}"
    rounded: "{rounded.none}"
    padding: "9px 12px"
  button-primary-hover:
    backgroundColor: "{colors.ectoplasm-white}"
  button-add:
    backgroundColor: "{colors.haunt-row}"
    textColor: "{colors.wisp-lavender}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  button-add-hover:
    backgroundColor: "{colors.haunt-row-hover}"
  button-quit:
    backgroundColor: "{colors.haunt-panel}"
    textColor: "{colors.faded-sigil}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  input-field:
    backgroundColor: "{colors.void-black}"
    textColor: "{colors.moon-ink}"
    rounded: "{rounded.none}"
    padding: "6px 7px"
  tab-active:
    backgroundColor: "{colors.haunt-panel}"
    textColor: "{colors.wisp-lavender}"
    rounded: "{rounded.none}"
    padding: "8px 4px"
  bubble:
    backgroundColor: "{colors.haunt-panel}"
    textColor: "{colors.moon-ink}"
    rounded: "{rounded.none}"
    padding: "9px 13px 8px"
---

# Design System: Poltergeist

## 1. Overview

**Creative North Star: "The Ghost's Grimoire"**

Poltergeist is a candle-lit spellbook kept by a friendly ghost. Every window —
the ghost overlay, the settings book, the to-do leaf, the calendar page — is a
page from the same grimoire: near-black violet paper, purple candlelight pooling
in the corners, ledger-ruled entries written in a single monospace hand, and
tiny ✦ star ornaments where a scribe would rest their pen. The interface lives
at the *corner* of the user's attention while they work in another app, so the
resting state is quiet, dim, and warm; intensity (flames, anger, bright fills)
is earned and rare, so it lands when it appears.

This system explicitly rejects the corporate productivity dashboard (boxy,
sterile, soulless), aggressive notification UX (red badges, count-up guilt,
modal interrupts), and the generic flat-SaaS look (rounded cards, soft blue
gradients, the interchangeable AI-startup aesthetic). Its identity is pixel and
spectral: hard edges, zero border-radius, chunky offset shadows, and glows that
breathe instead of shout. Charming, not cutesy; present, not pushy.

**Key Characteristics:**
- Chunky pixel construction: 2–3px solid borders, `border-radius: 0`, hard offset shadows.
- One monospace family carries everything; hierarchy comes from size, weight, tracking, and case.
- Spectral purple on near-black; glow is atmosphere, hard shadow is depth.
- Lowercase voice ("summon reminder", "the ghost's little book of nudges").
- Reduced motion is first-class — every perpetual animation has a static fallback.
- Four palettes (spectral, matcha, sundae, slate), one grammar: themes swap `tokens.css` variables only.

## 2. Colors

A near-black violet room lit by purple candlelight: dark layered surfaces, one
family of purples doing all accent work, and a single amber reserved for focus.

### Primary
- **Séance Purple** (#9d7bd8, `--purple`): the working accent — borders, frame
  strokes, checkbox/range accents, secondary text on hints. The default color of
  "the ghost is paying attention".
- **Wisp Lavender** (#c4a6f5, `--purple-bright`): the bright voice — headings,
  active tab text, primary button fill, glows, today-marker. Used where the
  grimoire lights up.
- **Deep Coven** (#3d2459, `--purple-deep`): the shadow ink — pixel-cast
  shadows, resting borders, scrollbar thumbs. Everything dim but still purple.

### Secondary
- **Candle Amber** (#e3b23c, `--amber-rgb`): focus mode only. When the ghost
  writes (Pomodoro focus), its aura and glow recolor amber. Never used for
  general accenting — its rarity is what makes focus read as a different state.

### Tertiary
- **Warning Rose** (#cc7777, `--danger`) and **Warning Rose Bright** (#ee8899,
  `--danger-bright`): destructive hover states only (delete, close). No red
  badges, no persistent error chrome — danger appears under the cursor, then leaves.
- **Tear Blue** (#8fc7f5, `--tear`): a single sprite cell — the ghost's tear
  when sulking. Constant across all three themes.

### Neutral
- **Void Black** (#0e0a14, `--void`): the deepest layer — window body, input
  wells, resting button fills.
- **Haunt Panel** (#1b1230, `--panel`): the page — tab panels, speech bubbles,
  quit button.
- **Haunt Row** (#221636, `--row`) / **Haunt Row Hover** (#241640,
  `--row-hover`): the second neutral layer — list rows, add-button fill,
  calendar day cells.
- **Moon Ink** (#ddd0f5, `--text`): body text everywhere.
- **Faded Sigil** (#9a86bd, `--muted`): secondary text, placeholders, inactive
  tabs. Hand-lifted to clear WCAG AA (4.5:1) on Haunt Row, not just Void Black.
- **Ectoplasm White** (#ece4fa, `--ghost`) / **Ectoplasm Shade** (#c9b8ec,
  `--ghost-shade`): the ghost sprite's body and its shaded edge; also the
  primary button's hover fill.

### Named Rules
**The One Book Rule.** Every color in every window comes from a `tokens.css`
custom property. All four windows `<link>` that file; a color that is not a
token does not exist. Themes (matcha, sundae, slate) override palette variables only —
never layout, never `--amber-rgb`, never `--mono`.

**The Earned Flame Rule.** Intensity is rationed. Amber appears only in focus
mode; Warning Rose only under a destructive cursor; flames only in poltergeist
anger. The resting screen is purple-on-black, calm, dim. If everything glows,
nothing haunts.

## 3. Typography

**Display Font:** Cascadia Code (with Consolas, SF Mono, Menlo, monospace)
**Body Font:** the same — one family everywhere
**Label/Mono Font:** the same

**Character:** a scribe's ledger hand. The single monospace does display duty
through weight and tracking, not through a second family: big tracked-uppercase
title plates with pixel drop-shadows at the top, quiet lowercase section words
between dotted rules, tiny tracked-uppercase whispers for hints.

### Hierarchy
- **Display** (700, 26px, tracking 4px, UPPERCASE): the book plate — "✦ POLTERGEIST ✦"
  in the settings titlebar, with a 3px pixel drop-shadow in Deep Coven plus a glow.
- **Headline** (700, 16px, tracking 2.5px, UPPERCASE): floating-window titles
  (to-do, calendar), same pixel-shadow treatment at 2px.
- **Title** (700, 14px, tracking 2px, lowercase): the "grim" section heads — a
  lowercase word anchored by a short solid rule on the left, a dotted rule
  running right.
- **Body** (400, 12px, line-height 1.4): list rows, bubble text, inputs. The
  windows are small; density is deliberate.
- **Label** (400–700, 9–11px, tracking 1–1.5px, UPPERCASE for hints): micro
  copy — "click a task to finish it", bubble hints, day-of-week headers, units.

### Named Rules
**The One Font Rule.** Everything is the mono stack. Hierarchy is size, weight,
tracking, and case — never a second family, never an italic flourish.

**The Lowercase Voice Rule.** UI copy speaks lowercase and softly ("summon
reminder", "nudge before", "cry after"). Uppercase exists only as *tracked
structure* — title plates and micro-labels — never as shouting.

## 4. Elevation

Depth in the grimoire is **pixel-cast**: a hard offset shadow with zero blur
(`3px 3px 0` or `4px 4px 0` in Deep Coven), as if each panel were a printed
tile lifted off the page. Glow is a separate system — soft purple light
(`0 0 14–16px` at low alpha) that says *spectral presence*, never *height*.
The two are layered on the same element but never trade roles: shadows place,
glows breathe. Interior depth uses an inset wash (`inset 3px 3px 14px` black)
to make the page feel candle-lit rather than raised.

### Shadow Vocabulary
- **Pixel-cast small** (`box-shadow: 3px 3px 0 0 var(--purple-deep)`): resting
  buttons (add, quit).
- **Pixel-cast large** (`box-shadow: 4px 4px 0 0 var(--purple-deep), 0 0 14px rgb(var(--purple-rgb) / 0.35)`):
  panels, speech bubbles, the primary button — cast plus glow.
- **Page inset** (`inset 0 0 0 1px rgb(var(--purple-rgb) / 0.08), inset 3px 3px 14px rgba(0,0,0,0.4)`):
  the settings page interior.
- **Text plate** (`text-shadow: 3px 3px 0 var(--purple-deep), 0 0 16px rgb(var(--purple-rgb) / 0.55)`):
  display headings only.

### Named Rules
**The Pixel-Cast Rule.** Depth is a hard offset shadow, always in Deep Coven,
always blur-zero. A soft blurred drop-shadow under a panel is a foreign object
in this system.

**The Cheap Glow Rule.** Never animate `box-shadow`, `filter`, or `text-shadow`
values — the GPU is disabled and every frame repaints. Breathing effects animate
the *opacity of a dedicated glow layer* (a `::before` with a static shadow or
radial gradient). If a glow needs to pulse, it needs its own layer.

## 5. Components

Chunky and tactile: handmade pixel objects you can push. Thick borders, hard
shadows, and buttons that physically depress. Every interactive element has
default, hover, and `:focus-visible` states; icon targets clear 24×24px.

### Buttons
- **Shape:** square-cut (0px radius), 2px solid border, mono lowercase text.
- **Primary ("save"):** Wisp Lavender fill, Void Black text, 700 weight,
  tracking 1px, `4px 4px 0` cast plus glow — the loudest control on the page.
  Hover fills Ectoplasm White.
- **Add ("summon reminder"):** Haunt Row fill, Wisp Lavender text, `3px 3px 0`
  cast. Hover lifts to Haunt Row Hover.
- **Quit:** Haunt Panel fill, Faded Sigil text, black cast — deliberately the
  quietest.
- **Press:** `:active` translates the button by its own shadow offset
  (`translate(3px, 3px)`) and collapses the shadow to zero — the button
  physically pushes into the page.
- **Icon buttons (✕ close, ‹› nav, 🔥 toggle, delete):** 2px Deep Coven border,
  Void fill, Séance Purple glyph; destructive ones hover to Warning Rose.
  Minimum 24×24px.

### Tabs
- **Style:** ledger tabs — 2px Deep Coven border with no bottom edge, Void
  fill, lowercase Faded Sigil text.
- **Active:** full commitment — 700 weight, Wisp Lavender text, Haunt Panel
  fill, a 3px bright indicator bar on top, and an upward glow.
- **Hover:** text brightens, fill lifts to Haunt Row.

### Cards / Containers
- **Corner Style:** none — hard 0px corners everywhere.
- **Background:** Void Black body with faint radial candlelight pools in
  opposite corners; Haunt Panel for the framed page.
- **Shadow Strategy:** pixel-cast large (see Elevation); page interiors use the
  inset wash.
- **Border:** 3px Séance Purple for window frames and the page; 2px Deep Coven
  for controls.
- **Ornament:** ✦ corner stars on the settings page and centered above the
  action row — the grimoire's punctuation.

### List Entries (ledger lines)
- **Style:** no boxes — rows separated by 1px rules at 16% Séance Purple,
  transparent background, generous row padding.
- **Hover:** a 6%-alpha purple wash; to-do items flip their ☐ glyph to ☑ and
  brighten.
- **Empty states:** teach the next action in the ghost's lowercase voice
  ("no tasks yet — summon one from the settings book"), never a blank page.

### Inputs / Fields
- **Style:** 2px Deep Coven border, Void well, Moon Ink text, 0px radius;
  `color-scheme: dark` on native pickers. Inline text edits use a
  bottom-border-only treatment so they read as ink on the ledger line.
- **Focus:** border recolors to Séance Purple (no outline on text fields);
  buttons and tabs get a 2px Wisp Lavender `outline` with 2px offset.
- **Placeholders:** Faded Sigil — pinned to the AA-clearing token, never the
  translucent default.

### Scrollbar
- **Style:** 10px chunky pixel block — Deep Coven thumb inset with a 2px
  panel-colored border, transparent track, Séance Purple on hover. Native
  scrollbars are the one affordance this system *does* restyle, because the
  default chrome bar would break the grimoire frame.

### Speech Bubble (signature)
The ghost's voice. Haunt Panel fill, 3px Séance Purple border, 0px radius,
pixel-cast large shadow, and a **stair-stepped pixel tail** built from an
on-grid clip-path (no diagonals — diagonals are off-grammar). Enters with an
ease-out-expo rise (opacity + 6px translate), hovers brighter, and carries a
tiny tracked-uppercase hint line ("click to dismiss"). A pulsing glow layer
(`::before`, opacity-only) makes it flicker like candlelight while shown.

## 6. Do's and Don'ts

### Do:
- **Do** take every color from `tokens.css` variables — all four windows share
  the file, and themes override it wholesale (The One Book Rule).
- **Do** keep `border-radius: 0` on all UI chrome. The only circles are the
  calendar's 5px event dot and the flame tongues.
- **Do** use hard offset shadows in Deep Coven for depth, and opacity-animated
  glow layers for breathing (The Pixel-Cast + Cheap Glow Rules).
- **Do** write UI copy in the lowercase ghost voice; reserve uppercase for
  tracked title plates and micro-labels.
- **Do** ship a full `prefers-reduced-motion` alternative for every animation —
  the ghost is perpetually on screen, so this is first-class, not optional.
- **Do** keep Faded Sigil (and any new muted tone) at ≥4.5:1 on Haunt Row, keep
  icon targets ≥24×24, and give every control a visible `:focus-visible`.
- **Do** animate the pixel sprite by translate only — scale and rotate expose
  seams between grid cells.

### Don't:
- **Don't** look like corporate or clinical productivity tools — Outlook
  reminders, Jira, Asana: "boxy, sterile, soulless." No dashboards, no chrome.
- **Don't** use nagging or aggressive notification UX: no red badges, no
  count-up guilt, no modal interrupts, nothing that steals focus or pressures
  the user. Nudges stay dismissible and never grab the keyboard.
- **Don't** drift toward generic flat SaaS: no rounded cards, no soft blue
  gradients, no interchangeable AI-startup look. The pixel/spectral identity is
  the whole point of not being this.
- **Don't** be saccharine. Cuteness is welcome; sugar is not. The ghost is a
  companion with moods, not a mascot with a marketing smile.
- **Don't** animate `box-shadow`, `filter`, or `text-shadow` values, and don't
  add perpetual animations without a reduced-motion fallback.
- **Don't** use amber outside focus mode or Warning Rose outside destructive
  hovers — intensity spent everywhere is intensity lost (The Earned Flame Rule).
- **Don't** introduce a second font family, blurred elevation shadows, or
  border-radius "just for one component." One off-grammar element reads as a
  foreign object in a 240px window.
