/* engine-test.js — smoke tests for the outfit engine over the sample catalog.
   Run: node test/engine-test.js */

'use strict';

const ENGINE = require('../webapp/engine.js');
const CATALOG = require('../closet/catalog.js');

const SCENARIOS = {
  'hot July':        { feelsMorning: 84, feelsPeak: 104, rainProb: 10, windMax: 8 },
  'mild April':      { feelsMorning: 52, feelsPeak: 68,  rainProb: 15, windMax: 10 },
  'cool October':    { feelsMorning: 48, feelsPeak: 58,  rainProb: 20, windMax: 12 },
  'cold rainy Jan':  { feelsMorning: 30, feelsPeak: 38,  rainProb: 75, windMax: 18 },
  'freezing snap':   { feelsMorning: 12, feelsPeak: 24,  rainProb: 5,  windMax: 22 },
};

let failures = 0;
function check(cond, label) {
  if (!cond) { failures++; console.error(`  ✗ FAIL: ${label}`); }
}

const describe = o => o.items.map(it => it.name).join(' + ');

for (const [name, wx] of Object.entries(SCENARIOS)) {
  for (const occ of ['work', 'school', 'kids']) {
    const { plan, outfits, missing } = ENGINE.generateOutfits(CATALOG, wx, occ);
    console.log(`\n${name} / ${occ} (${plan.label}):`);
    check(!missing, `no missing slots (got: ${missing})`);
    check(outfits.length >= 3, `>=3 outfits generated (got ${outfits.length})`);
    if (!outfits.length) continue;
    const top = outfits[0];
    console.log(`  → ${describe(top)}  [score ${top.score.toFixed(1)}]`);
    for (const r of top.reasons.slice(0, 3)) console.log(`     · ${r}`);

    // required slots always present
    check(top.slots.base && top.slots.bottom && top.slots.footwear, 'base/bottom/footwear present');
    // hot day → no mid or outer layer
    if (wx.feelsPeak >= 85 && wx.rainProb < 50)
      check(!top.slots.mid && !top.slots.outer, 'no extra layers in the heat');
    // cold day → outer layer required
    if (wx.feelsPeak < 50)
      check(!!top.slots.outer, 'outer layer present in the cold');
    // heavy rain → water-resistant outer or no suede, at minimum no suede shoes
    if (wx.rainProb >= 60)
      check(top.slots.footwear.material !== 'suede', 'no suede shoes in heavy rain');
    // no two bold same-type patterns in the top pick
    const bold = top.items.filter(it => (ENGINE.PATTERN_BOLDNESS[it.pattern] || 0) >= 2).map(it => it.pattern);
    check(new Set(bold).size === bold.length, 'no duplicate bold patterns');
    // formality within band (with the engine's 1-point slack)
    const band = ENGINE.OCCASIONS[occ].band;
    check(top.items.every(it => it.formality >= band[0] - 1 && it.formality <= band[1] + 1),
      'all items within formality band');
    // top outfits are diverse
    if (outfits.length >= 2) {
      const ids = new Set(outfits[0].items.map(it => it.id));
      const shared = outfits[1].items.filter(it => ids.has(it.id)).length;
      check(shared <= 2, `alternative differs from top pick (shares ${shared})`);
    }
  }
}

// variety: an item worn yesterday should be demoted
{
  const wx = SCENARIOS['mild April'];
  const fresh = ENGINE.generateOutfits(CATALOG, wx, 'work');
  const wornYesterday = Object.fromEntries(fresh.outfits[0].items.map(it => [it.id, 1]));
  const next = ENGINE.generateOutfits(CATALOG, wx, 'work', wornYesterday);
  const overlap = next.outfits[0].items.filter(it => wornYesterday[it.id]).length;
  console.log(`\nvariety: yesterday's pick had ${fresh.outfits[0].items.length} items; today's top repeats ${overlap}`);
  check(overlap < fresh.outfits[0].items.length, 'variety penalty changes the pick');
}

console.log(failures === 0 ? '\nAll checks passed ✓' : `\n${failures} check(s) FAILED ✗`);
process.exit(failures === 0 ? 0 : 1);
