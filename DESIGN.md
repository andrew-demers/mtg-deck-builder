---
version: alpha
name: MagicTheGathering-design-analysis
description: |
  Magic: The Gathering's official site (magic.wizards.com) is a permanently dark, editorial-gaming-brand
  system: pure black canvas, bold condensed all-caps headlines in Gotham Narrow, humanist Open Sans body
  copy, and a single incendiary brand red (#ea3601) that carries every link, every hover state, and every
  primary action - rendered not as a resting shadow but as a soft red glow (`filter: drop-shadow(...)`)
  on hover/focus. Buttons default to a true pill (`8px/50%` elliptical radius collapses to a full pill at
  normal button heights), articles live on black 12px-radius cards, and dark surfaces get a signature
  top-edge accent-to-black gradient border. Sourced directly from the site's rendered HTML/CSS (view-source),
  not a screenshot analysis - hex values and font names below are read straight from the CSS, not estimated.

colors:
  black: "#000000"
  white: "#ffffff"
  brand-red: "#ea3601"
  brand-red-active: "#b93b0d"
  brand-orange: "#ff6000"
  header-bg: "#0c0f11"
  surface-dark: "#181818"
  modal-bg: "#1f2025"
  modal-border: "#35353d"
  card-media-bg: "rgba(0,0,0,0.88)"
  white-alpha10: "rgba(255,255,255,0.1)"
  white-alpha25: "rgba(255,255,255,0.25)"
  white-alpha55: "rgba(255,255,255,0.55)"
  white-alpha75: "rgba(255,255,255,0.75)"
  black-alpha25: "rgba(0,0,0,0.25)"
  black-alpha50: "rgba(0,0,0,0.5)"
  black-alpha75: "rgba(0,0,0,0.75)"
  ink-on-light: "#222222"
  tag-red: "#e83411"

typography:
  hero-headline:
    fontFamily: Gotham Narrow
    fontSize: 36px (clamp to 64px at 1600px+)
    fontWeight: 800
    lineHeight: 1
    textTransform: uppercase
  section-header-lg:
    fontFamily: Gotham Narrow
    fontSize: 36px (clamp to 42px at 1600px+)
    fontWeight: 800
    textTransform: uppercase
  section-header-md:
    fontFamily: Gotham Narrow
    fontSize: 30px (clamp to 36px at 1600px+)
    fontWeight: 800
    textTransform: uppercase
  section-header-sm:
    fontFamily: Gotham Narrow
    fontSize: 24px (clamp to 30px at 1600px+)
    fontWeight: 800
    textTransform: uppercase
  card-title:
    fontFamily: Gotham Narrow
    fontSize: 18px (clamp to 24px at 1600px+)
    fontWeight: 800
    textTransform: uppercase
  hero-subheader:
    fontFamily: Open Sans
    fontSize: 18px (clamp to 30px at 1600px+)
    fontWeight: 500
  body-md:
    fontFamily: Open Sans
    fontSize: 16px
    fontWeight: 400
    wordSpacing: 1px
  nav-link:
    fontFamily: Open Sans
    fontSize: 14px
    fontWeight: 700
    textTransform: uppercase
  utility-link:
    fontFamily: Open Sans
    fontSize: 12px
    textTransform: uppercase
  footer-heading:
    fontFamily: Open Sans
    fontSize: 16px
    fontWeight: 700
    textTransform: uppercase
  button-label:
    fontFamily: Gotham Narrow
    fontSize: 18px
    fontWeight: 600

rounded:
  none: 0px
  card: 12px
  card-flush: 1.5px
  modal: 12px
  pill: "8px/50%"
  circle: 50%

spacing:
  section-sm: 30px
  section-md: 40px
  section-lg: 60px
  section-xl: 70px
  gutter: 15px
  gutter-wide: 20px
  header-height: 54px

components:
  button-primary:
    backgroundColor: "{colors.brand-red}"
    textColor: "{colors.white}"
    typography: "{typography.button-label}"
    rounded: "{rounded.pill}"
    borderWidth: 2px
    borderColor: "{colors.brand-red}"
  button-primary-active:
    transform: "translateY(1px)"
  button-secondary:
    backgroundColor: transparent
    textColor: currentColor
    borderWidth: 2px
    borderColor: currentColor
    rounded: "{rounded.pill}"
  button-hover-glow:
    filter: "drop-shadow(0 0 8px {colors.brand-red})"
  nav-bar:
    backgroundColor: "{colors.header-bg}"
    height: "{spacing.header-height}"
    position: sticky
  article-card:
    backgroundColor: "{colors.black}"
    textColor: "{colors.white}"
    rounded: "{rounded.card}"
  dark-card-accent-border:
    border: "1px solid {colors.brand-red}"
    borderImage: "linear-gradient(to top, {colors.brand-red} 25%, {colors.black} 100%)"
  modal:
    backgroundColor: "{colors.modal-bg}"
    border: "2px solid {colors.modal-border}"
    rounded: "{rounded.modal}"
  tag-badge:
    backgroundColor: "{colors.tag-red}"
    textColor: "{colors.white}"
    typography: "{typography.utility-link}"
    letterSpacing: "0.2em"
    padding: "0.25em 0.5em"
  round-icon-button:
    backgroundColor: "#242424"
    textColor: "{colors.white}"
    rounded: "{rounded.circle}"
    size: 50px
  link-inline:
    textColor: "{colors.brand-red}"
    hoverEffect: "{component.button-hover-glow}"
---

## Overview

Magic: The Gathering's official site never leaves black. The `<html>` background is `#000000` by default
(`--html-background`), and every page-level theme override (each set/product gets its own `primaryColor`
and `accentColor` pair) still sits on top of that black canvas rather than replacing it - this is a
permanently dark brand, not a light/dark toggle. Headlines are set in the proprietary **Gotham Narrow** at
weight 800, forced uppercase by a global `h1-h6 { text-transform: uppercase }` rule - every heading on the
site shouts. Body copy drops to **Open Sans**, humanist and readable, with an unusual global
`word-spacing: 1px` nudge. The single accent color that does *everything* - links, hover states, focus,
tags - is **brand red** `#ea3601`, and its hover/focus treatment is a signature move: not a box-shadow, a
`filter: drop-shadow(0 0 8px #ea3601)` red glow, applied to links, nav items, and buttons alike.

**Key Characteristics:**
- Permanent black canvas (`{colors.black}`) - no light mode, ever.
- Gotham Narrow, weight 800, forced uppercase for every heading level site-wide.
- Open Sans for body copy, nav labels, and buttons' surrounding text.
- One brand accent, `{colors.brand-red}` (`#ea3601`), used for links, tags, and every default button fill.
- Hover/focus feedback is a red glow filter, not a shadow or background shift.
- Default buttons are true pills (`border-radius: 8px/50%`); some promotional hero CTAs override to a
  tight 6px rounded rectangle with a per-product color skin.
- Cards are flat black rectangles at 12px radius; dark "elevated" surfaces get a top-to-black gradient
  border instead of a resting shadow.
- Sticky nav bar, `{colors.header-bg}` (`#0c0f11`, near-black but distinct from pure black), 54px tall.

## Colors

> **Source:** rendered HTML/CSS of `magic.wizards.com/en`, pasted directly by the user (view-source, not a
> screenshot). Hex values below are read from the CSS `:root` block and component classes, not estimated.

### Brand & Accent
- **Brand Red** (`{colors.brand-red}` - `#ea3601`): the entire accent vocabulary. Inline links, nav hover
  glow, tag/badge fills, default button fill.
- **Brand Red Active** (`{colors.brand-red-active}` - `#b93b0d`): `:active` state for links.
- **Brand Orange** (`{colors.brand-orange}` - `#ff6000`): declared alongside brand red in `:root` but not
  observed driving chrome in the captured markup - treat as a secondary/rare accent.
- **Tag Red** (`{colors.tag-red}` - `#e83411`): a close cousin of brand red used specifically for the
  small overlapping category tag on article cards (e.g. "Announcements").

### Surface
- **Black** (`{colors.black}` - `#000000`): the page canvas and the default article-card background.
- **Header Background** (`{colors.header-bg}` - `#0c0f11`): the sticky nav bar - almost black, distinguishable from pure black.
- **Surface Dark** (`{colors.surface-dark}` - `#181818`): round icon button resting fill.
- **Modal Background** (`{colors.modal-bg}` - `#1f2025`): dialogs and CTA popups.
- **Modal Border** (`{colors.modal-border}` - `#35353d`): 2px border on modals.
- **Card Media Background** (`{colors.card-media-bg}` - `rgba(0,0,0,0.88)`): the image slot inside article cards before the image loads.

### Text
- **White** (`{colors.white}`): the default text color on the black canvas (`--base-font-color`).
- **White Alpha 75/55/25/10**: translucent white steps used for secondary text and hairline dividers.
- **Ink on Light** (`{colors.ink-on-light}` - `#222222`): default button label color and text color on the rare light-themed page sections (per-product `textColor` override).

### Per-Product Theme Override
Every set/product page (and the section of the homepage that promotes it) carries its own small palette -
`primaryColor100/200/300`, `accentColor`, `linkColor`, `linkColorActive`, `textColor` - injected as CSS
variables scoped to that section. This is how a *Reality Fracture* hero can use a cool blue-purple button
(`#374683`) while a *Secrets of Strixhaven* hero uses violet (`#6b27b5`) on the same page, without touching
the global brand red. Treat the global brand red as the **only default**; per-product accents are a
deliberate, contained exception for marketing hero bands, not a general chrome color.

## Typography

### Font Families
- **Gotham Narrow** (`--strong-font-family`) - the display/heading face. Declared weights: 500, 600, 800.
  Every `h1`-`h6` on the site renders in Gotham Narrow at weight 800, forced uppercase - this is the
  system's loudest, most consistent rule.
- **Open Sans** (`--base-font-family`) - the body face, falling back to Arial. Declared weights 300/400/600/700/800, plus italics. Carries body copy, nav links, button surrounding text, and footer labels.
- **Beleren** / **Beleren Small Caps** (`--magic-font-family`) - the proprietary in-game card-frame typeface. Declared in `:root` but not observed driving general site chrome in the captured markup; reserved for card-authentic treatments (e.g. card name lockups), not body/heading text.

### Hierarchy

| Token | Size (clamp) | Weight | Transform | Use |
|---|---|---|---|---|
| `{typography.hero-headline}` | 36px → 64px | 800 | uppercase | Homepage hero slide headline |
| `{typography.section-header-lg}` | 36px → 42px | 800 | uppercase | "Latest News", section dividers |
| `{typography.section-header-md}` | 30px → 36px | 800 | uppercase | Sub-section headers |
| `{typography.section-header-sm}` | 24px → 30px | 800 | uppercase | Card-grid headers |
| `{typography.card-title}` | 18px → 24px | 800 | uppercase | Article card titles |
| `{typography.hero-subheader}` | 18px → 30px | 500 | none | Hero supporting line |
| `{typography.body-md}` | 16px | 400 | none | Paragraph copy, 1px word-spacing |
| `{typography.nav-link}` | 14px | 700 | uppercase | Primary nav items |
| `{typography.footer-heading}` | 16px | 700 | uppercase | Footer column headers, with a 22px accent-color underline |
| `{typography.utility-link}` | 12px | 400 | uppercase | Locator/Accounts utility row |
| `{typography.button-label}` | 18px | 600 | none (case set per-button) | CTA button label |

### Principles
Headings are the system's signature: bold (800), condensed (Gotham *Narrow*), and forced uppercase via a
single global CSS rule rather than per-component classes - there is no "light editorial" heading anywhere
on this site, the opposite instinct from a system like PlayStation's. Body copy stays comfortably regular
weight and mixed case for readability, so the loud/quiet contrast between headline and body is the whole
typographic story.

## Layout

### Grid & Container
- Primary content container caps around 1200-1600px depending on section, with 15-20px side gutters (`--container-padding-x`).
- The sticky header uses a 95vw-wide inner container above 1080px, centered nav row, right-aligned utility cluster.
- Section vertical padding scales 30px (mobile) → 40px (tablet) → 60-70px (desktop) per section type.

### Whitespace Philosophy
Sections stack directly on the black canvas with no dividing rule - the next section's own background
(often still black, sometimes a per-product themed band) is the separation. Card grids use a consistent
gutter; hero content is centered or left-aligned in a max-width column depending on per-hero configuration.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 - Flat | No border, no shadow | Default for the black canvas and most cards |
| 1 - Hover glow | `filter: drop-shadow(0 0 8px {accent})` | Links, nav items, and buttons on hover/focus - replaces a resting shadow entirely |
| 2 - Gradient accent border | `border-image: linear-gradient(to top, {accent} 25%, {colors.black} 100%)` | Dark "elevated" product/feature cards |
| 3 - Modal border | 2px solid `{colors.modal-border}` on `{colors.modal-bg}` | Dialogs and CTA popups |

The system has no traditional resting box-shadow anywhere in the captured markup. Depth reads through
color contrast (black canvas vs. slightly-lighter card/modal surfaces) and through the glow filter as the
sole interactive-feedback mechanism.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | Nav bar, hero bands, full-bleed sections |
| `{rounded.card}` | 12px | Article cards, modals |
| `{rounded.card-flush}` | 1.5px | Product-set showcase cards (near-square, card-frame-adjacent) |
| `{rounded.pill}` | `8px/50%` | Default CTA buttons - resolves to a true pill at normal button heights |
| `{rounded.circle}` | 50% | Round icon buttons (social row) |

Two radius instincts coexist: a true pill for buttons (soft, approachable) and near-flat/12px rectangles
for cards and structural surfaces (crisp, editorial). There is no shared "medium" radius bridging them.

## Components

### Buttons

**`button-primary`** - default site-wide CTA
- Background `{colors.brand-red}` (or a per-product accent inside a themed hero), 2px border matching the
  background color, label in `{typography.button-label}`, rounded `{rounded.pill}`.
- Hover/focus: `{component.button-hover-glow}` red drop-shadow filter, no color or shadow change otherwise.
- Active: `transform: translateY(1px)` - a tiny press-down, no color shift.

**`button-secondary`** - outline variant
- Background transparent, 2px border `currentColor`, rounded `{rounded.pill}`.
- Hover: color shifts toward the accent plus the glow filter.

**Promotional hero CTA override** - product-launch buttons on the homepage hero override the pill to a
tight 6px rounded rectangle and take a bespoke background/border color per product (e.g. `#374683` /
`#048e9f` for one set, `#235125` / `#eecb62` for another). Treat this as a contained, per-campaign
exception, not the default button shape.

### Cards

**`article-card`** - news/story card
- Background `{colors.black}`, rounded `{rounded.card}`, 16:9 image slot on top, content below with a
  small uppercase tag badge overlapping the image/content seam.

**`dark-card-accent-border`** - elevated dark feature card
- 1px border using a top-to-black gradient of the page's accent color - the closest thing this system has
  to a glow-on-rest treatment, reserved for a handful of feature panels.

### Navigation

**`nav-bar`**
- Background `{colors.header-bg}` (`#0c0f11`), height `{spacing.header-height}` (54px), sticky.
- Logo far-left (~115px wide), centered nav row in `{typography.nav-link}` with mega-menu dropdowns, right
  utility cluster (Locator, Card Database, Accounts) in `{typography.utility-link}`.
- Mobile: hamburger left, logo centered, nav collapses into a drawer.

### Tags / Badges

**`tag-badge`**
- Background `{colors.tag-red}`, uppercase, bold, `0.2em` letter-spacing, small padding, positioned
  absolutely so it overlaps the top edge of its parent card by half its own height.

### Round Icon Buttons

**`round-icon-button`**
- Circular, `{colors.surface-dark}` resting fill, white icon, three sizes (40/50/60px). Used for the
  footer social row.

## Do's and Don'ts

### Do
- Keep the canvas black (`{colors.black}`) everywhere - this is not a light/dark toggle, it's the brand.
- Force headings to `{typography.hero-headline}`-family styling: Gotham-Narrow-equivalent, weight 800,
  uppercase, applied globally rather than per-component.
- Use the red glow filter (`{component.button-hover-glow}`) for every hover/focus state instead of a
  resting shadow.
- Default every button to a true pill (`{rounded.pill}`); reserve rectangular CTAs for one-off promo
  moments, if at all.
- Reserve `{colors.brand-red}` as the *only* general-purpose accent color. Per-product theme colors are
  scoped strictly to that product's own hero/CTA, never bled into global chrome.

### Don't
- Don't add a light-mode variant. The system has none.
- Don't use box-shadow for elevation or hover feedback - use the drop-shadow glow filter instead.
- Don't soften headings to mixed case or a lighter weight - the all-caps 800-weight bark is the brand
  voice, the opposite instinct from an airy/light editorial system.
- Don't invent a "medium" border radius between the button pill and the card's 12px rectangle - the system
  deliberately has just those two shape languages.

## Application Note: Mana Color Identity (app-specific, not from the source site)

magic.wizards.com's own chrome never uses the five Commander colors (White/Blue/Black/Red/Green) as UI
accents - that's a marketing site, not a deck-building tool. This app's WUBRG mana-color system (pip icons
on mana costs, the color-identity dot row on decks/commanders, and the navbar's five-color stripe) is
functional, game-information encoding that predates and sits independently of this chrome redesign. When
applying the tokens above, keep the WUBRG components exactly as they are - they are a deliberate, retained
accent layer on top of the black/red/Gotham-Narrow system, not a conflict with it.

## Known Gaps

- **No light-mode capture** - the site has none; this app now follows suit and drops its previous
  light/dark toggle in favor of the permanent black canvas.
- **Per-product theme overrides** were observed (each set/page injects its own `primaryColor`/`accentColor`
  pair) but only a few examples were captured; the app has no equivalent per-page theming and uses the
  single global brand red throughout.
- **Promotional CTA skins** (`cta--comic`, `cta--hobbit`, `cta--trk` classes seen in the CSS) are one-off
  crossover-product button skins, not part of the general system, and are intentionally not adopted here.
- **Beleren / Beleren Small Caps** (the in-game card-frame font) is declared but its actual usage on the
  captured pages wasn't visible in the markup - not adopted for this app's chrome.
