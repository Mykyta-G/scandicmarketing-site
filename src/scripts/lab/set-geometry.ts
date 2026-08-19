/* Partikellabbet — uppsättning: exakt geometri.

   Fem formationer byggda ur formler, inte ur teckningar. Gemensamt för dem
   alla: figuren härleds ur några få tal, och tätheten är jämn hela vägen —
   inga klumpar i svängarna, ingen gles kant. Allt skalas ur den kortaste
   sidan, så samma bild bär på en telefon som på en bred skärm.
*/
import type { Formation } from './types';

const TAU = Math.PI * 2;

/* Rutan formationerna får ta i anspråk: 5 % luft i sidled, 10 % upptill och
   8 % nedtill. Mitten ligger därför en aning över halva höjden. */
function frame(W: number, H: number) {
  const cx = W * 0.5;
  const cy = H * 0.51;
  const halfW = W * 0.45;
  const halfH = H * 0.41;
  return { cx, cy, halfW, halfH, r: Math.min(halfW, halfH) };
}

/* Jämn gång längs en kurva.

   En parameterkurva löper olika fort i olika delar — punkter lagda på jämna
   steg i t klumpar sig i de tvära svängarna och glesnar på de raka sträckorna.
   Därför mäts kurvan först tätt upp, båglängden summeras, och de slutliga
   punkterna plockas med lika avstånd längs den summan. */
function evenCurve(
  out: number[],
  count: number,
  t0: number,
  t1: number,
  closed: boolean,
  at: (t: number) => [number, number]
) {
  const fine = Math.max(count * 8, 2000);
  const xs = new Float64Array(fine + 1);
  const ys = new Float64Array(fine + 1);
  const acc = new Float64Array(fine + 1);
  for (let i = 0; i <= fine; i++) {
    const p = at(t0 + ((t1 - t0) * i) / fine);
    xs[i] = p[0];
    ys[i] = p[1];
    acc[i] = i === 0 ? 0 : acc[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }
  const total = acc[fine];
  if (!(total > 0)) return;

  // sluten kurva: sista punkten skulle landa på den första — hoppa över den
  const steps = closed ? count : count - 1;
  let j = 0;
  for (let k = 0; k < count; k++) {
    const want = (total * k) / steps;
    while (j < fine - 1 && acc[j + 1] < want) j++;
    const span = acc[j + 1] - acc[j];
    const u = span > 1e-9 ? (want - acc[j]) / span : 0;
    out.push(xs[j] + (xs[j + 1] - xs[j]) * u, ys[j] + (ys[j + 1] - ys[j]) * u);
  }
}

export const SET_GEOMETRY: Formation[] = [
  {
    name: 'lissajous',
    title: 'Lissajous',
    note: 'Två svängningar ur fas — figuren sluter sig långsamt.',
    goal: 0.8,
    points: (W, H, rr) => {
      const out: number[] = [];
      const { cx, cy, halfW, halfH } = frame(W, H);
      // fem svängningar i sidled mot fyra i höjdled: en vävd, sluten slinga.
      // sin håller kurvan innanför ±A och ±B — figuren fyller rutan av sig själv
      const A = halfW * 0.95;
      const B = halfH * 0.95;
      evenCurve(out, 1800, 0, TAU, true, (t) => [
        cx + Math.cos(5 * t) * A,
        cy + Math.sin(4 * t) * B,
      ]);
      // knappt märkbar bredd i strecket — kurvan ska läsas som ritad, inte tryckt
      const jit = Math.min(W, H) * 0.0025;
      for (let i = 0; i < out.length; i++) out[i] += (rr() - 0.5) * jit;
      return out;
    },
  },

  {
    name: 'rose-curve',
    title: 'Rosett',
    note: 'Tio kronblad ur ett enda tal — kurvan behöver två varv innan den sluter sig.',
    goal: 0.85,
    points: (W, H, rr) => {
      const out: number[] = [];
      const { cx, cy, r } = frame(W, H);
      // r = cos(kθ) med k = 5/2: två varv, tio blad, och en femuddig
      // flätning där kurvan korsar sig själv på vägen
      const k = 5 / 2;
      const R = r * 0.97;
      evenCurve(out, 2000, 0, Math.PI * 4, true, (t) => {
        const rad = Math.cos(k * t) * R;
        return [cx + Math.cos(t) * rad, cy + Math.sin(t) * rad];
      });
      const jit = Math.min(W, H) * 0.002;
      for (let i = 0; i < out.length; i++) out[i] += (rr() - 0.5) * jit;
      return out;
    },
  },

  {
    name: 'string-art',
    title: 'Kurvsöm',
    note: 'Bara raka linjer. Kröken finns ingenstans — den uppstår där de möts.',
    goal: 0.8,
    points: (W, H, rr) => {
      const out: number[] = [];
      const { cx, cy, halfW, halfH } = frame(W, H);
      // rektangeln får luta högst 1,6:1 åt något håll — bortom det tappar
      // hörnkurvorna sin form och figuren blir en remsa
      const hx = Math.min(halfW, halfH * 1.6) * 0.96;
      const hy = Math.min(halfH, halfW * 1.6) * 0.96;

      // Varje hörn sys med samma antal kordor: den n:te punkten på ena kanten
      // dras till den n:te från slutet på den andra. Kuvertet blir en parabel.
      const L = 15;
      const corners: [number, number, number, number][] = [
        [-1, -1, 1, 1],
        [1, -1, -1, 1],
        [1, 1, -1, -1],
        [-1, 1, 1, -1],
      ];
      const chords: [number, number, number, number][] = [];
      let totalLen = 0;
      for (const [sx, sy] of corners) {
        for (let i = 1; i < L; i++) {
          const f = i / L;
          // ena änden vandrar ut längs vågräta kanten, den andra in längs den lodräta
          const ax = cx + sx * hx * (1 - f);
          const ay = cy + sy * hy;
          const bx = cx + sx * hx;
          const by = cy + sy * hy * (1 - f);
          const len = Math.hypot(bx - ax, by - ay);
          chords.push([ax, ay, bx, by]);
          totalLen += len;
        }
      }

      // punkterna fördelas efter längd, inte per korda — annars blir de korta
      // kordorna närmast hörnet en tät klump
      const budget = 1900;
      for (const [ax, ay, bx, by] of chords) {
        const len = Math.hypot(bx - ax, by - ay);
        const n = Math.max(7, Math.round((budget * len) / totalLen));
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1);
          out.push(ax + (bx - ax) * u, ay + (by - ay) * u);
        }
      }
      const jit = Math.min(W, H) * 0.0022;
      for (let i = 0; i < out.length; i++) out[i] += (rr() - 0.5) * jit;
      return out;
    },
  },

  {
    name: 'sierpinski',
    title: 'Sierpinski',
    note: 'Slumpen väljer hörn, steget går alltid halva vägen — ordningen kommer ändå.',
    goal: 0.9,
    points: (W, H, rr) => {
      const out: number[] = [];
      const { cx, cy, halfW, halfH } = frame(W, H);
      // liksidig triangel: höjden är √3/2 av bredden, så bredden får ge vika
      // först när rutan är låg
      const SQ3 = Math.sqrt(3) / 2;
      const hw = Math.min(halfW, halfH / SQ3) * 0.97;
      const hh = hw * SQ3;
      const vx = [cx, cx - hw, cx + hw];
      const vy = [cy - hh, cy + hh, cy + hh];

      // kaosspelet: gå upprepat halva vägen mot ett slumpat hörn. Punkterna
      // faller aldrig utanför triangeln och fyller den i sitt eget mönster
      let x = cx;
      let y = cy + hh * 0.2;
      const N = 2200;
      for (let i = 0; i < N + 24; i++) {
        const v = Math.min(2, (rr() * 3) | 0);
        x = (x + vx[v]) * 0.5;
        y = (y + vy[v]) * 0.5;
        if (i >= 24) out.push(x, y); // de första stegen minns ännu starten
      }
      return out;
    },
  },

  {
    name: 'moire',
    title: 'Moiré',
    note: 'Två rutnät, sex graders vridning. Mönstret som syns finns i inget av dem.',
    goal: 0.7,
    points: (W, H, rr) => {
      const out: number[] = [];
      const { cx, cy, halfW, halfH } = frame(W, H);
      const hx = halfW * 0.96;
      const hy = halfH * 0.96;

      // rutstorleken följer ytan, så tätheten blir densamma på telefon som
      // på bred skärm — omkring 950 punkter per rutnät
      const per = 950;
      const s = Math.sqrt((4 * hx * hy) / per);
      const reach = Math.ceil(Math.hypot(hx, hy) / s) + 1;
      const jit = s * 0.05; // en hårsmån liv, inte nog att lösa upp rastret

      // samma rutnät två gånger, vridet åt var sitt håll kring mitten
      const ang = (6 * Math.PI) / 180;
      for (const th of [-ang / 2, ang / 2]) {
        const c = Math.cos(th);
        const sn = Math.sin(th);
        for (let i = -reach; i <= reach; i++) {
          for (let j = -reach; j <= reach; j++) {
            const gx = i * s;
            const gy = j * s;
            const x = gx * c - gy * sn;
            const y = gx * sn + gy * c;
            if (Math.abs(x) > hx || Math.abs(y) > hy) continue;
            out.push(cx + x + (rr() - 0.5) * jit, cy + y + (rr() - 0.5) * jit);
          }
        }
      }
      return out;
    },
  },
];
