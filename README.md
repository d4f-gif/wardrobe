# Wardrobe: what to wear today

A zero-token daily outfit recommender. Open `webapp/index.html` in a browser,
pick the occasion (Work / School / Kids event), and it recommends layered
outfits from your own closet based on live Washington, DC weather.

## How it works

- **Daily use costs zero tokens.** The page fetches the forecast from the free
  Open-Meteo API (no key needed) and runs a local rules engine. It makes no AI
  calls.
- **Cataloging costs tokens once per item.** Drop photos (several angles per
  piece, low quality is fine) into `closet/photos/`, then ask Claude to
  "catalog the new clothes." Claude looks at the photos once and appends a
  structured text entry to `closet/catalog.js`. After that the photos never
  reach a model again; the app reads only the text catalog.

## The rules engine (`webapp/engine.js`)

Every feasible combination of bottom + base + optional mid + optional outer +
footwear is scored on six dimensions:

1. **Warmth fit.** Feels-like temperature bands set a layering target;
   morning-to-afternoon swings add a "shed-able layer" requirement.
2. **Formality.** Each occasion has a dress-code band (work is business casual,
   configurable in `OCCASIONS`); outfits lose points for pieces outside the
   band and for mixing distant dress levels.
3. **Color harmony.** A 12-step color wheel plus neutral and earth-tone
   handling: neutrals go with everything, one accent is classic, analogous
   colors score well, clashing mid-distance hues and 3+ competing accents lose
   points; bonuses for tonal outfits and brown shoes with navy or gray.
4. **Pattern mixing.** At most one bold pattern; two different patterns pass in
   casual settings, same-pattern pairs and graphic pieces at work do not.
5. **Material and season.** Linen in heat, wool/flannel/cashmere in cold, a
   denim-on-denim penalty, water-resistant outers and no suede when rain is
   likely.
6. **Variety.** Outfits you logged (the "I'm wearing this" button) demote
   those pieces for the next three days.

The top pick plus up to four diverse alternatives appear with a "why this
works" explanation drawn from whichever rules fired.

## Layout

```
webapp/     index.html + engine.js (scoring) + app.js (UI, weather) + style.css
closet/     catalog.js (the structured closet) + photos/ (your item photos)
test/       engine-test.js, run with `node test/engine-test.js`
```

Sample clothes (flagged `sample: true` in the catalog) make the app work out of
the box; they get deleted as the real closet fills in.
