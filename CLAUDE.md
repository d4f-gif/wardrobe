# CLAUDE.md: Wardrobe repo

Zero-token daily outfit recommender. `README.md` explains the design. The app
is pure local HTML/JS (`webapp/index.html`, opened via file://) + Open-Meteo.

## Cataloging workflow (the only step that uses tokens)

When the user says "catalog the new clothes" (or similar):

1. `ls closet/photos/` and Read the new image files (multiple photos are
   multiple angles of the same piece; group them visually and/or by filename).
2. For each piece, draft a catalog entry following the schema documented at the
   top of `closet/catalog.js`. Judgment calls that matter:
   - `warmth` 1-5 and `formality` 1-5 matter most to the scoring; calibrate
     against existing entries.
   - `colors` must use names present in `COLORS` in `webapp/engine.js`
     (add a new color there if needed), primary color first.
   - `pattern` and `material` must use values known to the engine's
     `PATTERN_BOLDNESS` and material rules where possible.
   - Reuse `set:` tags for pieces meant to be worn together (suits).
3. **Show the proposed entries to the user and wait for greenlight** (their
   global rules require this), then append to the `CATALOG` array in
   `closet/catalog.js`.
4. When a real item covers what a `sample: true` placeholder stood in for,
   propose deleting that sample entry.
5. Run `node test/engine-test.js` (should pass; sample-dependent checks may
   need updating once samples are gone).
6. Commit and push (standing git rule: small chunks, message says why).

## Constraints

- Never send catalog photos anywhere; Claude reads them locally once, and the
  engine reads only the text catalog afterwards.
- `index.html` runs over file://, so the catalog stays a `.js` global (not
  fetched JSON) and photos load by relative path.
- Location is hardcoded to Washington, DC in `webapp/app.js` (`LOCATION`).
