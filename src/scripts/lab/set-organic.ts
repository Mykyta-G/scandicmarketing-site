/* Partikellabbet — organisk och genererande växt.

   Fem formationer som alla bygger sig själva ur en enkel regel: en gren som
   delar sig, frön som förhandlar om marken, en arm som rullar ut, ett
   landskap som läses nivå för nivå, en flock som viker av samtidigt.
   Rena funktioner — inget tillstånd, ingen DOM, ingen Math.random.
*/
import type { Formation } from './types';

const TAU = Math.PI * 2;

// ————— Deterministiskt brus —————
// Heltalshash över rutnätspunkter, smoothstep emellan. Fröet kommer från
// rr() så att samma formation alltid ritas likadant.
function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x85ebca6b) ^ Math.imul(seed | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function makeNoise(seed: number) {
  return (x: number, y: number): number => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash2(x0, y0, seed);
    const b = hash2(x0 + 1, y0, seed);
    const c = hash2(x0, y0 + 1, seed);
    const d = hash2(x0 + 1, y0 + 1, seed);
    const top = a + (b - a) * sx;
    const bot = c + (d - c) * sx;
    return top + (bot - top) * sy;
  };
}

// Lager på lager av samma brus, varje lager hälften så starkt och dubbelt så
// tätt. Summan normeras, så svaret alltid ligger i 0..1. Få lager ger mjuka
// kullar, många ger ett skrovligt fält.
function makeFbm(seed: number, octaves = 4) {
  const n = makeNoise(seed);
  return (x: number, y: number): number => {
    let sum = 0;
    let norm = 0;
    let amp = 0.5;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += n(x * f + o * 17.3, y * f - o * 11.7) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  };
}

function seedFrom(rr: () => number): number {
  return (rr() * 0x7fffffff) | 0;
}

// ————— Gemensamma verktyg —————

/* Skalar och flyttar en punktsamling så att den fyller den anvisade rutan
   med bevarat sidförhållande. Formationerna får då samma luft på en telefon
   som på ett skrivbord, oavsett i vilka enheter de råkar vara ritade.
   anchor: 0 = mot rutans överkant, 1 = mot dess underkant. */
function fitBox(pts: number[], bx: number, by: number, bw: number, bh: number, anchor = 0.5): number[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i];
    const y = pts[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const w = Math.max(maxX - minX, 1e-6);
  const h = Math.max(maxY - minY, 1e-6);
  const s = Math.min(bw / w, bh / h);
  const ox = bx + (bw - w * s) / 2 - minX * s;
  const oy = by + (bh - h * s) * anchor - minY * s;
  const out = new Array<number>(pts.length);
  for (let i = 0; i < pts.length; i += 2) {
    out[i] = pts[i] * s + ox;
    out[i + 1] = pts[i + 1] * s + oy;
  }
  return out;
}

/* Sista säkringen: ingenting får hamna i kanten. Geometrin är ritad innanför
   marginalerna, så det här slår sällan till. */
function clampAll(pts: number[], W: number, H: number): number[] {
  const xLo = W * 0.05;
  const xHi = W * 0.95;
  const yLo = H * 0.1;
  const yHi = H * 0.92;
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i];
    const y = pts[i + 1];
    pts[i] = x < xLo ? xLo : x > xHi ? xHi : x;
    pts[i + 1] = y < yLo ? yLo : y > yHi ? yHi : y;
  }
  return pts;
}

/* Glesar ut en kandidatlista till ungefär önskat antal, jämnt över listan.
   Används av de formationer som först ritar hela mönstret i ett fint
   rutnät och sedan väljer ut vad partiklarna ska bemanna. */
function thin(cand: number[], target: number): number[] {
  const n = cand.length / 2;
  if (n <= target) return cand;
  const out: number[] = [];
  for (let i = 0; i < target; i++) {
    const j = Math.floor((i * n) / target) * 2;
    out.push(cand[j], cand[j + 1]);
  }
  return out;
}

export const SET_ORGANIC: Formation[] = [
  {
    name: 'branching',
    title: 'Förgrening',
    note: 'En stam som delar sig tills grenarna blir hårfina.',
    goal: 0.85,
    points: (W, H, rr) => {
      /* Trädet växer i egna enheter — roten i origo, uppåt är negativ y —
         och passas in i rutan först på slutet. Djupet är hårt kapat, och en
         övre gräns för antalet grenar hindrar att budgeten skenar. */
      const MAX_DEPTH = 6;
      const MAX_SEGS = 700;
      const segs: number[] = []; // x0,y0,x1,y1 per gren

      const grow = (x: number, y: number, ang: number, len: number, depth: number): void => {
        if (depth > MAX_DEPTH || segs.length >= MAX_SEGS * 4) return;
        // varje gren böjer sig en aning på vägen — inget är spikrakt
        const bend = (rr() - 0.5) * 0.26;
        const mx = x + Math.cos(ang) * len * 0.5;
        const my = y + Math.sin(ang) * len * 0.5;
        const a2 = ang + bend;
        const ex = mx + Math.cos(a2) * len * 0.5;
        const ey = my + Math.sin(a2) * len * 0.5;
        segs.push(x, y, mx, my, mx, my, ex, ey);
        if (depth === MAX_DEPTH) return;

        // stammen håller ihop längst ner, längre ut delar den sig ibland i tre
        const kids = depth < 2 ? 2 : rr() < 0.18 ? 3 : 2;
        const spread = 0.34 + rr() * 0.24;
        for (let k = 0; k < kids; k++) {
          const f = (k / (kids - 1)) * 2 - 1; // -1 .. 1
          let na = a2 + f * spread + (rr() - 0.5) * 0.16;
          na += (-Math.PI / 2 - na) * 0.16; // grenarna söker sig tillbaka mot ljuset
          grow(ex, ey, na, len * (0.7 + rr() * 0.12), depth + 1);
        }
      };

      grow(0, 0, -Math.PI / 2, 1, 0);

      // Punkterna fördelas efter grenens längd, inte per gren — annars
      // samlas allt i topparna där grenarna är som flest och kortast.
      let total = 0;
      for (let i = 0; i < segs.length; i += 4) {
        total += Math.hypot(segs[i + 2] - segs[i], segs[i + 3] - segs[i + 1]);
      }
      const BUDGET = 1450;
      const raw: number[] = [];
      for (let i = 0; i < segs.length; i += 4) {
        const x0 = segs[i];
        const y0 = segs[i + 1];
        const dx = segs[i + 2] - x0;
        const dy = segs[i + 3] - y0;
        const len = Math.hypot(dx, dy);
        const n = Math.max(1, Math.round((len / total) * BUDGET));
        for (let j = 0; j < n; j++) {
          const t = (j + 0.5) / n;
          raw.push(x0 + dx * t, y0 + dy * t);
        }
      }

      return clampAll(fitBox(raw, W * 0.08, H * 0.11, W * 0.84, H * 0.8, 1), W, H);
    },
  },

  {
    name: 'cell-walls',
    title: 'Cellväggar',
    note: 'Utspridda frön förhandlar om ytan; kvar blir bara gränserna mellan dem.',
    goal: 0.7,
    points: (W, H, rr) => {
      /* Varje frö tar den mark som ligger närmast. Vi ritar inte cellerna
         utan bara sömmarna: där två grannar i rutnätet tillhör olika frön
         läggs en punkt. Ett svagt brus vrider på koordinaterna innan
         avståndet mäts, så väggarna buktar som i en vävnad. */
      const bx = W * 0.06;
      const by = H * 0.11;
      const bw = W * 0.88;
      const bh = H * 0.8;

      // frön ur ett skakat rutnät — jämnt fördelade men aldrig i rader
      const cols = bw >= bh ? 7 : 5;
      const rows = bw >= bh ? 5 : 7;
      const sx: number[] = [];
      const sy: number[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          sx.push(bx + ((c + 0.06 + rr() * 0.88) / cols) * bw);
          sy.push(by + ((r + 0.06 + rr() * 0.88) / rows) * bh);
        }
      }
      const seeds = sx.length;
      const spacing = Math.min(bw / cols, bh / rows);

      const fbm = makeFbm(seedFrom(rr));
      const warp = spacing * 0.46;
      const nScale = 1 / (spacing * 1.7);

      const gw = 320;
      const gh = Math.max(60, Math.round((gw * bh) / bw));
      const owner = new Int16Array(gw * gh);
      for (let j = 0; j < gh; j++) {
        const y = by + (j / (gh - 1)) * bh;
        for (let i = 0; i < gw; i++) {
          const x = bx + (i / (gw - 1)) * bw;
          const qx = x + (fbm(x * nScale, y * nScale) - 0.5) * warp * 2;
          const qy = y + (fbm(x * nScale + 41.7, y * nScale - 19.3) - 0.5) * warp * 2;
          let best = 0;
          let bestD = Infinity;
          for (let s = 0; s < seeds; s++) {
            const dx = qx - sx[s];
            const dy = qy - sy[s];
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = s; }
          }
          owner[j * gw + i] = best;
        }
      }

      const cand: number[] = [];
      const stepX = bw / (gw - 1);
      const stepY = bh / (gh - 1);
      for (let j = 0; j < gh; j++) {
        for (let i = 0; i < gw; i++) {
          const o = owner[j * gw + i];
          const x = bx + i * stepX;
          const y = by + j * stepY;
          if (i + 1 < gw && owner[j * gw + i + 1] !== o) cand.push(x + stepX * 0.5, y);
          if (j + 1 < gh && owner[(j + 1) * gw + i] !== o) cand.push(x, y + stepY * 0.5);
        }
      }

      return clampAll(thin(cand, 1800), W, H);
    },
  },

  {
    name: 'spiral-arms',
    title: 'Spiralarmar',
    note: 'Två armar rullar ut ur en tät kärna, ett varv och lite till.',
    goal: 0.95,
    points: (W, H, rr) => {
      /* Logaritmisk spiral. Vi går längs armen med jämn båglängd i stället
         för jämnt vinkelsteg — annars klumpar allt ihop sig i mitten. */
      const cx = W * 0.5;
      const cy = H * 0.5;
      const maxR = Math.min(W * 0.42, H * 0.38);
      const r0 = maxR * 0.13;
      const b = 0.3; // hur snabbt armen öppnar sig
      const k = Math.sqrt(1 + b * b);
      const arcLen = (k * (maxR - r0)) / b;
      const perArm = 520;
      const ds = arcLen / perArm;
      const squash = 0.8; // skivan ses en aning från sidan

      const out: number[] = [];
      for (let a = 0; a < 2; a++) {
        const base = a * Math.PI + 0.4;
        let th = 0;
        for (let i = 0; i < perArm; i++) {
          const r = r0 * Math.exp(b * th);
          if (r > maxR) break;
          const t = (r - r0) / (maxR - r0);
          const spread = maxR * (0.009 + 0.042 * t); // armen fransar ut utåt
          const ang = base + th + ((rr() - 0.5) * spread * 1.4) / Math.max(r, 1);
          const rad = r + (rr() + rr() - 1) * spread;
          out.push(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * squash);
          th += ds / (r * k);
        }
      }

      // kärnan: en liten tät skiva, jämnt fördelad över ytan
      const coreR = maxR * 0.17;
      for (let i = 0; i < 260; i++) {
        const rad = coreR * Math.sqrt((i + 0.5) / 260);
        const ang = i * Math.PI * (3 - Math.sqrt(5));
        out.push(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * squash);
      }

      // ett tunt stoft ytterst, så att skivan inte slutar tvärt
      for (let i = 0; i < 150; i++) {
        const rad = maxR * (0.45 + Math.sqrt(rr()) * 0.57);
        const ang = rr() * TAU;
        out.push(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * squash);
      }

      return clampAll(out, W, H);
    },
  },

  {
    name: 'contours',
    title: 'Höjdkurvor',
    note: 'Ett påhittat landskap läst nivå för nivå, så som en karta läser en kulle.',
    goal: 0.65,
    points: (W, H, rr) => {
      /* Ett brusfält får bli höjd. För varje nivå letar vi efter de ställen
         där grannar i rutnätet ligger på var sin sida om nivån, och sätter
         punkten där emellan. Resultatet blir slutna slingor, aldrig linjer
         som tar slut mitt i luften. */
      const bx = W * 0.06;
      const by = H * 0.11;
      const bw = W * 0.88;
      const bh = H * 0.8;

      // två oktaver räcker: kullarna ska vara stora nog att kurvorna hinner
      // sluta sig innan de tappas bort i bruset
      const fbm = makeFbm(seedFrom(rr), 2);
      const gw = 300;
      const gh = Math.max(60, Math.round((gw * bh) / bw));
      const scale = 2.2 / bw; // samma skala i båda led — kullarna blir runda

      const field = new Float32Array(gw * gh);
      for (let j = 0; j < gh; j++) {
        const y = (j / (gh - 1)) * bh;
        for (let i = 0; i < gw; i++) {
          field[j * gw + i] = fbm((i / (gw - 1)) * bw * scale, y * scale);
        }
      }

      const levels = 7;
      const lo = 0.28;
      const hi = 0.72;
      const stepX = bw / (gw - 1);
      const stepY = bh / (gh - 1);
      const cand: number[] = [];
      for (let l = 0; l < levels; l++) {
        const lv = lo + ((hi - lo) * l) / (levels - 1);
        for (let j = 0; j < gh; j++) {
          for (let i = 0; i < gw; i++) {
            const v = field[j * gw + i] - lv;
            const x = bx + i * stepX;
            const y = by + j * stepY;
            if (i + 1 < gw) {
              const vr = field[j * gw + i + 1] - lv;
              if ((v < 0) !== (vr < 0)) cand.push(x + stepX * (v / (v - vr)), y);
            }
            if (j + 1 < gh) {
              const vd = field[(j + 1) * gw + i] - lv;
              if ((v < 0) !== (vd < 0)) cand.push(x, y + stepY * (v / (v - vd)));
            }
          }
        }
      }

      return clampAll(thin(cand, 1900), W, H);
    },
  },

  {
    name: 'murmuration',
    title: 'Fågelsvärm',
    note: 'Femhundra fåglar i samma sväng, tätast där flocken viker av.',
    goal: 0.75,
    points: (W, H, rr) => {
      /* Varje fågel är tre punkter i en liten vinkel, vänd åt det håll
         flocken drar. De sitter kring en böjd rygglinje som vidgar sig
         bakåt — tätt i täten, glesare i svansen. Ritas i egna enheter och
         passas in i rutan sist. */
      const spine = (u: number): [number, number] => {
        const a = -1.5 + u * 2.7;
        const r = 1 - 0.42 * u;
        return [Math.cos(a) * r * 1.95, Math.sin(a) * r * 0.66];
      };

      const birds = 480;
      const size = 0.026; // fågelns längd i samma enheter som rygglinjen
      const raw: number[] = [];
      for (let i = 0; i < birds; i++) {
        const u = (i + 0.5) / birds;
        const p = spine(u);
        const q = spine(Math.min(1, u + 0.004));
        let tx = q[0] - p[0];
        let ty = q[1] - p[1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;

        // tre dragningar ger en mjuk klockform kring rygglinjen
        const width = 0.07 + 0.34 * u;
        const off = ((rr() + rr() + rr()) / 1.5 - 1) * width;
        const along = (rr() - 0.5) * 0.03;
        const px = p[0] + tx * along - ty * off;
        const py = p[1] + ty * along + tx * off;

        // varje fågel ligger något snett mot flockens riktning
        const tilt = (rr() - 0.5) * 0.7;
        const ca = Math.cos(tilt);
        const sa = Math.sin(tilt);
        const dx = tx * ca - ty * sa;
        const dy = tx * sa + ty * ca;
        const nx = -dy;
        const ny = dx;

        raw.push(px + dx * size * 0.6, py + dy * size * 0.6);
        raw.push(px - dx * size * 0.4 + nx * size * 0.55, py - dy * size * 0.4 + ny * size * 0.55);
        raw.push(px - dx * size * 0.4 - nx * size * 0.55, py - dy * size * 0.4 - ny * size * 0.55);
      }

      return clampAll(fitBox(raw, W * 0.07, H * 0.11, W * 0.86, H * 0.8), W, H);
    },
  },
];
