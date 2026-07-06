/* cataloger.js — in-browser photo cataloging, zero tokens.
   Uses CLIP (transformers.js, loaded on demand from CDN, cached by the
   browser) to (1) embed each uploaded photo, (2) cluster photos of the same
   garment shot from different angles, and (3) zero-shot draft category,
   color, pattern, and material for each garment. The user reviews and edits
   every draft before it is saved to IndexedDB. Photos never leave the device. */

'use strict';

const CATALOGER = (() => {
  const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.2';
  const MODEL = 'Xenova/clip-vit-base-patch32';
  const SAME_ITEM_THRESHOLD = 0.86; // cosine similarity above this = same garment
  const MAX_EDGE = 512;             // photos resized before embedding/storing

  // Zero-shot label sets. Each category label carries engine defaults.
  const CATEGORY_LABELS = [
    { label: 'a t-shirt', category: 'tee', layer: 'base', warmth: 1, formality: 1.5 },
    { label: 'a polo shirt', category: 'polo', layer: 'base', warmth: 1, formality: 2.5 },
    { label: 'a button-up dress shirt', category: 'shirt', layer: 'base', warmth: 1.5, formality: 3.5 },
    { label: 'a knit sweater', category: 'sweater', layer: 'mid', warmth: 3, formality: 2.5 },
    { label: 'a cardigan', category: 'cardigan', layer: 'mid', warmth: 2.5, formality: 3 },
    { label: 'a hoodie or sweatshirt', category: 'hoodie', layer: 'mid', warmth: 2.5, formality: 1.5 },
    { label: 'a suit jacket or blazer', category: 'blazer', layer: 'outer', warmth: 2.5, formality: 4.5 },
    { label: 'a wool overcoat', category: 'coat', layer: 'outer', warmth: 4, formality: 4 },
    { label: 'a puffer or down winter coat', category: 'coat', layer: 'outer', warmth: 4.5, formality: 1.5 },
    { label: 'a rain jacket or windbreaker', category: 'jacket', layer: 'outer', warmth: 2, formality: 1.5, waterResistant: true },
    { label: 'a denim or casual jacket', category: 'jacket', layer: 'outer', warmth: 2, formality: 1.5 },
    { label: 'a pair of jeans', category: 'jeans', layer: 'bottom', warmth: 2, formality: 2 },
    { label: 'a pair of chino pants', category: 'chinos', layer: 'bottom', warmth: 2, formality: 2.5 },
    { label: 'a pair of formal dress trousers', category: 'trousers', layer: 'bottom', warmth: 2.5, formality: 4 },
    { label: 'a pair of shorts', category: 'shorts', layer: 'bottom', warmth: 1, formality: 1.5 },
    { label: 'a skirt', category: 'skirt', layer: 'bottom', warmth: 1.5, formality: 3 },
    { label: 'a dress', category: 'dress', layer: 'base', warmth: 1.5, formality: 3.5 },
    { label: 'a pair of sneakers', category: 'sneakers', layer: 'footwear', warmth: 1, formality: 2 },
    { label: 'a pair of leather dress shoes', category: 'shoes', layer: 'footwear', warmth: 2, formality: 4 },
    { label: 'a pair of boots', category: 'boots', layer: 'footwear', warmth: 2.5, formality: 3 },
    { label: 'a scarf', category: 'scarf', layer: 'accessory', warmth: 2, formality: 3 },
    { label: 'a winter hat or baseball cap', category: 'hat', layer: 'accessory', warmth: 1.5, formality: 1.5 },
  ];

  const COLOR_LABELS = ['black', 'white', 'gray', 'charcoal', 'cream', 'beige', 'tan', 'khaki',
    'navy', 'denim', 'brown', 'camel', 'olive', 'burgundy', 'red', 'orange', 'yellow', 'green',
    'teal', 'light blue', 'blue', 'purple', 'pink'];

  const PATTERN_LABELS = [
    { label: 'plain solid-colored clothing with no pattern', value: 'solid' },
    { label: 'striped clothing', value: 'stripe' },
    { label: 'plaid or tartan clothing', value: 'plaid' },
    { label: 'checked or gingham clothing', value: 'check' },
    { label: 'floral patterned clothing', value: 'floral' },
    { label: 'clothing with a graphic print or logo', value: 'graphic' },
    { label: 'polka dot clothing', value: 'polka-dot' },
  ];

  const MATERIAL_LABELS = ['cotton', 'wool', 'denim', 'leather', 'linen', 'synthetic', 'fleece', 'suede', 'down'];

  // ---------------------------------------------------------------- model

  let modelPromise = null;

  function loadModel(onProgress) {
    if (!modelPromise) {
      modelPromise = (async () => {
        const T = await import(CDN);
        const opts = {
          progress_callback: p => {
            if (p.status === 'progress' && p.total) {
              onProgress(`downloading model ${Math.round((p.loaded / p.total) * 100)}% (${p.file})`);
            }
          },
        };
        const [processor, tokenizer, vision, text] = await Promise.all([
          T.AutoProcessor.from_pretrained(MODEL, opts),
          T.AutoTokenizer.from_pretrained(MODEL),
          T.CLIPVisionModelWithProjection.from_pretrained(MODEL, opts),
          T.CLIPTextModelWithProjection.from_pretrained(MODEL, opts),
        ]);
        return { T, processor, tokenizer, vision, text };
      })();
      modelPromise.catch(() => { modelPromise = null; }); // allow retry after failure
    }
    return modelPromise;
  }

  // ---------------------------------------------------------------- math

  function normalize(vec) {
    let n = 0;
    for (const v of vec) n += v * v;
    n = Math.sqrt(n) || 1;
    return vec.map(v => v / n);
  }

  function cosine(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  function meanVec(vecs) {
    const out = new Array(vecs[0].length).fill(0);
    for (const v of vecs) for (let i = 0; i < v.length; i++) out[i] += v[i];
    return normalize(out.map(x => x / vecs.length));
  }

  // ---------------------------------------------------------------- embedding

  async function resizeToBlob(file) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
  }

  async function embedBlob(m, blob) {
    const image = await m.T.RawImage.fromBlob(blob);
    const inputs = await m.processor(image);
    const { image_embeds } = await m.vision(inputs);
    return normalize(Array.from(image_embeds.data));
  }

  const textCache = {};
  async function textEmbeds(m, prompts, cacheKey) {
    if (textCache[cacheKey]) return textCache[cacheKey];
    const tokens = m.tokenizer(prompts, { padding: true, truncation: true });
    const { text_embeds } = await m.text(tokens);
    const dim = text_embeds.dims[1];
    const flat = Array.from(text_embeds.data);
    const out = prompts.map((_, i) => normalize(flat.slice(i * dim, (i + 1) * dim)));
    textCache[cacheKey] = out;
    return out;
  }

  // best label for an image embedding, with a softmax-ish confidence
  function classify(embed, labelEmbeds) {
    const sims = labelEmbeds.map(t => cosine(embed, t));
    const exps = sims.map(s => Math.exp(s * 100));
    const total = exps.reduce((a, b) => a + b, 0);
    let best = 0;
    for (let i = 1; i < sims.length; i++) if (sims[i] > sims[best]) best = i;
    return { index: best, confidence: exps[best] / total };
  }

  // ---------------------------------------------------------------- clustering

  // Greedy connected components: photos whose embeddings are close enough are
  // the same garment photographed from different angles.
  function clusterPhotos(embeds) {
    const groups = [];
    const assigned = new Array(embeds.length).fill(-1);
    for (let i = 0; i < embeds.length; i++) {
      if (assigned[i] >= 0) continue;
      const g = [i];
      assigned[i] = groups.length;
      for (let j = i + 1; j < embeds.length; j++) {
        if (assigned[j] >= 0) continue;
        if (g.some(k => cosine(embeds[k], embeds[j]) >= SAME_ITEM_THRESHOLD)) {
          g.push(j);
          assigned[j] = groups.length;
        }
      }
      groups.push(g);
    }
    return groups;
  }

  // ---------------------------------------------------------------- drafting

  async function draftGroups(files, onProgress) {
    const m = await loadModel(onProgress);
    const photos = [];
    for (let i = 0; i < files.length; i++) {
      onProgress(`analyzing photo ${i + 1} of ${files.length}…`);
      const blob = await resizeToBlob(files[i]);
      photos.push({ blob, url: URL.createObjectURL(blob), embed: await embedBlob(m, blob) });
    }
    onProgress('grouping photos into garments…');
    const groups = clusterPhotos(photos.map(p => p.embed));

    const catEmbeds = await textEmbeds(m, CATEGORY_LABELS.map(c => `a photo of ${c.label}`), 'cat');
    const colorEmbeds = await textEmbeds(m, COLOR_LABELS.map(c => `a photo of ${c} colored clothing`), 'color');
    const patEmbeds = await textEmbeds(m, PATTERN_LABELS.map(p => `a photo of ${p.label}`), 'pattern');
    const matEmbeds = await textEmbeds(m, MATERIAL_LABELS.map(x => `a photo of clothing made of ${x}`), 'material');

    const drafts = groups.map((idxs, gi) => {
      const rep = meanVec(idxs.map(i => photos[i].embed));
      const cat = classify(rep, catEmbeds);
      const col = classify(rep, colorEmbeds);
      const pat = classify(rep, patEmbeds);
      const mat = classify(rep, matEmbeds);
      const c = CATEGORY_LABELS[cat.index];
      return {
        groupIndex: gi,
        photos: idxs.map(i => photos[i]),
        category: c.category, layer: c.layer,
        warmth: c.warmth, formality: c.formality,
        waterResistant: !!c.waterResistant,
        color: COLOR_LABELS[col.index],
        pattern: PATTERN_LABELS[pat.index].value,
        material: MATERIAL_LABELS[mat.index],
        confidence: { category: cat.confidence, color: col.confidence, pattern: pat.confidence, material: mat.confidence },
      };
    });
    onProgress('');
    return drafts;
  }

  // ---------------------------------------------------------------- saving

  function slugify(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  async function saveItem(draft) {
    const id = `${slugify(draft.name)}-${Date.now().toString(36)}`;
    const photoKeys = [];
    for (let i = 0; i < draft.photos.length; i++) {
      const key = `${id}-${i}`;
      await DBX.putPhoto(key, draft.photos[i].blob);
      photoKeys.push(key);
    }
    const item = {
      id, name: draft.name, category: draft.category, layer: draft.layer,
      colors: [draft.color], pattern: draft.pattern, material: draft.material,
      warmth: draft.warmth, formality: draft.formality,
      waterResistant: draft.waterResistant, photoKeys, user: true,
    };
    await DBX.putItem(item);
    return item;
  }

  async function addPhotosToItem(item, photos) {
    const photoKeys = [...(item.photoKeys || [])];
    for (let i = 0; i < photos.length; i++) {
      const key = `${item.id}-x${Date.now().toString(36)}-${i}`;
      await DBX.putPhoto(key, photos[i].blob);
      photoKeys.push(key);
    }
    await DBX.putItem({ ...item, photoKeys });
  }

  return { CATEGORY_LABELS, COLOR_LABELS, PATTERN_LABELS, MATERIAL_LABELS, draftGroups, saveItem, addPhotosToItem };
})();

if (typeof window !== 'undefined') window.CATALOGER = CATALOGER;
