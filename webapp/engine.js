/* engine.js — outfit recommendation engine.
   Pure logic, no DOM, no network. Runs in the browser (script tag) and in Node (require).
   Scores every feasible combination on warmth fit, formality, color harmony,
   pattern mixing, material/season fit, and recent-wear variety. */

'use strict';

// ---------------------------------------------------------------- occasions

const OCCASIONS = {
  work:   { key: 'work',   label: 'Work',       band: [2.5, 4.5], sweet: 3.5 },
  school: { key: 'school', label: 'School',     band: [1.5, 3.5], sweet: 2.5 },
  kids:   { key: 'kids',   label: 'Kids event', band: [1.0, 3.0], sweet: 2.0 },
};

// ---------------------------------------------------------------- color

// hue: position 0–11 on a 12-step color wheel (red=0 … pink=11).
// neutral: goes with everything. earth: semi-neutral, pairs widely but warm.
const COLORS = {
  black: { neutral: true }, white: { neutral: true }, gray: { neutral: true },
  grey: { neutral: true }, charcoal: { neutral: true }, silver: { neutral: true },
  cream: { neutral: true }, ivory: { neutral: true }, 'off-white': { neutral: true },
  beige: { neutral: true, earth: true }, tan: { neutral: true, earth: true },
  khaki: { neutral: true, earth: true }, stone: { neutral: true, earth: true },
  taupe: { neutral: true, earth: true },
  navy: { neutral: true, hue: 8 }, denim: { neutral: true, hue: 8 },
  indigo: { neutral: true, hue: 8 },
  brown: { earth: true, hue: 1 }, camel: { earth: true, hue: 1 },
  chocolate: { earth: true, hue: 1 }, cognac: { earth: true, hue: 1 },
  rust: { earth: true, hue: 1 }, terracotta: { earth: true, hue: 1 },
  burgundy: { earth: true, hue: 0 }, maroon: { earth: true, hue: 0 },
  wine: { earth: true, hue: 0 },
  olive: { earth: true, hue: 4 }, forest: { earth: true, hue: 4 },
  sage: { earth: true, hue: 4 }, mustard: { earth: true, hue: 2 },
  red: { hue: 0 }, coral: { hue: 0 }, salmon: { hue: 0 },
  orange: { hue: 1 }, peach: { hue: 1 },
  yellow: { hue: 2 }, gold: { hue: 2 },
  lime: { hue: 3 }, green: { hue: 4 }, mint: { hue: 4 },
  teal: { hue: 5 }, turquoise: { hue: 5 },
  'light blue': { hue: 6 }, 'sky blue': { hue: 6 }, 'baby blue': { hue: 6 },
  blue: { hue: 7 }, 'royal blue': { hue: 7 }, cobalt: { hue: 7 },
  purple: { hue: 9 }, violet: { hue: 9 }, lavender: { hue: 9 },
  magenta: { hue: 10 }, fuchsia: { hue: 10 },
  pink: { hue: 11 }, blush: { hue: 11 }, rose: { hue: 11 },
};

function colorInfo(name) {
  return COLORS[String(name || '').toLowerCase().trim()] || { hue: null, unknown: true };
}

function hueDistance(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 12 - d);
}

// Pairwise harmony between two items' primary colors.
function colorPairScore(nameA, nameB) {
  const a = colorInfo(nameA), b = colorInfo(nameB);
  if (a.neutral && b.neutral) {
    const pair = [nameA, nameB].map(s => String(s).toLowerCase()).sort().join('+');
    if (pair === 'black+brown') return { s: -1.5, warn: 'black with brown is a tricky combo' };
    if (pair === 'black+navy') return { s: -0.5, warn: 'black next to navy can read as mismatched' };
    return { s: 1.5 };
  }
  if (a.neutral || b.neutral) return { s: 1.5 };
  if (a.earth && b.earth) return { s: 1.0, why: 'earth tones sit naturally together' };
  if (a.hue == null || b.hue == null) return { s: 0 };
  const d = hueDistance(a.hue, b.hue);
  if (d === 0) return { s: -0.5 }; // same family, non-neutral — matchy (tonal bonus may offset)
  if (d <= 2) return { s: 1.0, why: 'analogous colors, easy on the eye' };
  if (d <= 4) return { s: -1.5, warn: 'these two colors sit awkwardly together' };
  return { s: 0.3, why: 'complementary contrast, a deliberate statement' };
}

function scoreColors(items, occ, out) {
  let s = 0;
  const primaries = items.map(it => ({ it, name: (it.colors && it.colors[0]) || 'gray' }));
  // pairwise harmony over primary colors
  for (let i = 0; i < primaries.length; i++) {
    for (let j = i + 1; j < primaries.length; j++) {
      const r = colorPairScore(primaries[i].name, primaries[j].name);
      // shoes weigh a bit less in the palette
      const w = (primaries[i].it.layer === 'footwear' || primaries[j].it.layer === 'footwear') ? 0.6 : 1;
      s += r.s * w;
      if (r.warn) out.warnings.push(r.warn);
      else if (r.why && !out.reasons.includes(r.why)) out.reasons.push(r.why);
    }
  }
  // accent budget: count distinct non-neutral, non-earth hue families across ALL listed colors
  const accentHues = new Set();
  for (const it of items) {
    for (const c of it.colors || []) {
      const info = colorInfo(c);
      if (!info.neutral && !info.earth && info.hue != null) accentHues.add(info.hue);
    }
  }
  if (accentHues.size === 0) { s += 0.5; out.reasons.push('clean neutral palette, hard to get wrong'); }
  else if (accentHues.size === 1) { s += 1.0; out.reasons.push('one accent color against neutrals, a classic'); }
  else if (accentHues.size >= 3) { s -= 2 * (accentHues.size - 2); out.warnings.push('too many competing colors'); }
  // tonal / monochrome bonus
  const fams = primaries.map(p => {
    const i = colorInfo(p.name);
    return i.neutral && i.hue == null ? 'achromatic' : i.hue;
  });
  if (new Set(fams).size === 1) { s += 1.0; out.reasons.push('tonal outfit, one palette head to toe'); }
  // classic groundings
  const shoe = items.find(it => it.layer === 'footwear');
  if (shoe && ['brown', 'cognac', 'tan', 'camel'].includes(String((shoe.colors || [])[0]).toLowerCase())) {
    const rest = primaries.filter(p => p.it !== shoe).map(p => String(p.name).toLowerCase());
    if (rest.some(c => ['navy', 'gray', 'grey', 'charcoal', 'olive', 'denim'].includes(c))) {
      s += 0.7; out.reasons.push('brown leather grounds the cool palette');
    }
  }
  return s;
}

// ---------------------------------------------------------------- pattern

// 0 solid · 1 subtle texture · 2 moderate pattern · 3 bold pattern
const PATTERN_BOLDNESS = {
  solid: 0, none: 0,
  texture: 1, 'cable-knit': 1, herringbone: 1, pinstripe: 1, melange: 1, ribbed: 1, waffle: 1,
  stripe: 2, striped: 2, 'polka-dot': 2, gingham: 2, check: 2, houndstooth: 2, 'micro-print': 2,
  plaid: 3, floral: 3, graphic: 3, print: 3, paisley: 3, camo: 3, 'color-block': 3, 'animal-print': 3,
};

function boldness(it) {
  const b = PATTERN_BOLDNESS[String(it.pattern || 'solid').toLowerCase()];
  return b == null ? 2 : b;
}

function scorePatterns(items, occ, out) {
  let s = 0;
  const patterned = items.filter(it => boldness(it) >= 2);
  const subtle = items.filter(it => boldness(it) === 1);
  s += subtle.length * 0.15; // texture adds quiet depth
  if (patterned.length === 0) s += 0.3;
  else if (patterned.length === 1) {
    s += 0.8;
    out.reasons.push(`the ${patterned[0].pattern} ${patterned[0].category} is the outfit's focal point`);
  } else if (patterned.length === 2) {
    const [p, q] = patterned;
    if (String(p.pattern).toLowerCase() === String(q.pattern).toLowerCase()) {
      s -= 3; out.warnings.push(`two ${p.pattern} pieces compete with each other`);
    } else if (occ.sweet <= 2.5) {
      s -= 0.5; // pattern mixing is playful in casual settings
    } else {
      s -= 2; out.warnings.push('mixed patterns read busy for this setting');
    }
  } else {
    s -= 4; out.warnings.push('too many patterns at once');
  }
  // graphic pieces are weekend-only
  if (items.some(it => String(it.pattern).toLowerCase() === 'graphic') && occ.sweet >= 3) {
    s -= 1.5; out.warnings.push('graphic pieces are too casual here');
  }
  return s;
}

// ---------------------------------------------------------------- material & season

const HOT = 78, COLD = 45;

function scoreMaterials(items, wx, out) {
  let s = 0;
  const mat = it => String(it.material || '').toLowerCase();
  if (wx.feelsPeak >= HOT) {
    for (const it of items) {
      const m = mat(it);
      if (['linen', 'seersucker'].includes(m)) { s += 1.0; out.reasons.push(`${m} breathes in the heat`); }
      else if (['chambray', 'cotton'].includes(m)) s += 0.3;
      else if (['flannel', 'fleece'].includes(m)) { s -= 2.5; out.warnings.push(`${m} is too heavy for this heat`); }
      else if (['wool', 'cashmere'].includes(m)) s -= 1.5;
      else if (m === 'down') s -= 3;
      else if (m === 'leather' && it.layer === 'outer') s -= 1.5;
    }
  } else if (wx.feelsPeak <= COLD) {
    let cozy = 0;
    for (const it of items) {
      const m = mat(it);
      if (['wool', 'cashmere', 'flannel', 'down', 'fleece', 'shearling'].includes(m)) cozy += 0.8;
      if (m === 'linen') { s -= 2.5; out.warnings.push('linen has no place in this cold'); }
    }
    s += Math.min(cozy, 2);
    if (cozy >= 1.6) out.reasons.push('insulating fabrics where they count');
  }
  // denim on denim
  const denimTop = items.some(it => it.layer !== 'bottom' && it.layer !== 'footwear' && mat(it) === 'denim');
  const denimBottom = items.some(it => it.layer === 'bottom' && mat(it) === 'denim');
  if (denimTop && denimBottom) { s -= 2.5; out.warnings.push('denim-on-denim is hard to pull off'); }
  // rain
  if (wx.rainProb >= 40) {
    const outer = items.find(it => it.layer === 'outer');
    if (outer && outer.waterResistant) { s += 1.5; out.reasons.push('water-resistant outer layer for the likely rain'); }
    for (const it of items) {
      if (mat(it) === 'suede') { s -= 2; out.warnings.push(`suede ${it.category} will suffer in the rain`); }
      if (mat(it) === 'canvas' && it.layer === 'footwear') s -= 1;
    }
  }
  return s;
}

// ---------------------------------------------------------------- formality

function scoreFormality(items, occ, out) {
  let s = 0;
  const fs = items.map(it => it.formality ?? 2.5);
  const [lo, hi] = occ.band;
  for (let i = 0; i < items.length; i++) {
    const d = fs[i] < lo ? lo - fs[i] : fs[i] > hi ? fs[i] - hi : 0;
    s -= 1.2 * d;
  }
  const avg = fs.reduce((a, b) => a + b, 0) / fs.length;
  s -= 0.8 * Math.abs(avg - occ.sweet);
  const spread = Math.max(...fs) - Math.min(...fs);
  if (spread > 1.5) { s -= (spread - 1.5) * 1.5; out.warnings.push('pieces span very different dress levels'); }
  // matched sets (e.g. a suit) worn together
  const sets = {};
  for (const it of items) if (it.set) sets[it.set] = (sets[it.set] || 0) + 1;
  if (Object.values(sets).some(n => n >= 2)) { s += 1; out.reasons.push('matched set worn as intended'); }
  if (items.some(it => it.category === 'sneakers') && avg > 3.5) s -= 0.5;
  return s;
}

// ---------------------------------------------------------------- warmth & weather

// Turn the day's weather into a layering plan.
function weatherPlan(wx) {
  const p = wx.feelsPeak;
  let plan;
  if (p >= 85)      plan = { target: 1.0, allowMid: false, allowOuter: false, label: 'hot' };
  else if (p >= 75) plan = { target: 1.5, allowMid: false, allowOuter: false, label: 'warm' };
  else if (p >= 63) plan = { target: 3.0, allowMid: true,  allowOuter: true,  label: 'mild' };
  else if (p >= 50) plan = { target: 4.5, allowMid: true,  allowOuter: true,  label: 'cool' };
  else if (p >= 38) plan = { target: 6.5, allowMid: true,  allowOuter: true,  requireOuter: true, label: 'cold' };
  else              plan = { target: 8.5, allowMid: true,  allowOuter: true,  requireOuter: true, label: 'freezing' };
  plan.notes = [];
  // a rain shell is always allowed if it's likely to pour
  if (wx.rainProb >= 50 && !plan.allowOuter) {
    plan.allowOuter = true; plan.shellOnly = true;
    plan.notes.push('carry a rain layer or umbrella; high chance of rain');
  } else if (wx.rainProb >= 50) {
    plan.notes.push('take an umbrella; high chance of rain');
  }
  const swing = wx.feelsPeak - wx.feelsMorning;
  if (swing >= 15 && wx.feelsMorning < 62) {
    plan.wantRemovable = true;
    plan.notes.push(`${Math.round(wx.feelsMorning)}°F in the morning but ${Math.round(wx.feelsPeak)}°F later; wear a layer you can shed`);
  }
  if (wx.windMax >= 20) plan.notes.push('windy; a wind-blocking layer beats an extra knit');
  plan.shortsOK = p >= 76;
  plan.scarfWeather = wx.feelsMorning <= 40;
  return plan;
}

function scoreWarmth(slots, plan, out) {
  const upper = (slots.base.warmth || 1) + (slots.mid ? slots.mid.warmth : 0) + (slots.outer ? slots.outer.warmth : 0);
  const bottomAdj = 0.5 * ((slots.bottom.warmth || 2) - 2);
  const diff = Math.abs(upper + bottomAdj - plan.target);
  let s = -1.3 * Math.max(0, diff - 0.75);
  if (diff <= 0.75) out.reasons.push(`layers sized right for a ${plan.label} day`);
  if (plan.wantRemovable && (slots.mid || slots.outer)) { s += 0.5; out.reasons.push('includes a shed-able layer for the temperature swing'); }
  if (plan.wantRemovable && !slots.mid && !slots.outer) s -= 1;
  return s;
}

// ---------------------------------------------------------------- variety

// recentWear: { itemId: daysAgo } from the app's history.
function scoreVariety(items, recentWear, out) {
  let s = 0;
  for (const it of items) {
    const d = recentWear && recentWear[it.id];
    if (d === 1) s -= 1.2;
    else if (d === 2) s -= 0.8;
    else if (d === 3) s -= 0.4;
  }
  if (s <= -2) out.warnings.push('several pieces were worn in the last few days');
  return s;
}

// ---------------------------------------------------------------- generation

function inBand(it, occ, slack = 1) {
  const f = it.formality ?? 2.5;
  return f >= occ.band[0] - slack && f <= occ.band[1] + slack;
}

// Cheap per-item score used to prune each slot's candidate list.
function itemPreScore(it, occ, plan, recentWear) {
  let s = -Math.abs((it.formality ?? 2.5) - occ.sweet);
  const m = String(it.material || '').toLowerCase();
  if (plan.label === 'hot' || plan.label === 'warm') {
    if (['linen', 'seersucker', 'cotton', 'chambray'].includes(m)) s += 0.5;
    if (['wool', 'flannel', 'cashmere', 'fleece', 'down', 'leather'].includes(m)) s -= 1;
  }
  if ((plan.label === 'cold' || plan.label === 'freezing') &&
      ['wool', 'cashmere', 'flannel', 'down', 'fleece'].includes(m)) s += 0.5;
  const d = recentWear && recentWear[it.id];
  if (d === 1) s -= 1; else if (d === 2) s -= 0.5;
  return s;
}

function candidates(catalog, layer, occ, plan, recentWear, cap = 14) {
  let list = catalog.filter(it => it.layer === layer && inBand(it, occ));
  if (layer === 'bottom' && !plan.shortsOK) list = list.filter(it => it.category !== 'shorts');
  if (layer === 'bottom' && plan.shortsOK && occ.sweet > 2.5) list = list.filter(it => it.category !== 'shorts');
  if (layer === 'outer' && plan.shellOnly) list = list.filter(it => it.waterResistant);
  if (layer === 'base' && plan.target <= 1.5) list = list.filter(it => (it.warmth || 1) <= 2);
  list.sort((a, b) => itemPreScore(b, occ, plan, recentWear) - itemPreScore(a, occ, plan, recentWear));
  return list.slice(0, cap);
}

function scoreOutfit(slots, occ, plan, wx, recentWear) {
  const items = [slots.bottom, slots.base, slots.mid, slots.outer, slots.footwear].filter(Boolean);
  const out = { reasons: [], warnings: [] };
  let score = 0;
  score += scoreWarmth(slots, plan, out);
  score += scoreFormality(items, occ, out);
  score += scoreColors(items, occ, out);
  score += scorePatterns(items, occ, out);
  score += scoreMaterials(items, wx, out);
  score += scoreVariety(items, recentWear, out);
  return { slots, items, score, reasons: out.reasons, warnings: out.warnings };
}

/**
 * Main entry point.
 * catalog:    array of items (see closet/catalog.js for the schema)
 * wx:         { feelsMorning, feelsPeak, rainProb, windMax } (°F, %, mph)
 * occasionKey:'work' | 'school' | 'kids'
 * recentWear: { itemId: daysAgo } — optional
 * Returns { plan, outfits } with up to 5 diverse outfits, best first.
 */
function generateOutfits(catalog, wx, occasionKey, recentWear = {}) {
  const occ = OCCASIONS[occasionKey] || OCCASIONS.work;
  const plan = weatherPlan(wx);

  const bottoms = candidates(catalog, 'bottom', occ, plan, recentWear);
  const bases = candidates(catalog, 'base', occ, plan, recentWear);
  const feet = candidates(catalog, 'footwear', occ, plan, recentWear, 8);
  const mids = plan.allowMid ? [null, ...candidates(catalog, 'mid', occ, plan, recentWear, 8)] : [null];
  const outers = plan.allowOuter ? [null, ...candidates(catalog, 'outer', occ, plan, recentWear, 8)] : [null];

  const missing = [];
  if (!bottoms.length) missing.push('bottoms');
  if (!bases.length) missing.push('tops');
  if (!feet.length) missing.push('footwear');
  if (missing.length) return { plan, outfits: [], missing };

  const scored = [];
  for (const bottom of bottoms)
    for (const base of bases)
      for (const mid of mids)
        for (const outer of outers) {
          if (plan.requireOuter && !outer) continue;
          for (const footwear of feet)
            scored.push(scoreOutfit({ bottom, base, mid, outer, footwear }, occ, plan, wx, recentWear));
        }
  scored.sort((a, b) => b.score - a.score);

  // keep the top outfits but force diversity (share at most 2 pieces with a better pick)
  const picks = [];
  for (const o of scored) {
    const ids = new Set(o.items.map(it => it.id));
    const overlap = picks.some(p => p.items.filter(it => ids.has(it.id)).length > 2);
    if (!overlap) picks.push(o);
    if (picks.length >= 5) break;
  }

  // cold-morning accessories
  if (plan.scarfWeather) {
    const acc = catalog.filter(it => it.layer === 'accessory' && (it.warmth || 0) >= 2 && inBand(it, occ));
    if (acc.length) for (const p of picks) p.accessories = acc.slice(0, 2);
    else plan.notes.push('cold morning; a scarf would help (none in the closet yet)');
  }

  return { plan, outfits: picks };
}

const ENGINE = { OCCASIONS, COLORS, PATTERN_BOLDNESS, colorPairScore, weatherPlan, generateOutfits };
if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
if (typeof window !== 'undefined') window.ENGINE = ENGINE;
