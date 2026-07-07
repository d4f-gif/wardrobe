# CLAUDE.md: Wardrobe repo

Zero-token daily outfit recommender. `README.md` explains the design. Pure
static site (GitHub Pages at https://d4f-gif.github.io/wardrobe/, public repo
under the separate `d4f-gif` account so it never shows on the yutingf
profile; yutingf has admin collaborator access for pushes) + Open-Meteo +
in-browser CLIP cataloging.

## How clothes get cataloged

Primary path (zero tokens, no Claude involved): the user photographs clothes
in the Add clothes tab; `webapp/cataloger.js` removes backgrounds (RMBG-1.4),
splits multi-piece photos into one garment each, renders product-style shots
(cutout on white, straightened, light corrected), groups angles with CLIP,
and drafts category/pattern/material (color comes from garment pixels with a
saturation guard); the user corrects and saves. Items and photos persist in
the browser's IndexedDB on that device only. Photos never reach the repo or
any server. `CATALOGER._internals` exposes the pipeline stages for headless
tests. Known test artifact: a synthetic collage of pasted rectangular photos
keeps each rectangle's internal background (RMBG sees the rectangle as the
object); real photos of garments on a surface segment cleanly.

Fallback path (tokens, once per item): the user can still hand Claude photos
to catalog. Then follow: propose entries matching the schema at the top of
`closet/catalog.js` (colors from `COLORS` in `webapp/engine.js`, patterns
from `PATTERN_BOLDNESS`, `set:` tags for suits), show them, wait for
greenlight, append to the `CATALOG` array, run `node test/engine-test.js`,
commit and push. Committed entries sync via git and show on every device;
IndexedDB entries do not.

## Maintenance rules

- Every deploy bumps BOTH the `?v=` on the script tags in `webapp/index.html`
  and the `bNN` build tag in the header. Phones cache aggressively; a user
  reporting "the fix did not work" is running a stale build until proven
  otherwise (ask for the build tag).
- `webapp/label-embeds.json` ships precomputed CLIP text embeddings so phones
  never load the text model. REGENERATE it whenever CATEGORY_LABELS,
  PATTERN_LABELS, MATERIAL_LABELS, CLASS_CATS, or TEMPLATES change in
  `webapp/cataloger.js` (headless generator pattern: session scratchpad
  `genembeds2.py`; keep its hardcoded lists in sync). A length mismatch makes
  phones silently fall back to the on-device text model, which crashes them.
- The vision pipeline runs in `webapp/analysis-worker.js`, a fresh module
  worker per analysis, terminated on completion: that is the only way wasm
  memory returns to the OS. Keep cataloger.js worker-safe: no `document`
  (use `makeCanvas`), no `localStorage` (use the `store` shim), globals via
  `self`.

## Constraints

- Photos taken in the app stay in IndexedDB; never suggest committing them.
  The repo is public, so anything committed (including `closet/photos/`) is
  visible to anyone.
- The site must keep working over plain file:// for the Today tab, so
  `catalog.js` stays a `.js` global (not fetched JSON). The Add clothes tab
  needs https (camera + CDN model): use the Pages URL.
- Sample items (`sample: true`) hide automatically per layer once the user has
  a real item in that layer; delete a sample from `catalog.js` only when asked.
- Location is hardcoded to Washington, DC in `webapp/app.js` (`LOCATION`).
- Engine limitation, deliberate: dresses map to layer "base" and the engine
  still requires a bottom, so dress-based outfits are not supported yet.
