/* Partikellabbet — uppsättning: fysik, flöde och naturkrafter.

   Fem formationer som alla lånar sin form av något som rör sig av sig självt:
   en virvel, ett strömfält, ett magnetfält, två vågkällor och lager som
   lagt sig till ro. Rena funktioner — mått in, målpunkter ut. Ingen DOM,
   inga beroenden, ingen egen slump: allt kommer ur rr().
*/
import type { Formation } from './types';

const TAU = Math.PI * 2;

type Pt = { x: number; y: number };

/* Värdebrus — hashat heltalsgaller med mjuk övergång. Fröet kommer ur rr(),
   så samma ruta ger samma fält varje gång den ritas om. */
function noise2(rr: () => number) {
  const sx = Math.floor(rr() * 4096);
  const sy = Math.floor(rr() * 4096);
  const hash = (ix: number, iy: number) => {
    let h = Math.imul(ix + sx, 374761393) ^ Math.imul(iy + sy, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = fade(x - ix);
    const fy = fade(y - iy);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    const top = a + (b - a) * fx;
    const bot = c + (d - c) * fx;
    return top + (bot - top) * fy;
  };
}

/* Lägg n punkter längs en kurva t ∈ [0, 1] — jämnt fördelade i verklig
   båglängd, inte i parameter. Utan det klumpar sig punkterna där kurvan
   svänger tvärt och glesnar där den sträcker ut sig. */
function curve(
  out: number[],
  at: (t: number, p: Pt) => void,
  n: number,
  jitter = 0,
  rr?: () => number
) {
  const sub = Math.max(n * 4, 64);
  const xs = new Float64Array(sub + 1);
  const ys = new Float64Array(sub + 1);
  const acc = new Float64Array(sub + 1);
  const p: Pt = { x: 0, y: 0 };
  for (let i = 0; i <= sub; i++) {
    at(i / sub, p);
    xs[i] = p.x;
    ys[i] = p.y;
    acc[i] = i ? acc[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) : 0;
  }
  const total = acc[sub];
  if (!(total > 0)) return;
  let j = 0;
  for (let k = 0; k < n; k++) {
    const want = (total * (k + 0.5)) / n;
    while (j < sub - 1 && acc[j + 1] < want) j++;
    const seg = acc[j + 1] - acc[j] || 1;
    const u = (want - acc[j]) / seg;
    const x = xs[j] + (xs[j + 1] - xs[j]) * u;
    const y = ys[j] + (ys[j + 1] - ys[j]) * u;
    if (jitter > 0 && rr) out.push(x + (rr() - 0.5) * jitter, y + (rr() - 0.5) * jitter);
    else out.push(x, y);
  }
}

export const SET_PHYSICS: Formation[] = [
  {
    name: 'vortex',
    title: 'Virvel',
    note: 'Strömmen dras inåt och vrider sig kring en tyst mittpunkt.',
    goal: 0.82,
    points: (W, H, rr) => {
      const out: number[] = [];
      const cx = W * 0.5;
      const cy = H * 0.48;
      const rMax = Math.min(W * 0.4, H * 0.35);
      const rMin = rMax * 0.11; // ögat lämnas tomt — det är där stillheten sitter
      const b = 0.3; // hur hårt spiralen sluter sig
      const arms = 5;
      const per = 320;
      for (let a = 0; a < arms; a++) {
        const base = (a / arms) * TAU + rr() * 0.14;
        for (let i = 0; i < per; i++) {
          /* Logaritmisk spiral: båglängden växer i takt med radien, så ett
             jämnt steg i r blir ett jämnt steg längs strömmen. */
          const r = rMin + (rMax - rMin) * (i / (per - 1));
          const th = base + Math.log(r / rMin) / b;
          const spread = rMax * 0.012 + r * 0.045; // armen fransar ut utåt
          const rj = r + (rr() - 0.5) * spread;
          out.push(cx + Math.cos(th) * rj, cy + Math.sin(th) * rj);
        }
      }
      // eftersläntrare i ytterkanten — korn som ännu inte funnit sin arm
      for (let i = 0; i < 180; i++) {
        const th = rr() * TAU;
        const r = rMax * (0.82 + rr() * 0.2);
        out.push(cx + Math.cos(th) * r, cy + Math.sin(th) * r);
      }
      return out;
    },
  },

  {
    name: 'flow-field',
    title: 'Strömfält',
    note: 'Osynliga strömmar drar sina linjer genom rutan, utan att någonsin mötas.',
    goal: 0.7,
    points: (W, H, rr) => {
      const out: number[] = [];
      const na = noise2(rr);
      const nb = noise2(rr);
      // två lager brus, det andra dubbelt så fint: fältet får aldrig en helt
      // platt fläck, och därmed drar linjerna aldrig iväg spikraka
      const n2 = (x: number, y: number) => na(x, y) + nb(x * 2.3 + 11, y * 2.3 - 7) * 0.5;
      const S = Math.min(W, H) * 0.55; // brusets våglängd
      const x0 = W * 0.06;
      const x1 = W * 0.94;
      const y0 = H * 0.12;
      const y1 = H * 0.9;
      const step = Math.min(W, H) * 0.014;
      const e = 0.3;
      const d: Pt = { x: 1, y: 0 };
      /* Riktningen är brusets virvel, inte dess lutning. Ett virvelfält är
         källfritt: linjerna varken samlas i klumpar eller tunnas ut. */
      const dir = (x: number, y: number) => {
        const u = x / S;
        const v = y / S;
        const gx = (n2(u, v + e) - n2(u, v - e)) / (2 * e);
        const gy = (n2(u + e, v) - n2(u - e, v)) / (2 * e);
        const m = Math.hypot(gx, gy) || 1;
        d.x = gx / m;
        d.y = -gy / m;
      };
      const cols = 8;
      const rows = 5;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const sx = x0 + (x1 - x0) * ((c + 0.15 + rr() * 0.7) / cols);
          const sy = y0 + (y1 - y0) * ((r + 0.15 + rr() * 0.7) / rows);
          // varje frö följs både med och mot strömmen — hela linjen, inte halva
          for (let s = 0; s < 2; s++) {
            const sign = s === 0 ? 1 : -1;
            let x = sx;
            let y = sy;
            for (let i = 0; i < 26; i++) {
              dir(x, y);
              x += d.x * step * sign;
              y += d.y * step * sign;
              if (x < x0 || x > x1 || y < y0 || y > y1) break; // linjen lämnar rutan
              out.push(x, y);
            }
          }
        }
      }
      return out;
    },
  },

  {
    name: 'dipole',
    title: 'Magnetfältet',
    note: 'Fältet lämnar den ena polen och vänder tillbaka till den andra, i slutna bågar.',
    goal: 0.8,
    points: (W, H, rr) => {
      const out: number[] = [];
      const cx = W * 0.5;
      const cy = H * 0.5;
      const S = Math.min(W * 0.42, H * 0.58);
      /* Dipolens fältlinjer: r = L·sin²θ mätt från axeln. Fyra vidder,
         speglade åt båda håll — stavmagnetens bild ur läroboken. */
      const widths = [0.3, 0.5, 0.72, 1];
      for (let w = 0; w < widths.length; w++) {
        const f = widths[w];
        const L = S * f;
        const n = Math.round(70 + 130 * f);
        for (let s = 0; s < 2; s++) {
          const side = s === 0 ? 1 : -1;
          curve(
            out,
            (t, p) => {
              const th = 0.06 + (Math.PI - 0.12) * t; // stanna strax utanför polen
              const sn = Math.sin(th);
              const r = L * sn * sn;
              p.x = cx + side * r * sn;
              p.y = cy - r * Math.cos(th);
            },
            n,
            S * 0.012,
            rr
          );
        }
      }
      // magneten själv: en kort lodrät stapel mellan polerna
      const bar = S * 0.15;
      for (let i = 0; i < 130; i++) {
        out.push(
          cx + (rr() - 0.5) * S * 0.05,
          cy - bar + (i / 129) * bar * 2 + (rr() - 0.5) * bar * 0.06
        );
      }
      return out;
    },
  },

  {
    name: 'interference',
    title: 'Två källor',
    note: 'Två källor sänder ringar mot varandra. Där topparna möts blir det tätt, däremellan tyst.',
    goal: 0.86,
    points: (W, H, rr) => {
      const out: number[] = [];
      const cx = W * 0.5;
      const cy = H * 0.5;
      const R = Math.min(W * 0.44, H * 0.38);
      const sep = R * 0.3; // avstånd från mitten ut till varje källa
      const rings = 6;
      const lam = (R * 0.7) / rings; // våglängd: avståndet mellan två toppar
      const gap = lam * 0.13; // punktavstånd längs en ring
      const bx0 = W * 0.05;
      const bx1 = W * 0.95;
      const by0 = H * 0.1;
      const by1 = H * 0.92;
      for (let s = 0; s < 2; s++) {
        const ox = s === 0 ? cx - sep : cx + sep;
        const other = s === 0 ? cx + sep : cx - sep;
        for (let m = 1; m <= rings; m++) {
          const rad = m * lam;
          const n = Math.max(24, Math.round((TAU * rad) / gap));
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + s * 0.15;
            const x = ox + Math.cos(a) * rad;
            const y = cy + Math.sin(a) * rad;
            /* Hur den andra källans våg står just här: topp mot topp fyller
               i punkten, topp mot dal släcker den. Det är de släckta stråken
               som ritar solfjädern mellan källorna. */
            const dOther = Math.hypot(x - other, y - cy);
            const amp = (1 + Math.cos((dOther / lam) * TAU)) * 0.5;
            if (amp < 0.32) continue;
            if (x < bx0 || x > bx1 || y < by0 || y > by1) continue;
            out.push(x + (rr() - 0.5) * gap * 0.5, y + (rr() - 0.5) * gap * 0.5);
          }
        }
        // källan själv — en tät liten skiva
        const golden = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < 40; i++) {
          const rad = lam * 0.3 * Math.sqrt(i / 40);
          const a = i * golden;
          out.push(ox + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        }
      }
      return out;
    },
  },

  {
    name: 'strata',
    title: 'Avlagringar',
    note: 'Lager på lager av sådant som sjunkit undan, brutet av en förkastning som sänkt ena halvan.',
    goal: 0.66,
    points: (W, H, rr) => {
      const out: number[] = [];
      const n2 = noise2(rr);
      const x0 = W * 0.06;
      const x1 = W * 0.94;
      const yTop = H * 0.28;
      const yBot = H * 0.8;
      const layers = 8;
      const faultX = W * 0.58; // sprickans läge vid det översta lagret
      const lean = Math.min(W * 0.1, H * 0.1); // hur mycket sprickan lutar nedåt
      const drop = H * 0.04; // hur långt högra halvan sjunkit
      const crack = W * 0.005;
      for (let k = 0; k < layers; k++) {
        const depth = k / (layers - 1);
        const base = yTop + (yBot - yTop) * depth;
        const fx = faultX + lean * depth;
        const per = 210;
        for (let i = 0; i < per; i++) {
          const x = x0 + (x1 - x0) * (i / (per - 1));
          if (x > fx - crack && x < fx + crack) continue; // sprickan står tom
          // lagren följer varandra: samma veckning, olika djup
          const fold = (n2(x / (W * 0.42), k * 0.35) - 0.5) * H * 0.09;
          const y = base + fold + (x > fx ? drop : 0) + (rr() - 0.5) * H * 0.006;
          out.push(x, y);
        }
      }
      // förkastningen som en glesare linje tvärs igenom
      for (let i = 0; i < 130; i++) {
        const u = i / 129;
        out.push(
          faultX + lean * u + (rr() - 0.5) * W * 0.004,
          yTop - H * 0.03 + (yBot + drop + H * 0.03 - (yTop - H * 0.03)) * u
        );
      }
      // löst material som ännu inte lagt sig, tunnare ju högre upp
      for (let i = 0; i < 160; i++) {
        const u = rr();
        out.push(x0 + (x1 - x0) * rr(), yTop - H * 0.07 * (u * u));
      }
      return out;
    },
  },
];
