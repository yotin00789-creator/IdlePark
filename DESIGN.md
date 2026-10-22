# Design

Documents the visual system as built (TailAdmin tokens in `src/index.css`). Product truth lives in PRODUCT.md; surface strategy in `.impeccable/surfaces/app.md`.

## Overview
IdlePark: a quiet household ledger on warm paper: white cards, ink black and road-marking gold (from the logo), thin 1px borders, restrained shadow. Mode: Operate. The user pinned the aesthetic (TailAdmin minimal, small frameless line icons, IBM Plex Sans Thai); nothing here tries to look like a parking-lot console.

## Colors
Tokens only, never raw hex in markup.
- Brand `brand-500` is ink (#17191c): primary buttons, selected nav item. `gold-400` (#f2c200) is the accent: the bar beside the current menu item, focus ring, chart series, hero frame. Links use `link` (bronze #8a6700, readable on paper). The dark theme swaps `brand` to gold and `on-brand` to ink (text on gold fills is `text-on-brand`).
- Status: `success` (paid in full), `warning` (partial / long-term attention), `error` (zero, overdue, negative amounts), `gray` for empty and future cells.
- Surfaces: `gray-50` (warm paper #f6f4f0) canvas, `white` cards (`dark:bg-white/3` on `gray-900`), borders `gray-200` / `gray-800`.
- Text: `gray-800` titles, `gray-700` body, `gray-500` secondary (AA on white), `gray-400` only in dark mode.
- Money: negative is red with a real minus sign (−), positive balances green only where a sign matters.

## Typography
IBM Plex Sans Thai 400 / 500 / 600, self-hosted via @fontsource. 14px base on desktop (`text-theme-sm`), 16px inputs on phones (prevents iOS zoom). Money uses `tabular-nums` (`.num`) and is right-aligned. Sentence case, no kickers above headings, no all-caps.

## Elevation and shape
Cards `rounded-2xl` + 1px border (no shadow); controls `rounded-lg`; sheets slide from the bottom on phones and from the side on desktop. `shadow-theme-xs` only on inputs and outline buttons.

## Icons
Own set in `src/icons/ui-*.svg`: 24px viewBox, 1.5 stroke, `currentColor`, rendered at 16–18px, **never inside a tinted square or circle**. Icon-only buttons are ghost buttons (`IconButton`) with an accessible name.

## Signature elements
1. **Plate chip** (`PlateChip`): the car number as a small licence-plate label. Used wherever a vehicle is named.
2. **Month strip** (`MonthStrip`): 12 small bars per car (green paid, amber partial, red zero, gray empty).

## Components
`Button` (primary / outline / ghost / danger, 44px on phones), `IconButton`, `Field` (`TextField`, `SelectField`, `TextAreaField`, `Toggle`), `Sheet`, `ConfirmDialog`, `Toaster`, `Card`, `PageHeader`, `Baht`, `EditableCell` (spreadsheet-like money cell), `FormulaPopover`, `OtpInput`, `UserAvatar`.

## Do
- Show empty (`—`) differently from `0`.
- Pair every colour state with text or a mark (legend, "0", dotted underline, "จ่ายล่วงหน้า").
- Keep tables inside their own scroll region; pin the first two columns and the header.

## Don't
- No coloured side borders, gradient text, glass, or decorative modals for form work.
- No hero-metric grids of identical cards; the dashboard's key figures share one card with unequal weights.
- No occupancy or "parked / not parked" language: the lot is rented by the month.
