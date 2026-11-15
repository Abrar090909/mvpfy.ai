# mvpfy UI — build conventions

The mvpfy desktop app (the IDE for PMs) is a near-monochrome workspace in the manner of an agent
IDE — dark by default, light on request — with a project sidebar, an IDE tab strip, panes and a
status bar. Colour carries meaning; everything else is a step on one neutral ramp, and the
strongest ink is the emphasis.

## Themes

Every colour is a CSS variable (`src/index.css`), one set under `:root` (dark) and one under
`:root[data-theme='light']`; `tailwind.config.cjs` maps the tokens onto those variables, so a
class written once works in both. Never hard-code a colour in a component — it will be right in
one theme only. The choice (Dark / Light / System) is `settings.theme`; `src/lib/theme.ts`
applies it and the sidebar has a one-click switch.

The #mvpFY logo is the original artwork. On dark it uses `assets/logo-dark.svg`, the same file
with "#mvp" in the brand's lighter purple (#A25ED8) so it stays legible.

## Tokens (tailwind.config.cjs)

| Role | Classes |
|---|---|
| Canvas → surfaces | `bg-sunken` (logs, code, inputs) · `bg-paper` (canvas) · `bg-chrome` (sidebar, tab strip, status bar) · `bg-surface` (cards, panes) · `bg-raised` (selected rows, popovers, the open tab) · `bg-hoverfill` (hover) |
| Borders | `border-line` (default) · `border-line-subtle` (dividers inside a card) · `border-line-strong` (the border of something selected) |
| Text | `text-ink` (primary) · `text-body` (readable secondary) · `text-muted` (labels, meta) · `text-faint` (quietest still read) · `text-onink` (on an `bg-ink` fill) |
| Meaning | `go` running / done / healthy · `work` an agent is working · `warn-*` needs a look · `danger` failed |

Rules:

- **Never a raw palette class** (`bg-white`, `text-slate-500`, `bg-red-50`…). The one exception is
  the QR code, which must stay black on white to scan.
- **Green means running or done.** It is never a link colour. Text actions use `.link`.
- **Selection is brightness, not a fill:** `border-line-strong bg-raised text-ink`. A solid white
  block is reserved for the single primary action.
- Shadows do not read on black: cards use `shadow-card` (a 1px top highlight); popovers `shadow-pop`.

## Type

Geist (sans) and Geist Mono, self-hosted through `@fontsource-variable` — the app runs offline, so
no font CDN. Body is 13px. Headings use `tracking-heading`; display type `tracking-display`.
Mono is for things a person might copy: paths, ports, model names, ids, timers.

`.section-label` is sentence case, 11.5px, medium, `text-muted` — not uppercase, letter-spaced
labels, which shouted over the content they introduced.

## Components (src/index.css)

| Class | Use |
|---|---|
| `.btn-primary` | White fill, black text. One per screen. Disabled is a quiet raised tile, not a grey blob. |
| `.btn-secondary` | Bordered, for the other actions in a group. |
| `.btn-ghost` | No border until hovered; toolbars and dense rows. |
| `.link` | A text action ("View logs", "Refresh"): neutral, underlined. |
| `.card` | `rounded-xl border-line bg-surface shadow-card`. |
| `.chip` | A bordered label with an optional icon. |
| `.kbd` | A key cap. |
| `.field` | A text input or textarea. |

## Icons

[lucide-react](https://lucide.dev), at 13–15px with `strokeWidth` 1.5–1.8, `aria-hidden` when a
label sits beside it. Never Unicode glyphs as icons (↗ ↻ ⇅): on Windows they fall back to the
colour-emoji font and render as blue tiles.

## Shell

`App` → `Sidebar` (projects, each with its live state and any running agent) · `ProjectShell`
(the tab strip and its panes) · `StatusBar` (the open project, tasks running, version, updates).
Settings and Add project cover the project at `z-30` — above the tab strip — so no tab reads as
open on top of them; the project stays mounted underneath so its in-flight work survives.

## Component previews

`entry.ts` exports the presentational surface — components that take props and never call
`window.mvpfy`: `LogPanel`, `Logo`, `Sidebar`, `StatusBar`, `ConnectFeature1Banner`. Each has a
preview in `previews/`. The screen views (`OverviewView`, `PlanView`, …) need the project
controller and IPC, so they are mapped to null.
