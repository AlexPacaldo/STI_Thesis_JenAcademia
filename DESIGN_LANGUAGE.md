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