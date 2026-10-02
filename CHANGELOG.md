# Changelog

v1.5.2 is the first public release. Earlier versions were internal builds, and their notes are kept below.

## v1.5.2
- Fixed: quote styling and "Remove Quotes" did nothing for curly quotes (“ ”) in v1.5 and v1.5.1.
- Fixed: a `Página` page marker wasn't recognized.
- Added: `***bold-italic***` also gets the dark quote red on color pages.
- Changed: text boxes are a bit wider (at least 12% of the page width, 6% on spreads), so English wraps in fewer lines.
- Added: a built-in sample style set for the JoJolion demo pages (p169 and p189).

## v1.5.1
- Faster: placing each layer on its OCR box is cheaper, about 45 seconds less per chapter. A bubble can now sit up to half a pixel off center.

## v1.5
- About 10x faster: a 43-page chapter went from 27 minutes to about 3.5. The output is the same.
- Fixed: fonts with unusual names (like `CCLegendaryLegerdemainLeggy-Reg`) were silently replaced by Myriad Pro. They're found now, and fonts that really are missing are listed at the top of the log.
- Fixed: Esc could be ignored and not stop the batch.
- Fixed: a word like "página 12" inside dialogue could claim that page. Page markers must now start the line, and numbers inside `[notes]` are ignored.
- Changed: speaker tags match style names in any letter case (`sfx:` finds `SFX`).
- Changed: every layer gets the same paragraph settings, no longer depending on Photoshop's Paragraph panel.

## v1.4
- Added: Bouncy SFX toggle (on by default).
- Added: double-page spreads work with single-page OCR.
- Fixed: Esc now stops the whole batch instead of only skipping the current page.
- Fixed: asterisks used as censorship (`****Tok`) or note markers (`Pachinko*`) were being eaten.
- Changed: simpler, faster centering that also works on thin vertical bubbles.
- Changed: Markdown follows clearer rules (see the README).

## v1.3.5
- Added: Cancel button and placement mode on the progress window.
- Added: a single `.json` next to the script loads automatically (the **Prefer folder JSON** checkbox switches back).
- Fixed: dialogue with a colon (`12:00`, `3:1`) was mistaken for a speaker tag.
- Changed: Smart Sizing retuned for real dialogue lengths (`MAX_CHAR` 200 to 50), and sizes snap to 0.25 steps (`SIZE_STEP`).

## Older versions
- **v1.3.4:** progress window during batch runs.
- **v1.3.3:** point-text speakers are configurable (`pointTextRegex`).
- **v1.3.2:** pages with no match in the txt are logged instead of silently skipped, CSV matching ignores `[bracket tags]` in filenames, and the script no longer leaves Photoshop stuck in pixel units if it crashes.
- **v1.3.1:** one failing page no longer aborts the whole batch, and bad colors fall back to black.
- **v1.3:** fixed overlapping text on the grid with 16+ lines, and added a minimum bubble size.
- **v1.2:** added the dialog with most settings and extra styles.
- **v1.1:** text centered on the OCR boxes, OpenType features, `[STROKE]` and quote styling.
- **v1.0:** first version.
