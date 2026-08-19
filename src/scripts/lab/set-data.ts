/* Partikellabbet — uppsättning: data, mätning och gränssnitt.

   Fem formationer ur byråns eget ämne: siffror som blir bilder. Allt räknas
   fram analytiskt, utan canvas och utan slump utöver den rr() som skickas in.
   Måtten hänger på Math.min(W, H) så att motivet håller sig samlat både på
   en 390 px bred telefon och på en bred skärm.
*/
import type { Formation } from './types';

const TAU = Math.PI * 2;

/* En centrerad ruta med luft runt om. Bredden får aldrig springa iväg på
   vida skärmar — den kortaste sidan sätter taket, annars blir motivet ett
   utdraget band. */
function box(W: number, H: number, wFrac: number, hFrac: number, cy: number) {
  const S = Math.min(W, H);
  const w = Math.min(W * wFrac, S * 1.45);
  const h = Math.min(H * hFrac, S * 0.95);
  return { x: (W - w) / 2, y: cy * H - h / 2, w, h };
}

/* Samplar en polylinje jämnt: n punkter fördelade efter längd, så att korta
   och långa sträckor får samma täthet och linjen läses som en linje. */
function poly(
  out: number[],
  pts: number[],
  n: number,
  rr: () => number,
  jit = 0,
  closed = false
) {
  const p = closed ? pts.concat(pts[0], pts[1]) : pts;
  const m = p.length / 2 - 1;
  if (m < 1 || n < 1) return;
  const len: number[] = [];
  let sum = 0;
  for (let i = 0; i < m; i++) {
    const d = Math.hypot(p[i * 2 + 2] - p[i * 2], p[i * 2 + 3] - p[i * 2 + 1]);
    len.push(d);
    sum += d;
  }
  if (sum <= 0) return;
  for (let i = 0; i < n; i++) {
    let d = ((i + 0.5) / n) * sum;
    let k = 0;
    while (k < m - 1 && d > len[k]) {
      d -= len[k];
      k++;
    }
    const u = len[k] > 0 ? d / len[k] : 0;
    out.push(
      p[k * 2] + (p[k * 2 + 2] - p[k * 2]) * u + (rr() - 0.5) * jit,
      p[k * 2 + 1] + (p[k * 2 + 3] - p[k * 2 + 1]) * u + (rr() - 0.5) * jit
    );
  }
}

/* En fylld skiva som fyllotaxi — jämn täthet ända ut i kanten, ingen klump
   i mitten. Behöver ingen slump alls. */
function disc(out: number[], cx: number, cy: number, r: number, n: number) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const rad = r * Math.sqrt((i + 0.5) / n);
    const a = i * golden;
    out.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export const SET_DATA: Formation[] = [
  {
    name: 'trendline',
    title: 'Trendlinje',
    note: 'Spridda mätpunkter och linjen som går rakt igenom dem.',
    goal: 0.8,
    points: (W, H, rr) => {
      const out: number[] = [];
      const S = Math.min(W, H);
      const b = box(W, H, 0.82, 0.7, 0.51);
      const jit = S * 0.004;

      // axlarna: ett liggande L som ger bilden en botten att vila mot
      poly(out, [b.x, b.y + b.h * 0.02, b.x, b.y + b.h], 120, rr, jit);
      poly(out, [b.x, b.y + b.h, b.x + b.w * 0.99, b.y + b.h], 170, rr, jit);

      // gradering: fem streck längs botten, fyra längs sidan
      const tick = S * 0.018;
      for (let i = 1; i <= 5; i++) {
        const x = b.x + (b.w * i) / 5.4;
        poly(out, [x, b.y + b.h, x, b.y + b.h + tick], 12, rr, jit);
      }
      for (let i = 1; i <= 4; i++) {
        const y = b.y + b.h - (b.h * i) / 4.4;
        poly(out, [b.x - tick, y, b.x, y], 12, rr, jit);
      }

      // mätpunkterna: en liten skiva var, strödda kring den stigande banan
      const n = 26;
      const r = S * 0.011;
      for (let i = 0; i < n; i++) {
        const u = clamp((i + 0.5) / n + (rr() - 0.5) * 0.03, 0.02, 0.98);
        const v = clamp(0.16 + 0.66 * u + (rr() - 0.5) * 0.32, 0.05, 0.95);
        disc(out, b.x + b.w * u, b.y + b.h * (1 - v), r, 18);
      }

      // linjen genom molnet — samma lutning, utan bruset
      poly(
        out,
        [b.x + b.w * 0.02, b.y + b.h * 0.83, b.x + b.w * 0.98, b.y + b.h * 0.18],
        400,
        rr,
        jit * 0.7
      );

      return out;
    },
  },

  {
    name: 'funnel',
    title: 'Tratten',
    note: 'Fyra steg som smalnar av: många ser, färre stannar, någon hör av sig.',
    goal: 0.74,
    points: (W, H, rr) => {
      const out: number[] = [];
      const S = Math.min(W, H);
      const b = box(W, H, 0.6, 0.72, 0.51);
      const cx = b.x + b.w / 2;
      const jit = S * 0.004;

      // trattens profil: bredden vid fem höjder, mjukt avsmalnande
      const ws = [1, 0.76, 0.55, 0.37, 0.23];
      const wAt = (t: number) => {
        const s = clamp(t * 4, 0, 3.999);
        const i = Math.floor(s);
        return b.w * (ws[i] + (ws[i + 1] - ws[i]) * (s - i));
      };

      const gap = 0.018; // luft mellan stegen, i andel av höjden
      for (let k = 0; k < 4; k++) {
        const tT = k / 4 + gap;
        const tB = (k + 1) / 4 - gap;
        const yT = b.y + b.h * tT;
        const yB = b.y + b.h * tB;
        const hwT = wAt(tT) / 2;
        const hwB = wAt(tB) / 2;

        // stegets kant
        poly(
          out,
          [cx - hwT, yT, cx + hwT, yT, cx + hwB, yB, cx - hwB, yB],
          240,
          rr,
          jit,
          true
        );

        // ett tunt strö innanför kanten ger steget tyngd utan att täppa till
        for (let i = 0; i < 60; i++) {
          const t = rr();
          const hw = (hwT + (hwB - hwT) * t) * 0.86;
          out.push(cx + (rr() - 0.5) * 2 * hw, yT + (yB - yT) * t);
        }
      }

      return out;
    },
  },

  {
    name: 'radar',
    title: 'Radarn',
    note: 'Fem mått i samma bild — formen visar var styrkan ligger.',
    goal: 0.78,
    points: (W, H, rr) => {
      const out: number[] = [];
      const R = Math.min(W * 0.38, H * 0.36);
      const cx = W * 0.5;
      const cy = H * 0.5;
      const jit = R * 0.012;
      const k = 5;
      const a0 = -TAU / 4;

      const ring = (rad: number, n: number, j: number) => {
        const pts: number[] = [];
        for (let i = 0; i < k; i++) {
          const a = a0 + (i / k) * TAU;
          pts.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        }
        poly(out, pts, n, rr, j, true);
      };

      // tre nät utanpå varandra — skalan man läser av mot
      ring(R, 300, jit);
      ring(R * 0.66, 200, jit);
      ring(R * 0.33, 110, jit);

      // ekrarna ut till hörnen
      for (let i = 0; i < k; i++) {
        const a = a0 + (i / k) * TAU;
        poly(out, [cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R], 40, rr, jit);
      }

      // själva mätningen: en egen femhörning med olika utslag per axel
      const vals = [0.86, 0.52, 0.74, 0.34, 0.63];
      const shape: number[] = [];
      for (let i = 0; i < k; i++) {
        const a = a0 + (i / k) * TAU;
        const rad = R * vals[i];
        shape.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      poly(out, shape, 340, rr, jit * 0.8, true);

      // en knut i varje hörn så avläsningen får hållpunkter
      for (let i = 0; i < k; i++) {
        disc(out, shape[i * 2], shape[i * 2 + 1], R * 0.032, 26);
      }

      return out;
    },
  },

  {
    name: 'heat-grid',
    title: 'Värmerutan',
    note: 'En ruta per dag genom halvåret; ju tätare, desto mer hände det.',
    goal: 0.88,
    points: (W, H, rr) => {
      const out: number[] = [];
      const cols = 20;
      const rows = 7;
      const b = box(W, H, 0.82, 0.5, 0.5);
      const cell = Math.min(b.w / cols, b.h / rows);
      const gx = W * 0.5 - (cell * cols) / 2;
      const gy = H * 0.5 - (cell * rows) / 2;

      for (let c = 0; c < cols; c++) {
        // veckorna stiger mot slutet — arbetet syns i högerkanten
        const season = 0.46 + 0.54 * (c / (cols - 1));
        for (let r = 0; r < rows; r++) {
          // helgerna är svalare än vardagarna
          const week = r >= 5 ? 0.42 : 1;
          const v = clamp(Math.pow(rr(), 0.9) * season * week, 0, 1);
          const cxx = gx + (c + 0.5) * cell;
          const cyy = gy + (r + 0.5) * cell;
          disc(out, cxx, cyy, cell * (0.16 + 0.32 * v), 5 + Math.round(v * 26));
        }
      }

      return out;
    },
  },

  {
    name: 'network',
    title: 'Nätet',
    note: 'Noder och kanter — varje kanal drar sitt, och allt hänger ihop.',
    goal: 0.7,
    points: (W, H, rr) => {
      const out: number[] = [];
      const R = Math.min(W * 0.4, H * 0.38);
      const cx = W * 0.5;
      const cy = H * 0.51;
      const jit = R * 0.01;

      // navet i mitten, resten utspridda runt om — fasta lägen, ingen slump
      const nd = [
        0, 0, 1.35,
        -0.72, -0.46, 0.9,
        -0.86, 0.3, 0.75,
        -0.34, 0.78, 0.8,
        0.28, -0.8, 0.85,
        0.74, -0.3, 1.0,
        0.86, 0.42, 0.7,
        0.22, 0.86, 0.65,
        -0.2, -0.88, 0.6,
        0.48, 0.14, 0.7,
        -0.42, 0.1, 0.65,
      ];
      const px = (i: number) => cx + nd[i * 3] * R;
      const py = (i: number) => cy + nd[i * 3 + 1] * R;

      const edges = [
        0, 1, 0, 4, 0, 5, 0, 9, 0, 10,
        1, 2, 2, 3, 3, 7, 4, 8, 4, 5,
        5, 6, 6, 7, 9, 5, 10, 3, 1, 8, 9, 6,
      ];
      const step = R * 0.014; // samma avstånd mellan punkterna på alla kanter
      for (let e = 0; e < edges.length; e += 2) {
        const ax = px(edges[e]);
        const ay = py(edges[e]);
        const bx = px(edges[e + 1]);
        const by = py(edges[e + 1]);
        const n = Math.max(18, Math.round(Math.hypot(bx - ax, by - ay) / step));
        poly(out, [ax, ay, bx, by], n, rr, jit);
      }

      // noderna sist, så de ligger ovanpå kanterna i tätheten
      for (let i = 0; i < nd.length / 3; i++) {
        const s = nd[i * 3 + 2];
        disc(out, px(i), py(i), R * 0.055 * s, 10 + Math.round(30 * s * s));
      }

      return out;
    },
  },
];
