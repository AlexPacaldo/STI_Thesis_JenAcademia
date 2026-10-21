# JEN Academia — Design Language

This document is the single source of truth for AI agents and developers building UI for this project. Follow it strictly. Do not introduce new colors, fonts, radii, or animation patterns outside of what is defined here.

**Authoritative source:** every token below is defined in `frontend/src/index.css` (the `:root` block). If this document and `index.css` ever disagree, `index.css` wins — and this document is the bug.

---

## Philosophy

The design language is **calm, premium, and academic** — inspired by Apple's Human Interface Guidelines crossed with a natural green palette. Every interaction should feel intentional, smooth, and lightweight. Think: soft surfaces, generous whitespace, fluid motion, and a forest-green brand identity.

**Core principles:**
- **Clarity** — Content is the UI. Never compete with it.
- **Depth** — Layered surfaces using soft dual shadows (neumorphism), not hard borders.
- **Motion** — Every state change animates. Nothing snaps.
- **Restraint** — One primary action per view. Muted supporting elements.

---

## Color

### Brand ramp

Three values define the brand. Everything else in the palette is an alias or a tint.

```
--brand-lime:    #79a847   — gradient start, primary accent
--brand-green:   #2f7a3d   — gradient mid, hover states
--brand-forest:  #1e3828   — deepest anchor, gradient end, sidebar
```

These were sourced from the homepage contact-panel and footer gradient, which are the reference for the brand look:

```css
background: linear-gradient(135deg, var(--brand-lime) 0%, var(--brand-green) 44%, var(--primary) 100%);
```

### Brand roles

```
--primary:             var(--brand-forest)  #1e3828  — buttons, headings, links, active states
--primary-dark:        #16301f                        — gradient depth, deepest emphasis
--primary-mid:         var(--brand-green)   #2f7a3d   — hover fills
--accent:              var(--brand-lime)    #79a847   — focus rings, progress, highlights
--accent-lime-dark:    #6a8f3c                        — pressed accent
--accent-sage:         #91a79a                        — muted highlight, sidebar active pill
```

`--accent-sage` exists because `--accent` is now lime. Sage is a **muted neutral-green**, not a brand accent — use it only where a saturated green would be loud (e.g. an active pill on the dark sidebar).

### Surfaces

```
--bg:               #f7f9f8   — app background
--bg-alt:           #f1f4f2   — alternate section background
--surface:          #ffffff   — cards, modals, inputs
--surface-raised:   #ffffff   — raised cards
--surface-recessed: #f0f3f1   — inset wells, empty states
--surface-soft:     #f8fbf9   — inner cards, row items
--surface-white:    #ffffff   — alias, footer and gradient-panel text
body background:    linear-gradient(180deg, #fbfdfc 0%, var(--bg) 100%)
```

### Text

```
--text:        #13251f   — body, headings
--text-mid:    #26423b   — mid-emphasis
--muted:       #5e7268   — captions, subtitles, placeholders
--muted-light: #8a9b93   — timestamps, metadata, disabled
Text inverse:  #ffffff   — text on brand-dark fills (buttons, sidebar, footer)
```

### Border

```
--border:        rgba(38, 66, 59, 0.08)   — cards, modals, default hairline
--border-mid:    rgba(38, 66, 59, 0.11)   — inputs
--border-strong: rgba(38, 66, 59, 0.18)   — hover, dashed empty states
```

### Semantic colors

Surfaces, text, and accents are separate tokens. Do not use a surface token as a text color.

```
Success:    --pill-success  #ecfdf3   --text-success  #166534   --accent-success  #1f9d63
Danger:     --pill-danger   #fce8e4   --text-danger   #8a3e2e   --accent-danger   #a83a34
Warning:    --pill-warn     #fff4df   --text-warn     #92400e   --accent-warn     #d18a10
Info:       --pill-info     #eaf2ff   --text-info     #1e4a8a   --accent-info     #3d6b8f
Alert danger:                                                                   --alert-danger   #e8453c
```

### Calendar status palette

Grid cells and legend dots **must** read from the same status, or the legend stops describing the grid. Each status has a pale tint for the cell and a saturated version of the same hue for its dot.

```
Status               Cell token                 Value     Dot token                 Value
Available            --cal-available-cell      #e9f3dd   --cal-available-dot       #79a847
Classes Scheduled    --cal-scheduled-cell      #dce8e1   --cal-scheduled-dot       #4f7161
Teacher Unavailable  --cal-unavailable-cell    #fbe7e4   --cal-unavailable-dot     #c0554b
Schedule Not Set     --cal-unscheduled-cell   #fdeeda   --cal-unscheduled-dot     #d18a10
Past Date            --cal-past-cell           #edf0ef   --cal-past-dot            #a3ada8
```

The cell must be a pale tint of the dot's hue. A saturated dot over a translucent cell is not an acceptable pairing — the legend has to explain the grid at a glance.

Never point a calendar cell or dot at a generic alert token (`--pill-warn`, `--pill-danger`). Those are near-white page-level alert surfaces and are invisible at dot size.

### Rules
- Never use pure black (`#000`) as text. Pure white (`#fff`) is allowed **only** as text on brand-dark fills — primary buttons, sidebar, footer, gradient panels.
- Never introduce grays from outside this palette (no `#e5e7eb`, `#4b5563`, `#374151`, etc.). This includes Tailwind's default grays, which are not in use in this project.
- Always use the `--border*` tokens for borders — not `#ccc`, not `#ddd`.
- Add new colors as tokens in `index.css` first, then document them here.

---

## Corner Radius

Use the scale, or `--radius-pill` for pills, tags, and avatars.

```
--radius-xs:   8px    — small buttons, table cells, legend chips
--radius-sm:   12px   — row items, icon chips, inputs
--radius-md:   18px   — standard cards, state cards
--radius-lg:   24px   — page-level cards, modals
--radius-xl:   32px   — content-inner shell, sidebar surfaces
--radius-2xl:  40px   — large homepage visuals
--radius-pill: 999px  — pills, badges, avatars, tags
--control-radius: 18px — all inputs, buttons, and selects
```

### Corner shape

**Do not use `corner-shape`.** The superellipse corner (`corner-shape: squircle` / `superellipse()`) was tried and reverted. At UI radii (18–32px) a superellipse hugs the vertex more tightly than a circular arc, so corners read as angular chamfers rather than smooth arcs. It is legible only at icon-scale proportions (~22% radius-to-width). Plain `border-radius` is correct at every size this project uses.

---

## Typography

### Font

```
Family:  "Poppins", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

Always use Poppins. No other font families. Never override `font-family` in a module.

### Weight Scale

```
500  — body text, mild emphasis
600  — form labels, subtitles, metadata
700  — buttons, nav items, card titles  ← main workhorse
800  — page headings, stat values
900  — hero titles, feature headings
```

### Size Scale

```
xs:    0.75rem   — badges, timestamps, tiny labels
sm:    0.85rem   — secondary buttons, captions, pills
base:  0.95rem   — body text, nav items, form labels
md:    1rem      — standard body, card titles, inputs
lg:    1.2rem    — section subheadings
xl:    1.35rem   — modal headings, panel titles
2xl:   clamp(1.8rem, 2.3vw, 2.5rem)   — page headings
3xl:   clamp(2rem, 2.8vw, 2.75rem)    — hero headings
4xl:   clamp(3.65rem, 5.35vw, 6rem)   — homepage hero title
```

### Letter Spacing

```
Tight:    -0.02em   — large headings
Normal:    0em      — body text
Wide:      0.04em   — brand labels, table headers
Wider:     0.08em   — uppercase eyebrow labels
Widest:    0.12em   — section kickers
```

### Line Height

```
1.0   — hero display titles
1.15  — large headings
1.35  — card headings
1.55  — subtitles, descriptions
1.65  — body paragraphs
1.80  — long-form copy
```

---

## Spacing

Base unit is `4px`. All spacing is a multiple of it.

```
--space-1:  4px    — xs  — icon gap, tight internal padding
--space-2:  8px    — sm  — badge padding, list item gap
--space-3:  12px   — md  — compact card padding, form element gap
--space-4:  16px   — lg  — standard internal padding
--space-5:  20px   — xl  — section gap, card padding
--space-6:  24px   — 2xl — modal padding, content gap
--space-8:  32px   — 4xl — section padding
--space-10: 40px   — 5xl — page bottom padding
--space-12: 48px   — 6xl — large section separation
```

---

## Shadows

Two systems exist. Shadows use a warm dark-green tint (`rgba(18, 34, 30, …)`), never cold gray.

### Neumorphism (soft raised/inset surfaces)

Each token is a light-source-from-top-left pair: a dark shadow down-right, a white highlight up-left.

```
--neu-shadow-sm:     2px 2px 8px  dark / -2px -2px 6px  white  — inputs, small controls
--neu-shadow-md:     4px 4px 14px dark / -3px -3px 10px white  — cards
--neu-shadow-lg:     8px 8px 24px dark / -5px -5px 16px white  — panels, drawers
--neu-shadow-xl:     12px 12px 32px dark / -6px -6px 20px white — content-inner shell

--neu-inset:         inset 2px 2px 6px dark / -2px -2px 5px white      — pressed
--neu-inset-strong:  inset 3px 3px 9px dark / -2px -2px 7px white      — pressed, prominent
```

### Flat card shadow (white surfaces over tinted backgrounds)

```
--shadow-sm:  0 2px 8px  rgba(18, 34, 30, 0.05)
--shadow-md:  0 4px 16px rgba(18, 34, 30, 0.07)
--shadow-lg:  0 8px 28px rgba(18, 34, 30, 0.09)
--shadow-xl:  0 16px 44px rgba(18, 34, 30, 0.11)
```

### Rules
- Cards gain `--neu-shadow-lg` on hover, from `--neu-shadow-sm` at rest.
- Modals always use `--shadow-xl`.
- There is no `--shadow-btn` and no `--shadow-xs`. Button lift is `translateY(-1px)` plus an existing token.
- Never use `box-shadow: none` to remove depth — reduce opacity or switch tokens instead.

---

## Motion

Every state transition animates. Motion communicates meaning.

### Tokens

```
--duration-fast:  140ms    — hover, focus, icon and micro-interaction changes
--duration-base:  220ms    — modals, panels, page transitions
--duration-slow:  360ms    — large overlays, page-level reveals

--ease-out:     cubic-bezier(0.22, 1, 0.36, 1)     — enters
--ease-in-out:  cubic-bezier(0.45, 0, 0.55, 1)    — moves both ways
```

Always use `--duration-*` with `--ease-out` or `--ease-in-out`. Never use `linear`, and never write a raw millisecond value in a module.

### Hover lift

| Element | Transform |
|---|---|
| Cards | `translateY(-2px)` |
| Buttons | `translateY(-1px)` |
| Nav items | `translateY(-1px)` |
| Footer / social icons | `translateY(-3px)` |

Button press is `scale(0.97)`.

### Keyframes

```css
@keyframes enterUp   { from { opacity: 0; transform: translateY(12px) scale(0.98); }
                       to   { opacity: 1; transform: translateY(0)    scale(1);    } }
@keyframes exitDown  { to { opacity: 0; transform: translateY(12px) scale(0.98); } }
@keyframes enterRight{ from { opacity: 0; transform: translateX(24px); }
                       to   { opacity: 1; transform: translateX(0);    } }
@keyframes exitRight { to { opacity: 0; transform: translateX(24px); } }
@keyframes fadeIn    { from { opacity: 0; } to { opacity: 1; } }
@keyframes pulse     { 0%, 100% { opacity: 0.45; transform: scale(0.97); }
                       50%      { opacity: 1;    transform: scale(1);    } }
```

### Animation Application Rules

| Element | Animation | Timing |
|---|---|---|
| Modal open | `enterUp` | `--duration-base` |
| Modal close | `exitDown` | `--duration-fast` |
| Toast / notification | `enterRight` | `--duration-base` |
| Toast dismiss | `exitRight` | `--duration-fast` |
| Overlay / backdrop | `fadeIn` | `--duration-fast` |
| Drawer open | `translateX(100%) → 0` | `--duration-base` |
| Skeleton loading | `pulse` | `1.4s ease infinite` |
| Route change | `enterUp` | `--duration-base` |

Routes are keyed by `pathname` in `App.jsx` so the page transition replays on navigation.

### Reduced Motion

Always include this:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Components

### Button

**Primary**
```css
background: var(--primary);          /* #1e3828 */
color: #ffffff;
border: none;
border-radius: var(--control-radius); /* 18px */
padding: 10px 18px;
font-size: 0.95rem;
font-weight: 700;
transition: background var(--duration-fast) var(--ease-out),
            transform var(--duration-fast) var(--ease-out);

:hover  → background: var(--primary-mid); transform: translateY(-1px);
:active → transform: scale(0.97);
:focus-visible → outline: 2px solid var(--primary); outline-offset: 2px;
:disabled → opacity: 0.55; cursor: not-allowed;
```

**Secondary**
```css
background: var(--surface-soft);
color: var(--primary);
border: 1px solid var(--border-mid);
border-radius: var(--control-radius);
padding: 10px 18px;
font-weight: 700;

:hover → background: var(--bg-alt);
```

**Danger**
```css
background: var(--pill-danger);
color: var(--text-danger);
border: 1px solid rgba(168, 58, 52, 0.14);
border-radius: var(--radius-sm);
padding: 8px 14px;
font-weight: 700;
```

**Pill (tabs, filters)**
```css
border-radius: var(--radius-pill);
padding: 6px 14px;
background: transparent;
color: var(--muted);
font-size: 0.85rem;
font-weight: 600;
border: 1px solid transparent;

.active → background: var(--primary); color: #ffffff; border-color: var(--primary);
```

### Input / Textarea / Select

```css
width: 100%;
border: 1px solid var(--border-mid);
border-radius: var(--control-radius); /* 18px */
padding: 12px 16px;
background: var(--surface);
color: var(--text);
font-family: inherit;   /* never override */
font-size: 1rem;
outline: none;
transition: border-color var(--duration-fast) var(--ease-out),
            box-shadow var(--duration-fast) var(--ease-out);

:focus       → border-color: var(--accent); box-shadow: 0 0 0 4px rgba(121, 168, 71, 0.18);
::placeholder → color: var(--muted-light);
```

Password inputs always include a peek toggle positioned absolutely inside the input wrapper.

### Card (3 tiers)

**Primary card** — page-level content containers
```css
background: var(--surface);
border: 1px solid var(--border);
border-radius: var(--radius-lg);
padding: var(--space-6);
box-shadow: var(--neu-shadow-lg);
transition: box-shadow var(--duration-fast) var(--ease-out),
            transform var(--duration-fast) var(--ease-out);

:hover → transform: translateY(-2px);
```

**Secondary card** — inner content, list items
```css
background: var(--surface-soft);
border: 1px solid var(--border);
border-radius: var(--radius-md);
padding: 14px 18px;

:hover → transform: translateY(-2px); border-color: var(--border-strong);
```

**Ghost card** — empty states, dashed outlines
```css
border: 1px dashed var(--border-strong);
border-radius: var(--radius-sm);
background: var(--surface-soft);
```

### Badge / Pill

**Default**
```css
display: inline-flex;
align-items: center;
padding: 3px 10px;
border-radius: var(--radius-pill);
background: rgba(145, 167, 154, 0.18);
color: var(--primary);
font-size: 0.8rem;
font-weight: 700;
```

**Eyebrow label** (section kicker)
```css
padding: 6px 12px;
border-radius: var(--radius-pill);
background: rgba(145, 167, 154, 0.16);
color: var(--primary);
font-size: 0.74rem;
font-weight: 700;
letter-spacing: 0.08em;
text-transform: uppercase;
```

**Status pill (filled)**
```css
background: var(--primary);
color: #ffffff;
border-radius: var(--radius-pill);
padding: 4px 12px;
font-size: 0.82rem;
font-weight: 800;
```

### Modal

All confirmations use a custom dialog. **`window.confirm` is not permitted** in this codebase.

```css
/* Overlay */
position: fixed; inset: 0; z-index: 1000;
display: flex; align-items: center; justify-content: center; padding: 20px;
background: rgba(19, 37, 31, 0.52);
animation: fadeIn var(--duration-fast) var(--ease-out);

/* Content */
width: min(520px, 100%);
border-radius: var(--radius-lg);
background: var(--surface);
padding: 26px;
box-shadow: var(--shadow-xl);
border: 1px solid var(--border);
max-height: calc(100vh - 40px);
overflow-y: auto;
animation: enterUp var(--duration-base) var(--ease-out);
```

Every dialog needs a cancel path and a visible confirm button. Destructive actions use the Danger button variant.

### Form Label

```css
display: block;
font-size: 0.92rem;
font-weight: 600;
color: var(--text-mid);
margin-bottom: var(--space-2);
```

### Sidebar

```css
width: var(--sidebar-width);        /* 232px */
background: linear-gradient(180deg, var(--brand-forest) 0%, var(--primary-dark) 100%);
box-shadow: 0 20px 56px rgba(18, 34, 30, 0.16);
```

Nav item radius is `20px`. The active item is a **solid `--accent-sage`** fill with white text and a `1px` white inner ring — not a translucent lime wash, which reads muddy against the dark forest. The active icon chip is `rgba(255, 255, 255, 0.22)`.

Below `900px` the sidebar becomes an off-canvas drawer with a backdrop and close button.

### Header

Sticky, `--header-height` (72px). The account chip is **transparent** — no background, no border, no neumorphic shadow. It gains a faint `rgba(38, 66, 59, 0.06)` tint on hover. The avatar is `border-radius: 50%` at both desktop (`38px`) and the responsive override (`36px`).

---

## Kid Mode — the student's whole calendar

**Where it lives:** `frontend/src/components/StudentBookingWizard.jsx` + `frontend/src/assets/studentKid.module.css`.

**Who it is for:** a lot of the students on this app are children, and a lot of them are not confident readers of English. Kid Mode is the screen that has to work for a five-year-old *and* for an adult booking a class at 11pm, so it breaks the rules above on purpose.

**One stylesheet for the whole experience.** The home page, the class cards, the windows that open from them, the ask cards and the booking wizard all read from `studentKid.module.css`. A student should not be able to tell where one screen ends and the next begins.

**Where the words live:** `frontend/src/utils/studentCopy.js` (the `HOME`, `BOOKING`, `CLASS_INFO` and `CONFIRM` groups) and `frontend/src/utils/classTime.js` (how a time is named). A word a student reads is never written inline in a component.

---

### 1. The promise

> **One question per screen. One word per button. Always a way out.**

Everything else in this section follows from those three sentences.

---

### 2. The rules

| Rule | Why |
|---|---|
| **One question per screen.** Never a day strip AND a time grid AND a list of picks on one screen. | A wall of choices is a screen for an adult reading carefully. A child picks nothing. |
| **Every tappable thing is at least 60px tall.** | A child's finger is not a mouse pointer. A button that is 32px tall is a button they miss. |
| **Type is big.** | Reading small print is work, and it is the work that stops a child. |
| **Every button says what it does, in one short line.** | "Book it", not "Confirm". |
| **The step is on the screen.** | A child needs to know the screen is not the end of it. |
| **A way out is always on the screen.** | A child who has gone down the wrong path must be able to leave without understanding what "back" means. |
| **Colour carries meaning, and every coloured thing also has a word.** | Green alone is invisible to a child who cannot read the badge yet. |
| **The words are the message.** Emoji are decoration. | They are `aria-hidden`, and they never carry meaning on their own. |
| **Never say a thing is unavailable when the answer has not arrived.** | "No free times" while the page is still asking is a lie, and it reads as the student's fault. |

---

### 3. The anatomy of a screen

```
WIZARD CARD                    grid, gap 16, padding 20, radius 24, --surface, --neu-shadow-lg
├── HEADER                     title (h2) + Cancel, always
├── PROGRESS                   numbered dots + "Step 2 of 3"   (not on the first screen)
├── QUESTION                   one h3 + one line of help
├── BODY                       the one thing being asked
├── NOTE                       only when there is one (blue, quiet)
├── ERROR                      only when there is one (red, loud)
└── FOOTER                     ← Back  ·  Next (or Book it)
```

Rules that hold for every screen:

- The header is always there. The **Cancel** button is always there.
- The progress dots are on every screen *except* the first — there is nothing to be "step 1 of" yet.
- The footer is on every screen *except* the first.
- The question is always an `h3`, one line, and a full stop. Never two questions.
- The help line under the question is optional, one line, and never repeats the question.

---

### 4. The stepper

```css
.steps      { display: flex; align-items: center; gap: 8px; }
.stepDot    { width: 34px; height: 34px; border-radius: 50%;
              background: var(--surface-recessed);
              border: 2px solid var(--border-strong);
              color: var(--muted); font-size: 0.9rem; font-weight: 800; }
.stepDotDone { background: var(--brand-lime); border-color: var(--brand-lime); color: var(--primary); }
.stepDotNow  { background: var(--brand-green); border-color: var(--brand-green); color: #fff; }
.stepLine    { flex: 1 1 auto; min-width: 12px; height: 4px;
               border-radius: var(--radius-pill); background: var(--surface-recessed); }
.stepLineDone { background: var(--brand-lime); }
.stepCount   { font-size: 0.9rem; font-weight: 700; color: var(--muted); }
```

- A finished dot is a **tick**, not a number. A number the student has already passed is noise.
- The current dot is the only one that is `--brand-green`.
- The line between two dots is green when the step on the left is done.
- The word under the dots is `Step {n} of {total}` — it comes from `BOOKING.stepOf`.

---

### 5. The components

Every one of these is a **button**. There are no links and no checkboxes in the body of a Kid Mode screen: a child presses things.

#### 5.1 Choice card — "how do you want to book?"

```css
.optionGrid  { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.choiceCard  { min-height: 168px; padding: 20px; border-radius: var(--radius-lg);
               border: 2px solid var(--border-mid); background: var(--surface-soft);
               display: grid; gap: 8px; align-content: start; justify-items: start; }
.choiceCardActive { border-color: var(--brand-green); background: #e9f3dd; }
.choiceIcon  { width: 62px; height: 62px; border-radius: var(--radius-md);
               background: var(--surface); border: 1px solid var(--border); font-size: 2rem; }
.choiceTitle { font-size: 1.25rem; font-weight: 800; color: var(--primary); }
.choiceText  { font-size: 1rem; font-weight: 500; color: var(--muted); }
```

A picture, a **word**, and a sentence saying what it does. The word is the button; the sentence is the help.

#### 5.2 Day card

```css
.dayGrid   { grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
.dayCard   { min-height: 124px; padding: 12px 8px; border-radius: var(--radius-md);
             border: 2px solid var(--border-mid); background: var(--surface);
             display: grid; gap: 2px; align-content: center; justify-items: center; }
.dayCardActive { border-color: var(--brand-green); background: var(--brand-green); color: #fff; }
.dayCardOff    { cursor: not-allowed; opacity: 0.6; background: var(--surface-recessed); }
.dayName   { font-size: 0.9rem;  font-weight: 700; color: var(--muted); }
.dayNumber { font-size: 2.1rem;  font-weight: 800; line-height: 1.1; }
.dayMonth  { font-size: 0.8rem;  font-weight: 600; color: var(--muted-light); }
```

Top to bottom: **the name of the day** ("Today", "Tomorrow", "Wed"), **the number**, **the month**, **a badge**. The name comes first because a number on a square is not a day until you have worked out which square it is.

**The badge is the important part.** A day the teacher does not work must not look the same as a day they do:

| Badge | Class | Means |
|---|---|---|
| **Free** | `.dayBadgeFree` | the teacher works that day — press it |
| **Busy** | `.dayBadgeBusy` | the teacher has marked that day unavailable — **not pressable** |
| **No times** | `.dayBadgeNone` | the teacher has no plan for that day — **not pressable** |

A day that is not pressable is `disabled`. A child must not be able to press a day and be told "no free times on this day" — that reads as their fault and is not.

**Do not dim a day to say "we do not know yet".** If the answer has not arrived, the whole grid is a skeleton (`.loading`), not a greyed-out day.

#### 5.3 Time card

```css
.timeGrid   { grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 12px; }
.timeCard   { min-height: 96px; padding: 12px; border-radius: var(--radius-md);
              border: 2px solid var(--border-mid); background: var(--surface);
              display: grid; gap: 4px; place-content: center; justify-items: center; }
.timeCardActive { border-color: var(--brand-green); background: #e9f3dd; }
.timeCardOff    { cursor: not-allowed; opacity: 0.55; background: var(--surface-recessed); }
.timeText   { font-size: 1.35rem; font-weight: 800; }
.timeOfDay  { font-size: 0.85rem; font-weight: 600; color: var(--muted); }
.timeTaken  { font-size: 0.72rem; font-weight: 800; color: var(--text-danger); }
```

The **time is the button**, in the biggest type on the screen. Under it goes the **name** of that time — "Morning", "Afternoon", "Evening" — because a child who cannot read a clock still needs to know what he is picking. A time the teacher has already taken says **Taken** instead, and is not pressable.

#### 5.4 Part-of-day card — "what time?"

```css
.partGrid    { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.partCard    { min-height: 108px; padding: 12px; border-radius: var(--radius-md);
               border: 2px solid var(--border-mid); background: var(--surface);
               display: grid; place-content: center; justify-items: center; }
.partCardActive { border-color: var(--brand-green); background: #e9f3dd; }
.partName    { font-size: 1.35rem; font-weight: 800; }
```

**The card says one word.** `Morning`. `Afternoon`. `Evening`. No clock time under it.

This is the whole point of the screen: a child cannot read a clock face yet, and he certainly cannot compare 08:00 against 13:25 and work out which is "morning". A part of the day is one word and it cannot be got wrong.

Choosing a part of the day means **every free time in that part**, not one time near it. See §8.

#### 5.5 Weekday card

```css
.weekdayGrid  { grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
.weekdayCard  { min-height: 92px; padding: 8px; border-radius: var(--radius-md);
                border: 2px solid var(--border-mid); background: var(--surface);
                display: grid; gap: 2px; place-content: center; justify-items: center; }
.weekdayCardActive { border-color: var(--brand-green); background: var(--brand-green); color: #fff; }
.weekdayName  { font-size: 1.05rem; font-weight: 800; }
.weekdayTick  { font-size: 0.75rem; font-weight: 700; color: var(--muted); }
```

All seven days in **one row**, Monday first — that is the order a school week runs in, and it is the order a child counts days in.

The tick is a **✓**, not a filled circle. A chosen day is green and says so.

#### 5.6 Found-time card

```css
.foundList { display: grid; gap: 8px; max-height: 340px; overflow-y: auto; padding-right: 4px; }
.foundCard { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 12px;
             padding: 12px 16px; border-radius: var(--radius-md);
             border: 2px solid var(--border-mid); background: var(--surface); }
.foundCardActive { border-color: var(--brand-green); background: #e9f3dd; }
.foundDate { font-size: 0.9rem;  font-weight: 700; color: var(--muted); }
.foundTime { font-size: 1.2rem;  font-weight: 800; }
.foundNote { font-size: 0.8rem;  font-weight: 600; color: var(--muted-light); }
.foundBtn  { min-width: 96px; min-height: 52px; padding: 10px 18px;
             border-radius: var(--control-radius); border: 2px solid var(--brand-green);
             background: var(--surface); color: var(--primary-mid);
             font-size: 1rem; font-weight: 800; }
.foundBtnDone { background: #fff; border-color: var(--accent-danger); color: var(--text-danger); }
```

Three lines: **the day**, **the time**, **what that time is** ("Morning"). The button on the right is a **toggle**:

| State | The button says | It looks like |
|---|---|---|
| Not in the picks | **Add** | green outline |
| Already in the picks | **Remove** | white with a red edge |

**The label always says what pressing the button will do.** A button that means "Add" sometimes and "Remove" other times — told apart only by the colour of the card behind it — is a button a child cannot read. The card's green tint says *this one is picked*; the button says what happens next.

The same rule applies on the last screen: every class in the summary has its own **Remove**, so a student who added four times and wants three of them does not have to go back two screens to take one away.

#### 5.7 Summary card — the last screen

```css
.summary      { display: grid; gap: 12px; padding: 20px; border-radius: var(--radius-lg);
                background: var(--surface-soft); border: 2px solid var(--border-mid); }
.summaryRow   { display: grid; grid-template-columns: 44px 1fr; align-items: center; gap: 12px; }
.summaryIcon  { width: 44px; height: 44px; border-radius: var(--radius-sm);
                background: var(--surface); border: 1px solid var(--border); font-size: 1.35rem; }
.summaryLabel { font-size: 0.78rem; font-weight: 800; letter-spacing: 0.06em;
                text-transform: uppercase; color: var(--muted); }
.summaryValue { font-size: 1.15rem; font-weight: 800; }
```

A row per fact: the day, the time, the teacher, the class. The label is small and quiet; **the value is what the student is checking**.

#### 5.8 Buttons

```css
.btn         { min-height: 60px; padding: 14px 22px; border-radius: var(--control-radius);
               font-size: 1.1rem; font-weight: 800; }
.btnGhost    { flex: 1 1 160px; border: 2px solid var(--border-mid);
               background: var(--surface); color: var(--primary); }
.btnPrimary  { flex: 2 1 220px; border: none; background: var(--brand-green); color: #fff;
               box-shadow: 0 8px 20px rgba(47, 122, 61, 0.28); }
.btnWide     { flex: 1 1 100%; }
```

- **One primary button per screen**, and it is on the right. The primary button is `--brand-green`, not `--primary` (forest) — it has to be the loudest thing in the room.
- The ghost button is the way back. It is never the way forward.
- `← Back` and `Next`. Never "Previous" and "Continue".
- The last screen's primary button is **Book it**.

#### 5.8b The day card (a strip of days, not a grid)

The same strip the student picks a day from. It is the answer to "which day do you want?" in a form that cannot show a month grid.

```css
.dayStrip { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.dayChip  { min-width: 84px; min-height: 92px; display: grid; place-content: center;
            border-radius: var(--radius-md); border: 2px solid var(--border-mid);
            background: var(--surface); font-weight: 800; }
.dayChipActive  { border-color: var(--brand-green); background: var(--brand-green); color: #fff; }
.dayChipFree    { border-color: var(--brand-lime); background: #e9f3dd; }
.dayChipUnknown { opacity: 0.55; border-style: dashed; }
```

- **It wraps.** A horizontal scroll hides buttons behind an edge a student does not know they can swipe, and on a phone it means the days after the first three are invisible.
- **The name of the day comes first** — Today, Tomorrow, Wed — then the number, then the month.
- **A day the teacher does not work says so** — dashed and dim for "no plan yet", a green tint for "free", and the chosen day is solid green.

#### 5.8c The month picker (the days come from a month)

The days a student picks from are **a month**, with arrows that move between months.

```css
.monthBar { display: flex; align-items: center; justify-content: space-between;
            gap: var(--space-3); margin-bottom: var(--space-3); }
.monthBtn { width: 48px; height: 48px; flex: 0 0 auto;
            border-radius: var(--control-radius); border: 2px solid var(--border-mid);
            background: var(--surface); color: var(--primary);
            font-size: 1.6rem; font-weight: 800; line-height: 1; cursor: pointer; }
.monthBtn:disabled { opacity: 0.35; cursor: not-allowed; }
.monthName { font-size: 1.05rem; font-weight: 800; text-align: center; color: var(--primary); }
```

- **A fortnight of days is not a plan.** The student's plan runs for three months. A strip of fourteen days showed them two weeks of a three-month plan, and a free Saturday in November was a day they could not see and did not know they could have. The picker moves a month at a time.
- **The picker stops at the end of the student's plan.** The last month it reaches is the month the plan ends in, and the last day it shows in that month is the day the plan ends. A day past the plan is a day they cannot book, and offering it greyed out is a dead end.
- **It cannot go back before today.** The first month is this month, and the first day in it is today.
- **The arrows are the size of a day card.** A child should not have to find a smaller button to change month.
- **The arrows are still there when they are off.** A disabled arrow shows the shape of the limit, which is information. A hidden arrow makes the limit a mystery.
- **The month bar is on the screen even when the month has nothing in it.** A student whose teacher's November is empty has to be able to reach December without closing the window.
- **The name of the day still comes first** — Today, Tomorrow, Wed — then the number, then the month.

> **The plan decides what the student may book, and the booking window decides what the teacher may offer.**

```js
// utils/studentSchedule.js
export function bookingWindowEndKey({ contractExpiresAt = null, fallbackEndKey = "" } = {}) {
  const expiry = expiryToDateKey(contractExpiresAt);
  if (!expiry) return fallbackEndKey || "";
  if (!fallbackEndKey) return expiry;
  return expiry < fallbackEndKey ? expiry : fallbackEndKey;
}
```

- **A plan that ends before the window ends the window.** A student whose plan runs out on the 19th cannot book a class on the 20th, however free the teacher is.
- **A plan that ends later does not stretch the window.** A teacher only sets availability three months ahead, so there is nothing to book past that, and offering a day with no classes on it is offering a dead end.
- **No plan means no deadline**, so the window stands on its own.
- **The plan's last day is read as a DAY, not as an instant.** The deadline is a plain local datetime in the database and it arrives in the browser as an ISO string in UTC, so the same instant can land on a different calendar day depending on where the browser is. A plan that ends on the 19th has to end on the 19th for the student whose plan it is.
- **The teacher's window is not the student's.** A student whose plan ends this month does not shorten the months a teacher may plan ahead.

#### 5.8d "Every week" looks across the whole plan

The weekly way — pick the days of the week, pick a time, and the app finds every time that matches — searches **the whole plan**, not this month.

- **A weekly class is a repeating class, so the search cannot be a fortnight.** A student who books every Tuesday is booking every Tuesday for three months. A search that only looked at the next fortnight would find the first Tuesday and stop, and the student would think that was all there was.
- **Nothing past the end of the plan is ever suggested.** A class booked on a day the plan does not reach is a class nobody can pay for.
- **The soonest ones are shown, and the student is told how many there are in all.** A teacher who works every morning, three days a week, for three months, has over two hundred free morning times. A list that long is not a list.

#### 5.9 The small ones

```css
.cancelBtn    { min-height: 44px; padding: 8px 18px; border-radius: var(--radius-pill);
                border: 2px solid var(--border-mid); background: var(--surface); color: var(--muted); }
.changeBtn    { min-height: 44px; padding: 8px 18px; border-radius: var(--radius-pill);
                border: 2px solid var(--brand-green); background: var(--surface); color: var(--primary-mid); }
.otherTimeToggle { min-height: 52px; padding: 10px 18px; border-radius: var(--control-radius);
                   border: 2px solid var(--border-mid); background: var(--surface); color: var(--primary); }
.otherTimeInput  { max-width: 220px; padding: 12px 16px; font-size: 1.1rem; font-weight: 700;
                   border-radius: var(--control-radius); border: 2px solid var(--border-mid); }
```

The **Cancel** in the header is the smallest button on the screen. The **Change** button beside the picked day is a pill, because it is a small action on a small thing.

#### 5.10 The student's home page

The page is read top to bottom in the order a student asks the questions in: **how many have I got, can I book one, and when are my classes.**

```
MY CLASSES                          (h1, 1.7rem, 800)
Your classes with Richard Santos.

┌ CLASSES LEFT ───────────── Ready to book: 8 ┐
│ 8 of 20                                      │
│ ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ [Your plan ends on 10 Jan 2027]               │
│ Tip: message your teacher to add a class.     │
└───────────────────────────────────────────────┘

[  📅  Book a class  ]          ← the biggest thing on the page

YOUR CLASSES
┌ TODAY                          [ Details ] ┐
│ 8:15 AM - 9:05 AM                          │
│ English 1                                   │
└────────────────────────────────────────────┘
```

```css
.home        { display: grid; gap: var(--space-5); }
.homeTitle   { font-size: 1.7rem; font-weight: 800; letter-spacing: -0.02em; color: var(--primary); }
.homeSubtitle{ font-size: 1.05rem; font-weight: 500; color: var(--muted); }
.sectionTitle{ font-size: 0.85rem; font-weight: 800; letter-spacing: 0.08em;
               text-transform: uppercase; color: var(--muted); }
```

**The counter is a picture, not a sentence.**

```css
.counter       { display: grid; gap: var(--space-3); padding: var(--space-5);
                 border-radius: var(--radius-lg); background: var(--surface);
                 border: 1px solid var(--border); box-shadow: var(--neu-shadow-lg); }
.counterNumber { font-size: 3.4rem; font-weight: 800; line-height: 1; color: var(--primary); }
.counterBar    { height: 16px; border-radius: var(--radius-pill);
                 background: var(--surface-recessed); overflow: hidden; }
.counterBarFill{ height: 100%; border-radius: var(--radius-pill); background: var(--brand-green);
                 transition: width var(--duration-base) var(--ease-out); }
```

The number is the biggest thing on the page, because the number is the point of the card. The bar is 16px tall, so it can be seen at a glance and does not need reading.

**The book button sits above the list, not below it.** A student with eight classes booked should not have to scroll past all eight to find the thing they came to press.

```css
.bookBig { display: flex; align-items: center; justify-content: center; gap: var(--space-3);
           width: 100%; min-height: 76px; border-radius: var(--radius-lg);
           border: none; background: var(--brand-green); color: #fff;
           font-size: 1.25rem; font-weight: 800;
           box-shadow: 0 10px 24px rgba(47, 122, 61, 0.28); }
```

**The class card** puts the day first, the time second and the course last, because the thing the student is looking for is *when*.

```css
.classItem  { display: grid; grid-template-columns: 1fr auto; align-items: center;
              gap: var(--space-4); padding: var(--space-4); border-radius: var(--radius-lg);
              border: 2px solid var(--border-mid); background: var(--surface); }
.classDay   { font-size: 0.8rem;  font-weight: 800; letter-spacing: 0.08em; color: var(--muted); }
.classTime  { font-size: 1.35rem; font-weight: 800; line-height: 1.2; color: var(--text); }
.classCourse{ font-size: 0.95rem; font-weight: 600; color: var(--muted); }
.classAction{ min-height: 52px; padding: 10px 20px; border-radius: var(--control-radius);
              border: none; background: var(--brand-green); color: #fff;
              font-size: 1rem; font-weight: 800; }
```

The day is the word the student would use — **TODAY**, **TOMORROW**, **FRIDAY, OCTOBER 23** — never a number on a square.

#### 5.11 The ask card

When a student has to ask the admin for something, it is a **card**, not a paragraph. The student has to read what the situation is *and* press a button about it, and both of those need room. The old version was a 12px line of amber text with a 30px button under it.

```css
.askCard   { display: grid; gap: var(--space-3); padding: var(--space-5);
              border-radius: var(--radius-lg); background: var(--pill-warn);
              border: 1px solid rgba(209, 138, 16, 0.28); }
.askHeading{ font-size: 1.1rem; font-weight: 800; color: var(--text-warn); }
.askBody   { font-size: 1rem; font-weight: 500; line-height: 1.5; color: var(--text-warn); }
.askBtn    { min-height: 56px; padding: 12px 22px; border-radius: var(--control-radius);
             border: 2px solid var(--accent-warn); background: #fff; color: var(--text-warn);
             font-size: 1rem; font-weight: 800; }
```

Amber, because it is a warning and not an action. The button inside it is white with an amber edge, so it is clearly a button and clearly not the main thing on the page.

#### 5.12 The window of one class

When a student taps one of their classes, the window shows the same shape as the wizard's last screen: a **day**, a **time**, and then one row per fact.

```css
.detail      { display: grid; gap: var(--space-4); }
.detailDay   { font-size: 0.9rem; font-weight: 800; letter-spacing: 0.08em; color: var(--muted); }
.detailTime  { font-size: 2rem; font-weight: 800; line-height: 1.1; color: var(--text); }
.detailCourse{ font-size: 1.05rem; font-weight: 600; color: var(--muted); }
.detailRow   { display: grid; grid-template-columns: 44px 1fr; align-items: center;
               gap: var(--space-3); padding: var(--space-3) var(--space-4);
               border-radius: var(--radius-md); background: var(--surface-soft);
               border: 1px solid var(--border); }
.detailIcon  { width: 44px; height: 44px; display: grid; place-items: center;
               border-radius: var(--radius-sm); background: var(--surface);
               border: 1px solid var(--border); font-size: 1.35rem; }
.detailLabel { font-size: 0.78rem; font-weight: 800; letter-spacing: 0.06em;
               text-transform: uppercase; color: var(--muted); }
.detailValue { font-size: 1.05rem; font-weight: 700; color: var(--text); }
```

The label is small and quiet; **the value is what the student is checking**.

---

### 6. Colour

Kid Mode uses the brand ramp. It does not have a palette of its own.

```
--brand-green  #2f7a3d   the primary button, the chosen day, the chosen weekday, the counter bar
--brand-lime   #79a847   a finished step dot, the Change button's border
--surface-soft #f8fbf9   an unchosen card, a detail row
#e9f3dd                  a chosen card (the --cal-available-cell tint)
--pill-success / --text-success   "Free", the plan-end badge
--pill-danger  / --text-danger    "Busy", "Taken", "Remove"
--pill-warn    / --text-warn      "No times", the ask card
--pill-info    / --text-info      the quiet note
```

**Do not introduce a colour for Kid Mode.** If a screen needs a new state, it needs a **word** first and a colour second. Every coloured thing in Kid Mode also carries a word, because a child who cannot read the badge yet still has to know what it means.

The one place red is used is **Remove**, and it is used because a button that undoes something should not look like a button that does something.

---

### 7. Type

| What | Size | Weight | Colour |
|---|---|---|---|
| Home title | 1.7rem | 800 | `--primary` |
| Wizard title | 1.45rem | 800 | `--primary` |
| Class time | 2rem | 800 | `--text` |
| Classes left | 3.4rem | 800 | `--primary` |
| Question | 1.3rem | 800 | `--text` |
| Choice card title | 1.25rem | 800 | `--primary` |
| Part of day | 1.35rem | 800 | `--text` |
| Time | 1.35rem | 800 | `--text` |
| Class card time | 1.35rem | 800 | `--text` |
| Day number | 2.1rem | 800 | `--text` |
| Summary value | 1.15rem | 800 | `--text` |
| Ask heading | 1.1rem | 800 | `--text-warn` |
| Help / intro | 1rem | 500 | `--muted` |
| Button | 1.1rem | 800 | — |
| Book button | 1.25rem | 800 | `#fff` |
| Weekday name | 1.05rem | 800 | `--text` |
| Day name | 0.9rem | 700 | `--muted` |
| Step count | 0.9rem | 700 | `--muted` |
| Summary label | 0.78rem | 800 | `--muted` |
| Badge | 0.7rem | 800 | — |

Nothing in Kid Mode is smaller than 0.7rem, and the only thing at that size is a badge that also exists as a colour.

---

### 8. What "morning" means

Choosing a part of the day is a **filter**, not a wish.

| The student picked | The search returns |
|---|---|
| **Morning** (00:00–11:59) | **every** free time in the morning, on every chosen day |
| **Afternoon** (12:00–16:59) | every free time in the afternoon, on every chosen day |
| **Evening** (17:00–23:59) | every free time in the evening, on every chosen day |
| **Another time** (an exact clock time) | the closest free time to it, on each chosen day |

The old form asked for 08:00 and gave back one time per day, which left the student guessing what else was free. Now the part of the day says what it says.

**The list is capped.** A teacher who works every morning, three days a week, for three months, has over two hundred free morning times — and a list that long is the wall of choices this screen was built to stop. So the **soonest 30** are shown and the student is told how many there are in all:

> There are 234 times in all. These are the first ones.

That note is a `.info` banner — blue, quiet, and never the reason the student cannot act.

---

### 9. States

| State | What it looks like |
|---|---|
| **Loading** | `.loading` — a grid of pulsing `.loadingCard` skeletons in the same shape as the thing being loaded. Never a spinner over a form. |
| **Empty** | `.empty` — a dashed ghost card, a large emoji, and one sentence saying what to do next. |
| **Error** | `.error` — `--pill-danger`, `--text-danger`, a ⚠️, and the sentence. Errors are loud because a student must not miss them. |
| **Note** | `.info` — `--pill-info`, `--text-info`. A fact the student should know but does not have to act on. |
| **Chosen** | `--brand-green` fill with white text (day, weekday) or `#e9f3dd` with a green border (time, part of day, found time). |
| **Not pressable** | `opacity: 0.55–0.6`, `--surface-recessed`, `cursor: not-allowed`. The reason is always written somewhere — "Busy", "Taken", "No times". |

---

### 10. Motion

Everything animates, using the tokens from the top of this document:

- Cards lift `translateY(-2px)` on hover; buttons lift `translateY(-1px)`.
- Press is `scale(0.97)`.
- The chosen state changes over `--duration-fast` with `--ease-out`.
- The skeleton pulses at 1.4s.

Nothing in Kid Mode moves on its own, and nothing moves across the screen. A child needs to see where the thing he pressed went, and a moving target is a moving target.

---

### 11. The words

All of it comes from `studentCopy.js` and `classTime.js`. The rules that matter most:

- **One idea per sentence.** A student who is not confident in English reads one line at a time.
- **One question at a time.** The old new-plan form asked eight questions at once. That is a form for somebody filling in a survey.
- **Say the thing, not the system.** The database has "contracts" and "packages". A student has a class plan and some classes.
- **Never a word a student may not know.** `scripts/test-student-copy.mjs` fails the build if a banned word appears in a student-facing string, or if a sentence is too long.
- **Never say a time as a number when a word will do.** "Morning", not "08:00".

---

### 12. Responsive

Below `640px`:

- The wizard's padding drops to 16px and the gap to 12px.
- The choice grid and the part-of-day grid become one column.
- The day grid tightens to `minmax(88px, 1fr)`.
- The weekday grid becomes two rows of four.
- The footer becomes a **column** and every button goes **full width**.
- The found list loses its inner scroll and scrolls with the page.
- The student's home title drops to 1.45rem and the counter number to 2.8rem.
- The class card stacks: the day and the time on top, the button under it, full width.
- The book button drops to 68px and 1.15rem.
- The day strip's chips tighten to 76px.

> **Watch out:** in a column flex container, `flex-basis: 100%` is 100% of the **height**, not the width. A button with a `100%` basis in a column footer is taller than the box it sits in, so the two buttons wrap into a second column and sit side by side, off the edge of the screen. Use `flex: 0 0 auto; width: 100%`.

---

### 13. Do and Don't

**Do**

- Show one question.
- Make every pressable thing big.
- Say what the button does, in one line. Including the buttons that undo.
- Put a word next to every colour.
- Tell the student where they are ("Step 2 of 3").
- Leave a way out on every screen.
- Say "looking" while you are still asking.
- Show the class in full before it is booked.
- Let them change their mind. Anything that can be added can be taken away, from the screen they added it on.

**Don't**

- Put a day strip and a time grid and a list of picks on one screen.
- Use a colour without a word.
- Ask for a clock time from a child who cannot read a clock.
- Grey out a day to say "we do not know yet".
- Ask the student to confirm the same thing twice.
- Offer a "Yes" button with no question next to it.
- Hide the way out of the screen.
- Make one button mean two opposite things and tell them apart by colour alone.

---

### 5.13 The student's class history

`frontend/src/pages/StudentClassHistoryKid.jsx`, with its styles in `studentKid.module.css` and its words in the `HISTORY` group of `studentCopy.js`.

This screen used to be the teacher's review screen with the teacher's words on it — "verification status", "evidence", "missing items". A child opening it to remember what they did on Tuesday was being shown the paperwork.

So it is a different screen, not a restyled one. It asks one question — **which class do you want to look at?** — and answers it with a list of cards:

```
MY CLASSES                              [ Refresh ]
Every class you have had.

┌ 📘  Business English - Weekend Group ┐
│  Saturday, October 17 · Morning       │
│  🎉 All done!                         │
│  👩‍🏫 YOUR TEACHER   Maia Cruz         │
│  ⏱️ HOW LONG        52 minutes        │
│  📝 WHAT YOU DID    Practised ...     │
│  [  ▶️  Watch the class again  ]       │
└────────────────────────────────────────┘
```

- **The class name is the heading.** The date and the part of the day go under it, because a child cannot read a clock.
- **One word says how the class went** — "All done!", "You joined!", "Your teacher is checking", "Still going on", "Waiting to start", "Almost done", "Not finished yet". The word comes first and the colour second, because a child who cannot read the badge yet still has to know what it means.
- **The proof, the review and the missing items are not here.** They are the teacher's business. The recording is, because the child may want to watch their own class again, and it is the one thing on this screen they can press.
- **Six classes at a time**, then "Show 6 more classes". A wall of two hundred cards is not a list.
- **One filter, in a window, and it asks three small questions**: *which class*, *how it went* and *when*. It is the same shape as the Calendar's "Filter your days" window — a title, a line saying what to do, a × to close, rows of pills with a label on the left, and one big green button that says what pressing it will do ("Show 3 classes"). The teacher screen had eight status pills, a search box, a date range and two dropdowns, which is a wall of choices and a child picks nothing. Here every button says something the student recognises, because it is one of their own classes.
- **The counts update as they choose**, and they are the number of classes in that pill *with the other two questions already answered*. So "This week 1" means one class this week, right now, not a number from before.
- **"When" is three words, not a calendar.** "This week", "this month" and "earlier" cannot be got wrong. A child cannot read a date range, and a calendar of the past is a puzzle.

The teacher's version of the same data is untouched, and stays a review screen.

### 5.14 The account menu

`frontend/src/components/AccountMenu.jsx`, with its styles in `AccountMenu.module.css` and its words in the `ACCOUNT` group of `studentCopy.js`.

It is shaped like the menu everybody already knows from every other app: **the person at the top, a list of places to go, the way out, and a quiet line at the bottom.** A child who has used any phone can use this without being told.

```
┌──────────────────────────────────┐
│ [avatar]  Alex Pacaldo            │
│           Student                 │
│ ───────────────────────────────  │
│ [👤] My account                 › │
│ [🕘] My classes                › │
│ [❓] Get help                   › │
│ ───────────────────────────────  │
│ [🚪] Log out                      │
│                                  │
│ JEN Academia                      │
└──────────────────────────────────┘
```

- **Every row is 60px tall.** A child's finger is not a mouse pointer.
- **Every row has a picture AND a word.** A child who cannot read the icon yet still knows what it is for. The picture is in a circle, the word beside it.
- **The chevron says there is more.** It is decoration, and it is `aria-hidden`.
- **The way out is red**, because a button that undoes something should not look like a button that does something.
- **Clicking anywhere else closes it, and so does Escape.** Escape also puts the focus back on the name, so the keyboard does not lose its place.
- **On a phone it still hangs under the picture**, right-aligned to it. The name is hidden there — the picture *is* the account, and the space the name took was squeezing "JEN Academia" down to "J...". A menu that appears where the finger already was is a menu that appears under the thumb.

### 5.15 The student's account page

`frontend/src/pages/account.jsx` (the student branch), with its styles in `studentKid.module.css` and its words in the `ACCOUNT` group.

The account page was the admin's screen with the admin's words on it — "Profile Information", a "Locked" badge over a form of disabled inputs, a "Security" card, a "Contract" card, and a table of user IDs. So the student's page is a different screen, not a restyled one:

```
┌ 📷  Hi, Alex                                  ┐
│      STUDENT                                  │
│      alexpacaldo@gmail.com                    │
└───────────────────────────────────────────────┘
┌ CLASSES LEFT ─────────────────────────────────┐
│  12  of 20                                    │
│  ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│  Your plan ends on 10 Jan 2027                │
└───────────────────────────────────────────────┘
┌ YOUR CLASS ─────────┐ ┌ YOUR TEACHER ────────┐
│ Conversational Eng. │ │ Richard Santos        │
└─────────────────────┘ └──────────────────────┘
┌ ABOUT YOU ─────────────────────── [Change my details] ┐
│  YOUR NAME      Alex Pacaldo                            │
│  BIRTHDAY       10 November 2003                        │
│  COUNTRY        Philippines                             │
└─────────────────────────────────────────────────────────┘
```

- **The number is the picture**, and it is the same counter the home page has — so a student learns one shape and sees it everywhere.
- **The page is read, not edited.** The details are a list: the label is quiet, the value is what you check. "Change my details" turns the list into big inputs.
- **The inputs are 60px tall.** Reading small print is work, and the work is what stops a child.
- **One green button per card**, and it says what it does: "Save my details", "Save my password".
- **A teacher's and an admin's account page are untouched.** Their pages carry a teaching profile and an administration panel, and neither is a screen for a five-year-old.

### 5.16 A teacher's and an admin's account page

`frontend/src/pages/account.jsx` (the staff branch), with its styles in `account.module.css`.

**The same shape as the student's page — a stack of cards, one thing in each — at an adult's proportions.** One product, two sizes. A teacher and a student are looking at the same account, so the page has the same shape; the differences are the words and the size of the type, not the structure.

```
┌ 📷  Jennifer Santos                              ┐
│      Admin · Active                               │
│      admin@jenacademia.local                     │
└───────────────────────────────────────────────────┘
┌ ADMINISTRATION ───────────────────────────────────┐
│  ACTIVE STUDENTS  ACTIVE TEACHERS  ARCHIVED USERS  │
│  6               7              0                  │
└───────────────────────────────────────────────────┘
┌ PROFILE INFORMATION ─────────────────── [Edit details] ┐
│  FIRST NAME    Jennifer                                │
│  BIRTHDAY      8 April 1987                            │
└─────────────────────────────────────────────────────────┘
```

- **The details are READ, not edited.** The old page showed a form of disabled inputs under a badge that said "Locked" — a form you cannot use, and a badge that says "no". Now the facts are a list and "Edit details" turns the list into inputs.
- **The numbers are tiles**, each one a number with a quiet label above it.
- **One primary action per card**, and it says what it does: "Save changes", "Update password".
- **The way out is red**, like the student's.

---

## The teacher's and the admin's calendar

**Where it lives:** `frontend/src/assets/calendar.module.css`, used by `frontend/src/pages/Calendar.jsx` and `frontend/src/pages/teacherScheduleEditor.jsx`.

**The same design language, at adult density.**

A student reads one screen and presses one thing, so their buttons are 76px tall and their headings are 1.7rem. A teacher is reading a schedule and moving between a grid and a panel, so their buttons are 54px and their headings are 0.85rem. **Same shapes, same colours, same type scale, same card system — sized for the reader.**

Everything below is the Kid Mode rules above, applied to an adult. Do not invent a second visual language for the teacher.

### The two ways of looking at a calendar

A teacher and an admin get **two views of the same classes**, chosen from a pill at the top of the page.

```css
.viewSwitchRow { display: flex; align-items: center; justify-content: flex-start;
                 gap: var(--space-3); margin-bottom: var(--space-4); }
.viewSwitch    { display: inline-flex; align-items: center; gap: 4px; padding: 4px;
                 border-radius: var(--radius-pill); background: var(--surface);
                 border: 1px solid var(--border); box-shadow: var(--neu-shadow-sm); }
.viewSwitchBtn { display: inline-flex; align-items: center; gap: 8px;
                 min-height: 46px; padding: 8px 22px; border: none;
                 border-radius: var(--radius-pill); background: transparent;
                 color: var(--muted); font-size: 0.95rem; font-weight: 800; }
.viewSwitchBtnActive { background: var(--brand-green); color: #fff; }
```

| View | What it shows | Who it is for |
|---|---|---|
| **Month** | the grid, a month at a time, with the colour key | finding the one class on a Tuesday |
| **List** | the same classes as a column, in the shape the student's page uses | reading a month of them |

- **It is a pill, not a row of buttons**, because it is a choice between two ways of looking at the same thing, not two things to do. It says which one you are in.
- **The names are what is shown**, not what the feature is called. "Month" and "List". Not "Simple mode" — nothing about a list is simple, and the word does not say what is on the screen.
- **The choice is remembered.** A teacher who works in the list should not have to say so every morning.
- **The month arrows stay in the list view.** The list is a month as well as a list, and a teacher who cannot move between months has lost something the grid gave them.
- **The colour key goes away in the list view.** There are no colours to explain without a grid.
- **Opening a class replaces the list with the class**, and "Back to Classes" brings the list back — exactly as the student's page behaves.
- **The list is the grid's data.** `/classes-by-month` already fills the cache for every day of the month, and the grid is drawn from that same cache. The list is the same classes read a different way, not a second request.

---

### The windows

Some things are too tall for a panel beside a grid, and some are too important to be one. Those open in a **window**.

```css
.dialogHead  { display: flex; align-items: flex-start; justify-content: space-between;
               gap: var(--space-4); padding-bottom: var(--space-4);
               margin-bottom: var(--space-4); border-bottom: 1px solid var(--border); }
.dialogTitle { font-size: 1.25rem; font-weight: 800; letter-spacing: -0.01em; color: var(--primary); }
.dialogSub   { font-size: 0.92rem; font-weight: 500; line-height: 1.5; color: var(--muted); }
.dialogClose { width: 42px; height: 42px; border-radius: 50%; background: var(--surface-recessed);
               color: var(--muted); font-size: 1.5rem; }
.dialogBody  { display: grid; gap: var(--space-4); }
```

- **The window has its own heading and its own way out.** A window that can only be closed by clicking outside it is a window people get stuck in.
- **The window brings its own data with it.** The teacher's availability manager used to be a panel under a month grid, and the teacher picked the date by clicking a day on that grid. As a window the grid is behind it, so **the days come with the window** — a strip of day cards with a month stepper, the same strip the student picks a day from. A form that needs the page behind it does not belong in a window.
- **Errors wait to be asked for.** A required field that has not been touched does not shout "Please select a start time" the moment the window opens. The field errors appear once the teacher has tried to save.
- The window is rendered through `ModalPortal`, because anything `position: fixed` inside `.content-area` is positioned against the content column, not the viewport — so an in-place overlay covers the page but not the sidebar.

#### A window can have more than one screen

A window is not a form. It is a place, and a place can have rooms.

The teacher's availability window has three:

| Screen | What it is |
|---|---|
| **Set Your Schedule** | the form — pick a day, pick the hours, save |
| **Your availabilities** | every day they have already set, each with Edit and Delete |
| **Filter your days** | the three filters, and the number of days they will show |

- **They are screens of one window, not separate windows.** The teacher goes back and forth between "what have I set", "let me change one" and "let me look at just Mondays" without losing what they were doing.
- **The way in is a button, and it says what it does.** "See my availabilities (12)" — with the count, because a button that opens a list should say how big the list is before you open it.
- **The list is every day, across the whole booking window.** Not one month at a time. A teacher who works in January wants to see January and February and March at once.
- **Editing puts the day back in the form**, moves the date strip to that month, and says so: *"Editing Sat, 24 Oct 2026. Save to change it."* A save that reads as "add this day" leaves the teacher with two of them.
- **A day with a booked class on it cannot be edited or deleted**, and says why. The class is the teacher's; taking the availability away would take the class with it.

#### The month stepper

The window's day strip has a month stepper, and it has to answer one question: *which month am I looking at?*

- **The window opens on the month the teacher is looking at.** Not on today's month, whatever the grid was showing. A teacher who paged the grid to November and opened the window was shown October — and the date they picked was not the date they thought they were looking at.
- **The stepper cannot leave the booking window.** The window is the three months from today. The arrow that would take the teacher outside it is off, not hidden, so the shape of the limit is visible.
- **The window's first month and last month are both reachable.** The stepper is *inclusive* at both ends. It was not, and the back arrow was dead on the way from the second month to the first: a teacher who looked at November could not come back to October without reloading the page. Reloading is not a way to go back.
- **The month the picker starts on is in the window**, so stepping back to it has to be allowed. That is the whole bug, in one sentence.

```js
// utils/studentSchedule.js
export function canStepMonth({ year, month, delta, minKey, maxKey }) {
  const current = new Date(year, month + delta, 1);
  const key = monthKey(current.getFullYear(), current.getMonth());
  if (delta < 0) return key >= minKey;   // ">=" and not ">"
  return key <= maxKey;
}
```

- **The month rule is a function, not a line inside the page.** A comparison that decides whether a teacher can get back to where they were is worth a test.

#### A time is written one way

Every time on every screen is written the same way: `7:50 AM`, `4:30 PM`, `12:00 PM`.

- **The formatter is idempotent.** Putting a time that is already in words through it again gives the same words back. It used to add a second "AM" — "7:50 AM AM" — because one place took the end of a class, wrote it in words, and then wrote it in words again.
- **A formatter that changes its input is not a formatter.** It is a converter, and it has to say which shape it takes. This one takes every shape the database has: `08:03`, `08:03:00`, a full date-time, and `8:03 AM` once something has already read it.

#### The availability card

```css
.availCard    { display: grid; gap: var(--space-2); padding: var(--space-4);
                border-radius: var(--radius-md); border: 1px solid var(--border);
                background: var(--surface); }
.availCardOff { background: var(--pill-danger); border-color: rgba(168, 58, 52, 0.2); }
.availDate    { font-size: 1.05rem; font-weight: 800; }
.availBadge   { padding: 3px 12px; border-radius: var(--radius-pill);
                font-size: 0.72rem; font-weight: 800; }
.availBadgeOn { background: var(--pill-success); color: var(--text-success); }
.availBadgeOff{ background: var(--surface); color: var(--text-danger); }
.availHours   { font-size: 0.95rem; font-weight: 700; color: var(--text-mid); }
.availBtnEdit { border: 2px solid var(--brand-green); color: var(--primary-mid); }
.availBtnDelete{ border: 2px solid var(--accent-danger); color: var(--text-danger); }
```

- **The date is the headline**, because that is what the teacher is looking for.
- **Available is green, Unavailable is red** — the same two colours the status toggle uses, so a day means the same thing everywhere.
- **Edit is green and Delete is red.** Green is the thing to press; red is the thing that takes something away.
- **Everything in the list is a card**, not a row in a table. A table is for reading down a column; these are separate things to act on.

#### The filters on a long list

A teacher who works three days a week for three months has ninety days set. Ninety cards is a wall again — the thing this screen was built to stop.

But three rows of filters sitting **on the list** is clutter on the list, and the list is what the teacher came for. So:

> **The list has one button. The filters have a screen.**

```
LIST SCREEN                          FILTER SCREEN
┌────────────────────────────┐       ┌────────────────────────────┐
│ ← Back to set your schedule│       │ Filter your days           │
│                            │       │ Choose which days you      │
│ [ Filter (1) ]             │       │ want to see.               │
│              Showing 0 of   │       │                            │
│              2 days.       │       │ STATUS  [All 2][Available 2]│
│                            │       │ MONTH   [All][Oct 2026]    │
│ ┌────────────────────────┐ │       │ DAY     [All][Sun 1][Mon 0]│
│ │ Wed, Oct 21, 2026      │ │       │                            │
│ │ [Available] 7:00-8:00  │ │       │ [      Show 2 days      ] │
│ │ [Edit] [Delete]        │ │       └────────────────────────────┘
│ └────────────────────────┘ │
└────────────────────────────┘
```

- **The filter button is on the list. The filters are on their own screen.** Both are the same window, so the teacher never loses their place.
- **The button says how many filters are on.** "Filter (1)". A teacher who set a filter and came back can see that it is still on, instead of wondering why the list is short.
- **The button turns green when a filter is on.** Green is the app's "this is on" colour.
- **The filter screen ends in one big button that says how many days you will see.** "Show 2 days". The teacher sets the filters, watches the number change, and presses the thing that takes them to the results.
- **The filters are pills, not a dropdown.** A teacher can see every option and how many are behind it, without opening anything.
- **Every filter row has a label down the left.** `STATUS`, `MONTH`, `DAY`. Three loose rows of pills with nothing to say what they were read as clutter — a label and a fixed column turns three rows of buttons into three filters.
- **The pills all start at the same place on every row.** The label column is what makes it line up.
- **The count is quieter than the name.** "Sun 1", not "Sun (1)". The eye reads the name first and the number second.
- **Every filter says how many are behind it.** A filter that hides things without saying how many is a filter that makes the list feel shorter than it is.
- **The filters stack: what, then when.** *What* it is (available or not), then *when* it is (which month, which day of the week). Each on its own row, so a teacher reads them in the order they think in them.
- **The day filter shows all seven days, with counts.** "Sun 1 Mon 0 Tue 0…" A day with nothing on it still shows, because "Thu 0" tells a teacher they have no Thursdays — which is worth knowing, and is not obvious from a list they have to read through. The order matches the Weekdays picker in the form above, so the two read the same way.
- **The filters combine.** A month and a day and a status narrow together.
- **A filter that matches nothing says so.** "No days match this filter." — not an empty box.
- **The pills fit on one line.** Eight day pills plus "All days" is the widest row there is; if it does not fit, the pills get tighter, not smaller — a filter you cannot read is not a filter.

---

### The month grid

```css
.calendarCard { background: var(--surface); border: 1px solid var(--border);
                border-radius: var(--radius-lg); box-shadow: var(--neu-shadow-lg);
                padding: var(--space-5); align-self: start; }
.monthLabel   { font-size: 1.3rem; font-weight: 800; color: var(--primary); }
.navBtn       { width: 46px; height: 46px; border-radius: var(--control-radius);
                border: 2px solid var(--border-mid); background: var(--surface);
                color: var(--primary); font-size: 1.5rem; font-weight: 800; }
.weekday      { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em;
                text-transform: uppercase; color: var(--muted); }
.cell         { aspect-ratio: 1 / 1; border-radius: var(--radius-md); font-weight: 700; }
```

- The card is **as tall as the month needs it to be**, not as tall as the panel next to it. Stretched, it was a tall white box with a small calendar at the top of it.
- The weekday row is uppercase and letterspaced, like every other heading in the app.
- The cells keep the **calendar status palette** from the top of this document. A cell is a pale tint of the same hue as its dot, so the legend describes the grid exactly.

### The panel on the right

```css
.panelTitle  { font-size: 0.85rem; font-weight: 800; letter-spacing: 0.08em;
               text-transform: uppercase; color: var(--muted); }
.panelCard   { display: grid; gap: var(--space-3); padding: var(--space-4);
               border-radius: var(--radius-lg); border: 1px solid var(--border);
               background: var(--surface); }
.actionCard  { display: flex; align-items: center; gap: var(--space-3);
               width: 100%; min-height: 54px; padding: var(--space-3) var(--space-4);
               border-radius: var(--radius-md); border: 2px solid var(--border-mid);
               background: var(--surface); color: var(--primary);
               font-size: 1rem; font-weight: 800; }
.detailRow   { padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
               background: var(--surface-soft); border: 1px solid var(--border); }
.detailLabel { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.06em;
               text-transform: uppercase; color: var(--muted); }
.detailValue { font-size: 0.95rem; font-weight: 700; color: var(--text); }
```

- **A section heading is a `.panelTitle`**, exactly like the student's `.sectionTitle`.
- **A fact is a `.detailRow`** — a small quiet label above a bigger value. The same shape the student's class window uses.
- **An action is a `.actionCard`** — a wide button with an icon and one line of text.

The three actions a class window can offer keep the colours the rest of the app already uses for the same three ideas:

| Action | Class | Why |
|---|---|---|
| Join / Start / Book | `.actionPrimary` | green — it is the thing to press |
| Mark done / paperwork | `.actionInfo` | blue — it is about the record |
| Reschedule / change | `.actionWarn` | amber — it changes something already booked |

### Forms

```css
.formLabel  { font-size: 0.8rem; font-weight: 700; color: var(--text-mid); }
.formInput, .formSelect, .formTextarea { width: 100%; padding: 11px 14px; font-size: 0.95rem;
                 border: 1px solid var(--border-mid); border-radius: var(--control-radius);
                 background: var(--surface); color: var(--text); }
.formInput:focus { border-color: var(--accent); box-shadow: 0 0 0 4px rgba(121, 168, 71, 0.18); }
.formHint    { font-size: 0.78rem; font-weight: 600; color: var(--muted); }
.fieldError  { font-size: 0.78rem; font-weight: 700; color: var(--text-danger); }
.segmented   { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
.segmentedBtn{ min-height: 46px; border-radius: var(--control-radius);
               border: 2px solid var(--border-mid); background: var(--surface);
               color: var(--text-mid); font-size: 0.9rem; font-weight: 700; }
```

A two-way choice is a **segmented control**, not two separate buttons. "Single Day / Weekly Pattern" and "Available / Unavailable" are the same shape.

`Unavailable` is the one red half of a segmented pair (`.segmentedBtnDanger`) — red is the word for "not available" everywhere else in this app too, and a teacher scanning the form should not have to read it to know which half is off.

### The free times

```css
.slotGrid    { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
               gap: var(--space-2); }
.slotBtn     { min-height: 60px; border-radius: var(--radius-md);
               border: 2px solid var(--brand-lime); background: #e9f3dd;
               color: var(--primary); font-size: 0.95rem; font-weight: 800; }
.slotBtnTaken { cursor: not-allowed; opacity: 0.55;
                border-color: var(--border-mid); background: var(--surface-recessed);
                color: var(--muted-light); }
```

The same shape as the student's time cards, and the same rule: **a taken time says so in a word and in a colour**, and cannot be pressed.

### Do and Don't

**Do**

- Use the same card, button, badge and heading shapes as the student's screens.
- Keep the grid's status palette exactly as documented at the top of this file.
- Put a label and a value on one row, with the label quiet.
- Make the teacher's primary action the loudest thing in the panel.

**Don't**

- Invent a second visual language for the teacher. One app, one design.
- Make the teacher's buttons as tall as the student's — they are working, not playing.
- Change a colour's meaning between the student and the teacher screens.
- Straddle a form's buttons side by side when their labels are longer than half the column.

---
## Layout

### App Shell

```
Sidebar:       fixed, var(--sidebar-width) wide, full height
App layout:    margin-left: var(--sidebar-width); width: calc(100% - var(--sidebar-width))
Content area:  padding: 0 1.8rem 2rem
Content inner: background var(--surface); border-radius var(--radius-xl); padding 28px; --neu-shadow-lg
Header:        sticky top 0; height var(--header-height); z-index 99
```

### Breakpoints

```
1200px  — sidebar narrows
900px   — sidebar hides, hamburger appears, full-width layout
720px   — login / auth pages simplify
640px   — single column everything, full-width panels
480px   — minimum padding, tightest layout
```

### Overflow Safety

Non-negotiable, defined globally in `index.css`:
- `html, body, #root { overflow-x: hidden }`
- `overflow-wrap: anywhere` on all text-bearing elements
- `max-width: 100%` on `img, video, canvas, svg, iframe`

Wide tables must live inside an `overflow-x: auto` wrapper. Never let a table force the page wide.

### Common Grid Patterns

```css
/* Dashboard stats */
grid-template-columns: repeat(3, minmax(0, 1fr));

/* Homepage bento */
grid-template-columns: repeat(12, minmax(0, 1fr));

/* Two-panel (content + sidebar) */
grid-template-columns: 1fr 360px;

/* Card list */
grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
```

---

## Page Structure Pattern

```
Page header
  ├── Eyebrow label (uppercase, pill)
  ├── Page title (h1, font-weight 800)
  └── Subtitle / description (muted text)

Content
  └── content-inner (primary card shell)
       ├── Section with secondary cards or table
       └── Empty state (ghost card) when no data
```

---

## Dos and Don'ts

**Do:**
- Animate every interactive state change
- Use `translateY(-2px)` on card hover, `translateY(-1px)` on button and nav hover
- Use `--duration-*` and `--ease-*` tokens instead of raw values
- Use warm shadows (`rgba(18, 34, 30, …)`) everywhere
- Add new colors as tokens in `index.css`, then document them here
- Drive related surfaces from the same tokens — a legend and the thing it describes must never diverge
- Always include a focus-visible outline

**Don't:**
- Use `border-radius` values outside the scale
- Use `corner-shape` — it makes corners look angular at UI radii (see Corner shape)
- Use `transition: all` — always specify the property
- Use `!important` except for reduced-motion overrides
- Introduce font families, or override `font-family` in a module
- Use `px` for font sizes — use `rem`
- Use `window.confirm` / `alert` / `prompt` — build a dialog
- Point a small element (dot, chip, pill) at a near-white surface token; it will vanish
- Skip skeleton loading states for async content
- Skip a visual check in the browser before declaring a style change done