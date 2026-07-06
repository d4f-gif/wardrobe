/* catalog.js — the closet, as structured text. The app reads ONLY this file;
   photos are never sent anywhere. Claude appends entries here after looking
   at new photos in closet/photos/ (one-time token cost per item).

   Schema per item:
   id        unique kebab-case slug
   name      human-readable name
   category  tee | shirt | polo | sweater | cardigan | hoodie | blazer | coat |
             jacket | jeans | chinos | trousers | shorts | skirt | dress |
             sneakers | shoes | boots | scarf | hat | ...
   layer     base | mid | outer | bottom | footwear | accessory
   colors    array, primary color first (lowercase; see COLORS in engine.js)
   pattern   solid | texture | herringbone | pinstripe | stripe | check |
             gingham | plaid | floral | graphic | print | ... (see engine.js)
   material  cotton | linen | wool | cashmere | flannel | denim | leather |
             suede | synthetic | down | fleece | ...
   warmth    1 (summer-weight) … 5 (heavy winter)
   formality 1 (athleisure) … 5 (suit)
   waterResistant  true/false (outers & footwear)
   set       optional tag linking pieces meant to be worn together (e.g. a suit)
   photos    array of filenames inside closet/photos/
   sample    true = placeholder demo item; delete once the real closet covers it
*/

'use strict';

const CATALOG = [
  // ------------------------------------------------------------ bases
  { id: 'white-tee', name: 'White cotton tee', category: 'tee', layer: 'base',
    colors: ['white'], pattern: 'solid', material: 'cotton', warmth: 1, formality: 1.5, photos: [], sample: true },
  { id: 'gray-graphic-tee', name: 'Gray graphic tee', category: 'tee', layer: 'base',
    colors: ['gray'], pattern: 'graphic', material: 'cotton', warmth: 1, formality: 1, photos: [], sample: true },
  { id: 'white-oxford', name: 'White oxford shirt', category: 'shirt', layer: 'base',
    colors: ['white'], pattern: 'solid', material: 'cotton', warmth: 1.5, formality: 3.5, photos: [], sample: true },
  { id: 'blue-oxford', name: 'Light-blue oxford shirt', category: 'shirt', layer: 'base',
    colors: ['light blue'], pattern: 'solid', material: 'cotton', warmth: 1.5, formality: 3.5, photos: [], sample: true },
  { id: 'navy-stripe-shirt', name: 'Navy striped shirt', category: 'shirt', layer: 'base',
    colors: ['white', 'navy'], pattern: 'stripe', material: 'cotton', warmth: 1.5, formality: 3, photos: [], sample: true },
  { id: 'navy-polo', name: 'Navy polo', category: 'polo', layer: 'base',
    colors: ['navy'], pattern: 'solid', material: 'cotton', warmth: 1, formality: 2.5, photos: [], sample: true },
  { id: 'beige-linen-shirt', name: 'Beige linen shirt', category: 'shirt', layer: 'base',
    colors: ['beige'], pattern: 'solid', material: 'linen', warmth: 1, formality: 2.5, photos: [], sample: true },
  { id: 'red-flannel-shirt', name: 'Red plaid flannel shirt', category: 'shirt', layer: 'base',
    colors: ['red', 'black'], pattern: 'plaid', material: 'flannel', warmth: 2.5, formality: 1.5, photos: [], sample: true },

  // ------------------------------------------------------------ mids
  { id: 'gray-merino-sweater', name: 'Gray merino sweater', category: 'sweater', layer: 'mid',
    colors: ['gray'], pattern: 'solid', material: 'wool', warmth: 3, formality: 3, photos: [], sample: true },
  { id: 'navy-cardigan', name: 'Navy cotton cardigan', category: 'cardigan', layer: 'mid',
    colors: ['navy'], pattern: 'solid', material: 'cotton', warmth: 2.5, formality: 3, photos: [], sample: true },
  { id: 'cream-cable-sweater', name: 'Cream cable-knit sweater', category: 'sweater', layer: 'mid',
    colors: ['cream'], pattern: 'cable-knit', material: 'wool', warmth: 3.5, formality: 2.5, photos: [], sample: true },
  { id: 'charcoal-hoodie', name: 'Charcoal hoodie', category: 'hoodie', layer: 'mid',
    colors: ['charcoal'], pattern: 'solid', material: 'cotton', warmth: 2.5, formality: 1.5, photos: [], sample: true },

  // ------------------------------------------------------------ outers
  { id: 'navy-blazer', name: 'Navy wool blazer', category: 'blazer', layer: 'outer',
    colors: ['navy'], pattern: 'solid', material: 'wool', warmth: 2.5, formality: 4, photos: [], sample: true },
  { id: 'charcoal-overcoat', name: 'Charcoal wool overcoat', category: 'coat', layer: 'outer',
    colors: ['charcoal'], pattern: 'solid', material: 'wool', warmth: 4, formality: 4, photos: [], sample: true },
  { id: 'olive-rain-shell', name: 'Olive rain shell', category: 'jacket', layer: 'outer',
    colors: ['olive'], pattern: 'solid', material: 'synthetic', warmth: 2, formality: 1.5, waterResistant: true, photos: [], sample: true },
  { id: 'black-puffer', name: 'Black puffer coat', category: 'coat', layer: 'outer',
    colors: ['black'], pattern: 'solid', material: 'down', warmth: 4.5, formality: 1.5, waterResistant: true, photos: [], sample: true },
  { id: 'denim-jacket', name: 'Denim jacket', category: 'jacket', layer: 'outer',
    colors: ['denim'], pattern: 'solid', material: 'denim', warmth: 2, formality: 1.5, photos: [], sample: true },

  // ------------------------------------------------------------ bottoms
  { id: 'dark-jeans', name: 'Dark indigo jeans', category: 'jeans', layer: 'bottom',
    colors: ['indigo'], pattern: 'solid', material: 'denim', warmth: 2, formality: 2, photos: [], sample: true },
  { id: 'khaki-chinos', name: 'Khaki chinos', category: 'chinos', layer: 'bottom',
    colors: ['khaki'], pattern: 'solid', material: 'cotton', warmth: 2, formality: 2.5, photos: [], sample: true },
  { id: 'olive-chinos', name: 'Olive chinos', category: 'chinos', layer: 'bottom',
    colors: ['olive'], pattern: 'solid', material: 'cotton', warmth: 2, formality: 2.5, photos: [], sample: true },
  { id: 'gray-wool-trousers', name: 'Gray wool trousers', category: 'trousers', layer: 'bottom',
    colors: ['gray'], pattern: 'solid', material: 'wool', warmth: 2.5, formality: 4, photos: [], sample: true },
  { id: 'navy-shorts', name: 'Navy shorts', category: 'shorts', layer: 'bottom',
    colors: ['navy'], pattern: 'solid', material: 'cotton', warmth: 1, formality: 1.5, photos: [], sample: true },

  // ------------------------------------------------------------ footwear
  { id: 'white-sneakers', name: 'White leather sneakers', category: 'sneakers', layer: 'footwear',
    colors: ['white'], pattern: 'solid', material: 'leather', warmth: 1, formality: 2, photos: [], sample: true },
  { id: 'brown-derbies', name: 'Brown leather derbies', category: 'shoes', layer: 'footwear',
    colors: ['brown'], pattern: 'solid', material: 'leather', warmth: 2, formality: 4, photos: [], sample: true },
  { id: 'black-boots', name: 'Black leather boots', category: 'boots', layer: 'footwear',
    colors: ['black'], pattern: 'solid', material: 'leather', warmth: 2.5, formality: 3, waterResistant: true, photos: [], sample: true },
  { id: 'tan-suede-chukkas', name: 'Tan suede chukkas', category: 'boots', layer: 'footwear',
    colors: ['tan'], pattern: 'solid', material: 'suede', warmth: 2, formality: 3, photos: [], sample: true },

  // ------------------------------------------------------------ accessories
  { id: 'gray-wool-scarf', name: 'Gray wool scarf', category: 'scarf', layer: 'accessory',
    colors: ['gray'], pattern: 'solid', material: 'wool', warmth: 2, formality: 3, photos: [], sample: true },
];

if (typeof module !== 'undefined' && module.exports) module.exports = CATALOG;
if (typeof window !== 'undefined') window.CATALOG = CATALOG;
