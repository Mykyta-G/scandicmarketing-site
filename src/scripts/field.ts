/*
  Partikelfältet — Scandic Marketings levande yta.

  Egen kod, inga beroenden. CPU-fysik över typade arrayer + WebGL-punkter
  (WebGL2 → WebGL1 → Canvas 2D). Mörka, precisa punkter på vit mark — navy
  med blå accent. Partiklarna vilar tungt i sina formationer, andas långsamt,
  och blir levande först vid interaktion: markören skjuter undan dem, håll
  drar in dem, en snabb gest slungar iväg dem — fjädrarna samlar alltid ihop
  ordet igen.

  Formationer (data-field på sektionerna):
    logo     — hela logotypen: symbolen och "SCANDIC MARKETING" samplade
               ur img/logo.webp, samma fil som naven visar. Formen är alltså
               inte en efterlikning i Inter utan märket självt
    mark     — enbart symbolen ur logotypen, tät och skarp (Kontakt)
    strand   — en vandrande tråd; stoftet efter hjältens explosion samlar
               sig i den i stället för att bli ett formlöst moln (Samarbeten)
    bars     — stigande staplar (Resultat: mätbarhet)
    shapes   — play-triangel → hårkors genom Tjänster
    wave     — tre dyningar som vandrar (Break)
    steps    — stigande bana under stegtexten (Så arbetar vi)
    braid    — två trådar som väver om varandra (Vanliga frågor)
    drift    — fritt flöde, ingen formation
    converge — konvergenspunkt (fri, används i partikellabbet)

  Formationerna sitter inte fast i rutan. Var och en har ett ankare i
  layouten och räknas om ur dess färska rektangel varje bildruta, så figuren
  åker med innehållet i stället för att stå kvar medan sidan glider förbi.

  prefers-reduced-motion: en enda stilla, färdig bild — inga lyssnare, ingen loop.
*/

import type { Formation } from './lab/types';

const TAU = Math.PI * 2;

// mulberry32 — deterministiskt, billigt
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* extra: valfria formationer utifrån. Partikellabbet (/particle) skickar in
   sina kandidater den vägen, så motorn bara finns i en upplaga. */
export function initField(canvas: HTMLCanvasElement | null, extra: Formation[] = []) {
  if (!canvas) return;
  const guests = new Map(extra.map((f) => [f.name, f]));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;

  let W = innerWidth;
  let H = innerHeight;
  const DPR = Math.min(devicePixelRatio || 1, coarse ? 3 : 2); // riktiga mobiler: skarpare punkter

  // ————— Partikelbudget efter yta och enhet —————
  // Hjälten är hela logotypen numera: symbolen OCH två textrader. Bokstäverna
  // är tunna streck — med den gamla budgeten blev de prickade konturer i
  // stället för fyllda former, så taket är höjt rejält.
  const density = coarse ? 280 : 128;
  const maxN = coarse ? 3000 : 11000;
  // smala rutor behöver ett golv — logotypen ska bära även på 375 px
  const N = Math.max(W < 760 ? 2600 : coarse ? 2200 : 1600, Math.min(maxN, Math.round((W * H) / density)));

  // ————— Tillstånd —————
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const vx = new Float32Array(N);
  const vy = new Float32Array(N);
  const tx = new Float32Array(N);
  const ty = new Float32Array(N);
  const perm = new Uint32Array(N); // fast permutation → organiska morfer
  const seeds = new Float32Array(N * 3); // storlek, färgval, fas

  const rand = rng(56_04); // 56.04°N
  for (let i = 0; i < N; i++) {
    px[i] = rand() * W;
    py[i] = rand() * H;
    perm[i] = i;
    const c = rand();
    seeds[i * 3] = 1.2 + rand() * 1.5; // storlek (CSS-px) — små, hårda punkter
    seeds[i * 3 + 1] = c < 0.62 ? 0 : c < 0.92 ? 1 : 2; // 62/30/8 navy/blå/ljusblå
    seeds[i * 3 + 2] = rand() * TAU; // andningsfas
  }
  // Fisher–Yates med samma frö
  for (let i = N - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }

  let hasTargets = false;
  let formation = 'drift';
  let intensity = 0.4; // global täthet/opacitet, lerpas
  let intensityGoal = 0.9;
  let calm = 0; // 1 när märket vilar — hårdare kanter, ingen glimt
  let logoImg: HTMLImageElement | null = null;

  // ————— Formationsmål —————
  const off = document.createElement('canvas');
  off.width = 480; off.height = 270;
  const octx = off.getContext('2d', { willReadFrequently: true })!;

  function sampleOffscreen(
    maxPts: number,
    rect: { x: number; y: number; w: number; h: number },
    step = 2
  ) {
    const { data } = octx.getImageData(0, 0, off.width, off.height);
    const lit = (st: number, into: number[] | null) => {
      let c = 0;
      for (let y = 0; y < off.height; y += st) {
        for (let x = 0; x < off.width; x += st) {
          if (data[(y * off.width + x) * 4 + 3] > 100) {
            c++;
            if (into) into.push(x, y);
          }
        }
      }
      return c;
    };

    /* Steget ställs efter hur mycket bläck bilden faktiskt innehåller, i
       stället för att ta var n:te träff ur en tät lista. Rasterordnad
       gallring lägger diagonala band tvärs över fyllda ytor — symbolen blev
       kammad i stället för solid. Nu blir rutnätet jämnt och stride ≈ 1. */
    let st = Math.max(1, step);
    let c = lit(st, null);
    if (!c) return null;
    for (let pass = 0; pass < 2 && c > maxPts * 1.15; pass++) {
      st = Math.max(st + 1, Math.round(st * Math.sqrt(c / maxPts)));
      c = lit(st, null);
    }

    const pts: number[] = [];
    lit(st, pts);
    const n = pts.length / 2;
    if (!n) return null;
    const stride = Math.max(1, Math.floor(n / maxPts));
    const out: number[] = [];
    for (let i = 0; i < n; i += stride) {
      out.push(
        rect.x + (pts[i * 2] / off.width) * rect.w,
        rect.y + (pts[i * 2 + 1] / off.height) * rect.h
      );
    }
    return out;
  }

  function fitRect(aspect: number, maxWFrac: number, maxHFrac: number, cx: number, cy: number) {
    return fitBox(aspect, maxWFrac, maxHFrac, cx, cy * H);
  }
  function fitBox(aspect: number, maxWFrac: number, maxHFrac: number, cx: number, cyPx: number) {
    let w = W * maxWFrac;
    let h = w / aspect;
    if (h > H * maxHFrac) { h = H * maxHFrac; w = h * aspect; }
    return { x: cx * W - w / 2, y: cyPx - h / 2, w, h };
  }

  /* Varje formations ankare i layouten. Rektangeln läses färskt vid varje
     omräkning — det är skillnaden mellan en figur som följer med sidan och
     en som står kvar i rutan medan innehållet åker förbi. */
  const ANCHORS: Record<string, string> = {
    strand: '.clients .rail',
    bars: '.results .band',
    wave: '.break .content',
    braid: '.faq .list',
    mark: '.contact .rows',
  };
  const anchorEls = new Map<string, HTMLElement | null>();
  function anchorRect(name: string) {
    const sel = ANCHORS[name];
    if (!sel) return null;
    if (!anchorEls.has(name)) anchorEls.set(name, document.querySelector(sel));
    const el = anchorEls.get(name);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.height > 2 ? r : null;
  }
  let animT = 0; // sekunder — driver de formationer som ska leva

  // ————— Ordmärket — skarp text, inte bitmap —————
  // Glyferna samplas EN gång per storlek till råpunkter i offscreen-rymd;
  // läget i vyn läses färskt från #wm:s getBoundingClientRect varje bildruta.
  // gBCR ger den KLISTRADE positionen (offset-kedjan ger den oklistrade) och
  // följer även innehållets scroll-transform — därför är den enda sanningen.
  const FREE = 127; // 1/128 fritt strö i logoläget — resten bemannar märket
  let wordRaw: number[] | null = null; // logotypens punkter i offscreen-pixlar
  let wordW = 1, wordH = 1; // offscreen-mått vid samplingen
  let wmBoxCur = { x: 0, y: 0, w: 0, h: 0 }; // logotypens ruta i vyn just nu
  let markRaw: number[] | null = null; // enbart symbolen, i offscreen-pixlar
  let markW = 1, markH = 1;

  function sampleWord(): boolean {
    // Punkterna ligger i offscreen-rymd och är oberoende av rutans storlek —
    // samplas en gång, återanvänds vid varje omritning och varje resize.
    if (wordRaw) return true;
    if (!logoImg) return false; // driv fritt tills filen är dekodad

    const iw = logoImg.naturalWidth || 480;
    const ih = logoImg.naturalHeight || 159;
    // rita upp märket stort: fler räknare i samplingen, mjukare kant
    off.width = Math.min(1920, Math.round(iw * 3));
    off.height = Math.round((off.width * ih) / iw);
    octx.clearRect(0, 0, off.width, off.height);
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(logoImg, 0, 0, off.width, off.height);

    // nästan hela budgeten på märket — bara ett tunt strö förblir fritt
    const maxPts = Math.min(7600, Math.max(900, Math.round(N * 0.85)));
    const t = sampleOffscreen(maxPts, { x: 0, y: 0, w: off.width, h: off.height }, 2);
    if (!t) return false;
    wordRaw = t;
    wordW = off.width;
    wordH = off.height;
    return true;
  }

  // Logotypens ruta i vyn — läses färskt VARJE bildruta den visas, aldrig
  // cachad. gBCR på #wm är sanningen i alla lägen: klistrad, oklistrad och
  // mitt i innehållets scroll-transform (lyft + skalat).
  function wmViewBox() {
    const el = document.getElementById('wm');
    if (el) {
      const b = el.getBoundingClientRect();
      if (b.width > 8 && b.height > 8) {
        const s = Math.min(b.width / wordW, b.height / wordH);
        return {
          x: b.left,
          y: b.top + (b.height - wordH * s) / 2,
          w: wordW * s,
          h: wordH * s,
        };
      }
    }
    return fitRect(wordW / wordH, W < 760 ? 0.86 : 0.64, 0.4, 0.5, 0.42);
  }

  // Lägg märkets punkter i rutan. Deterministisk (samma frön) — kan köras om
  // varje bildruta utan att partiklarna byter plats inbördes.
  function layoutWord(box: { x: number; y: number; w: number; h: number }) {
    wmBoxCur = box;
    if (!wordRaw) return;
    const m = wordRaw.length / 2;
    const sx = box.w / wordW;
    const sy = box.h / wordH;
    for (let i = 0; i < N; i++) {
      const j = perm[i] % m;
      // logotypen kräver stillhet: nästan inget spridningsbrus kring målet
      tx[i] = box.x + wordRaw[j * 2] * sx + (seeds[i * 3] - 1.95) * 0.35;
      ty[i] = box.y + wordRaw[j * 2 + 1] * sy + (seeds[i * 3 + 2] - Math.PI) * 0.14;
    }
  }

  function targetsFor(name: string, progress: number): number[] | null {
    const rr = rng(1234 + name.length);

    const guest = guests.get(name);
    if (guest) return guest.points(W, H, rr);

    if (name === 'bars') {
      // fem stigande staplar av punkter — mätbarhet. Står på resultatbandets
      // överkant och åker med det: figuren hör ihop med siffrorna, inte med rutan.
      const out: number[] = [];
      const heights = [0.3, 0.45, 0.4, 0.62, 0.85];
      const a = anchorRect('bars');
      const bandW = Math.min(a ? a.width * 0.86 : W * 0.6, 760);
      const x0 = a ? a.left + (a.width - bandW) / 2 : (W - bandW) / 2;
      const baseY = a ? a.top - Math.max(24, H * 0.03) : H * 0.72;
      const colW = bandW / heights.length;
      for (let c = 0; c < heights.length; c++) {
        const hgt = heights[c] * H * 0.42;
        const pts = Math.round(340 * heights[c]) + 90;
        for (let i = 0; i < pts; i++) {
          out.push(x0 + c * colW + colW * 0.18 + rr() * colW * 0.52, baseY - rr() * hgt);
        }
      }
      return out;
    }

    if (name === 'shapes') {
      if (off.width !== 480) { off.width = 480; off.height = 270; }
      octx.clearRect(0, 0, off.width, off.height);
      octx.fillStyle = octx.strokeStyle = '#fff';
      const cx = off.width / 2, cy = off.height / 2;
      octx.lineWidth = 7;

      /* Två former: play-triangel → hårkors. Bländaren och webbläsarramen
         är borta (foto och hemsidor — tjänster han inte säljer). */
      if (progress < 0.5) {
        // play-triangel
        octx.beginPath();
        octx.moveTo(cx - 55, cy - 70);
        octx.lineTo(cx + 75, cy);
        octx.lineTo(cx - 55, cy + 70);
        octx.closePath();
        octx.stroke();
      } else {
        // hårkors: ring, kors genom mitten, prick i centrum
        octx.beginPath();
        octx.arc(cx, cy, 76, 0, TAU);
        octx.stroke();

        octx.lineWidth = 6;
        const gap = 22, arm = 108;
        octx.beginPath();
        octx.moveTo(cx - arm, cy); octx.lineTo(cx - gap, cy);
        octx.moveTo(cx + gap, cy); octx.lineTo(cx + arm, cy);
        octx.moveTo(cx, cy - arm); octx.lineTo(cx, cy - gap);
        octx.moveTo(cx, cy + gap); octx.lineTo(cx, cy + arm);
        octx.stroke();

        octx.beginPath();
        octx.arc(cx, cy, 8, 0, TAU);
        octx.fill();
      }
      return sampleOffscreen(2000, fitRect(16 / 9, 0.5, 0.55, 0.72, 0.5));
    }

    if (name === 'wave') {
      /* Tre dyningar tvärs hela bredden, centrerade på brytsektionens text.
         Vågorna VANDRAR: fasen drivs av klockan och målen räknas om varje
         bildruta, så vattnet rör sig i stället för att stå som en frusen bild.
         Varje partikel har sin egen plats längs kurvan (u ur permutationen),
         alltså glider den längs vågen — den hoppar inte mellan punkter. */
      const a = anchorRect('wave');
      const mid = a ? a.top + a.height / 2 : H * 0.52;
      const amp = Math.min(H * 0.05, 64);
      const out: number[] = [];
      const rows = [-1.15, 0, 1.15];
      for (let ri = 0; ri < rows.length; ri++) {
        const yBase = mid + rows[ri] * amp * 1.35;
        const ph = animT * (0.26 + ri * 0.05) + ri * 1.9;
        const pts = 780;
        for (let i = 0; i < pts; i++) {
          const x = (i / pts) * W;
          const y =
            yBase +
            Math.sin((x / W) * TAU * 1.6 - ph) * amp * 0.72 +
            Math.sin((x / W) * TAU * 3.7 - ph * 1.7 + ri * 4.1) * amp * 0.26 +
            (rr() - 0.5) * amp * 0.34;
          out.push(x, y);
        }
      }
      return out;
    }

    if (name === 'strand') {
      /* Efter hjältens explosion: stoftet samlar sig i en enda vandrande
         tråd i stället för att bli ett formlöst moln. Tunn, låg, lugn —
         den ska läsas som en linje, inte som en våg. */
      /* Ligger i tomrummet OVANFÖR logotypremsan, aldrig över märkena:
         två trådar som korsar en logotyp gör båda svårlästa. */
      const a = anchorRect('strand');
      const amp = Math.min(H * 0.09, 96);
      const mid = a ? a.top - Math.max(amp * 1.5, H * 0.13) : H * 0.36;
      const out: number[] = [];
      const pts = 1500;
      for (let i = 0; i < pts; i++) {
        const u = i / pts;
        const x = -W * 0.04 + u * W * 1.08;
        const y =
          mid +
          Math.sin(u * TAU * 1.15 - animT * 0.22) * amp +
          Math.sin(u * TAU * 2.6 + animT * 0.15) * amp * 0.3 +
          (rr() - 0.5) * amp * 0.16;
        out.push(x, y);
      }
      return out;
    }

    if (name === 'braid') {
      /* Två trådar som väver om varandra och byter plats där de möts —
         fråga och svar. Ligger bakom frågelistan, nedtonad. */
      const a = anchorRect('braid');
      const mid = a ? a.top + a.height / 2 : H * 0.5;
      const amp = Math.min(H * 0.14, 150);
      const out: number[] = [];
      const pts = 900;
      for (let k = 0; k < 2; k++) {
        const sign = k ? -1 : 1;
        for (let i = 0; i < pts; i++) {
          const u = i / pts;
          const x = -W * 0.04 + u * W * 1.08;
          const y =
            mid +
            sign * Math.sin(u * TAU * 1.4 - animT * 0.2) * amp +
            sign * Math.sin(u * TAU * 3.1 + animT * 0.11) * amp * 0.18 +
            (rr() - 0.5) * amp * 0.1;
          out.push(x, y);
        }
      }
      return out;
    }

    if (name === 'steps') {
      /* Så arbetar vi: en stigande bana över hela bredden med tre hållpunkter
         — kartläggning, produktion, avläsning. Bandet läggs i luften UNDER
         steglistan, mätt färskt ur layouten, så att texten aldrig hamnar
         ovanpå banan hur långt man än scrollat. */
      const band = stepsBand();
      const out: number[] = [];
      const x0 = W * 0.06, x1 = W * 0.94;
      const yLo = band.bottom, yHi = band.top;
      const stops = [0.08, 0.5, 0.92];
      const pathY = (u: number) =>
        yLo + (yHi - yLo) * (u * u * (3 - 2 * u)) + Math.sin(u * TAU * 1.4) * H * 0.012;

      // banan
      const pts = 900;
      for (let i = 0; i < pts; i++) {
        const u = i / pts;
        out.push(x0 + (x1 - x0) * u, pathY(u) + (rr() - 0.5) * H * 0.008);
      }

      // hållpunkter: en ring per steg, den sista fylld
      for (let s = 0; s < stops.length; s++) {
        const u = stops[s];
        const cx = x0 + (x1 - x0) * u;
        const cy = pathY(u);
        const rad = Math.min(Math.min(W, H) * 0.045, (yLo - yHi) * 0.42);
        const ring = 190;
        for (let i = 0; i < ring; i++) {
          const a = (i / ring) * TAU;
          out.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        }
        if (s === stops.length - 1) {
          for (let i = 0; i < 120; i++) {
            const a = rr() * TAU;
            const d = Math.sqrt(rr()) * rad * 0.5;
            out.push(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
          }
        }
      }
      return out;
    }

    if (name === 'mark') {
      /* Enbart symbolen ur logotypen — tät och skarp. Symbolen ligger i
         x 8–122, y 8–150 av den 480×159 stora filen. */
      if (!markRaw) {
        if (!logoImg) return null;
        const k = (logoImg.naturalWidth || 480) / 480;
        off.width = 420;
        off.height = Math.round((420 * 143) / 115);
        octx.clearRect(0, 0, off.width, off.height);
        octx.imageSmoothingQuality = 'high';
        octx.drawImage(logoImg, 8 * k, 8 * k, 115 * k, 143 * k, 0, 0, off.width, off.height);
        const pts = sampleOffscreen(3200, { x: 0, y: 0, w: off.width, h: off.height }, 2);
        if (!pts) return null;
        markRaw = pts; markW = off.width; markH = off.height;
      }
      // brett: en tät symbol bredvid uppgifterna. Smalt: ingen fri yta finns
      // — då blir den i stället en stor, blek vattenstämpel bakom allt.
      // Ankrad i kontaktraderna: symbolen åker med uppgifterna i stället för
      // att stå kvar i rutan och skäras av sidfoten på vägen ut.
      const a = anchorRect('mark');
      const narrow = W < 900;
      const cy = a ? a.top + a.height / 2 : H * 0.5;
      const box = narrow
        ? fitBox(markW / markH, 0.72, 0.46, 0.5, cy)
        : fitBox(markW / markH, 0.22, 0.62, a ? (a.right + W) / 2 / W : 0.78, cy);
      const out: number[] = [];
      for (let i = 0; i < markRaw.length; i += 2) {
        out.push(
          box.x + (markRaw[i] / markW) * box.w,
          box.y + (markRaw[i + 1] / markH) * box.h
        );
      }
      return out;
    }

    if (name === 'converge') {
      // fyllotaxi-spiral — allt samlas i en punkt
      const out: number[] = [];
      const cx = W * 0.5, cy = H * 0.46;
      const maxR = Math.min(W, H) * 0.3;
      const pts = 1400;
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < pts; i++) {
        const rad = maxR * Math.sqrt(i / pts);
        const a = i * golden;
        out.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      return out;
    }

    return null; // drift
  }

  const GOALS: Record<string, number> = {
    logo: 1.12, mark: 1.05, drift: 0.42, bars: 0.62, shapes: 0.62, wave: 0.72,
    steps: 0.68, strand: 0.66, braid: 0.5, converge: 0.72,
  };
  for (const f of extra) GOALS[f.name] = f.goal;

  let shapesEl: Element | null = null;
  let shapesPhase = -1;
  let lastProgress = 0;
  let stepsEl: Element | null = null;
  let stepsTop = -1e9;
  let stepsTight = false; // listan är högre än rutan — ingen fri yta under den

  /* Steglistans underkant i vyn — banan lägger sig i luften därunder.
     På en telefon står stegen i en spalt och listan är högre än skärmen: då
     finns ingen sådan luft, och banan får i stället ligga längst ner och
     tonas ner till vattenstämpel. Läsbarheten går före effekten. */
  function stepsBand() {
    let top = H * 0.68;
    stepsTight = false;
    if (stepsEl) {
      const r = stepsEl.getBoundingClientRect();
      if (r.height > 4) {
        // Marginalen krymper när luften under listan är knapp — men banan
        // flyttas ALDRIG upp i texten för att få plats. Är luften helt slut
        // (listan högre än rutan) blir banan en blek vattenstämpel längst ner.
        const room = H - r.bottom;
        top = r.bottom + Math.min(Math.max(28, H * 0.06), Math.max(12, room * 0.28));
        stepsTight = room < H * 0.12;
      }
    }
    top = Math.max(H * 0.12, Math.min(top, H * 0.9));
    return { top, bottom: Math.min(H * 0.99, top + Math.min(H * 0.23, 210)) };
  }

  function setFormation(name: string, progress = 0) {
    lastProgress = progress;
    if (name === 'logo') {
      const reentry = formation !== 'logo';
      formation = 'logo';
      intensityGoal = GOALS.logo;
      if (!sampleWord()) { hasTargets = false; return; }
      hasTargets = true;
      layoutWord(wmViewBox()); // och sedan varje bildruta i loopen

      /* Tillbaka till toppen efter att ha varit nere på sidan: ordet ska
         inte bara stå där. Partiklarna får en utåtriktad knuff från ordets
         mitt — de kastas ut och fjädern samlar ihop dem igen. Samma
         explosion som på vägen ner, fast baklänges. */
      if (reentry) {
        const cx = wmBoxCur.x + wmBoxCur.w / 2;
        const cy = wmBoxCur.y + wmBoxCur.h / 2;
        for (let i = 0; i < N; i++) {
          const dx = px[i] - cx, dy = py[i] - cy;
          const d = Math.hypot(dx, dy) || 1;
          const kick = 620 + seeds[i * 3 + 2] * 150;
          vx[i] += (dx / d) * kick;
          vy[i] += (dy / d) * kick - 120; // en aning uppåt: lyft, inte ras
        }
      }
      return;
    }
    if (formation !== name) anchorPrevY = NaN;
    formation = name;
    intensityGoal = GOALS[name] ?? 0.5;
    // ligger formen bakom text tonas den ner till vattenstämpel
    if (name === 'steps' && stepsTight) intensityGoal = 0.34;
    if (name === 'mark' && W < 900) intensityGoal = 0.4;
    applyTargets(name, progress);
  }

  /* Räknar om målen för en formation och lägger dem i tx/ty. Deterministisk:
     samma partikel hamnar på samma plats i figuren varje gång, så den kan
     köras om varje bildruta utan att punkterna byter plats inbördes — det är
     det som gör att vågen VANDRAR i stället för att blinka om. */
  function applyTargets(name: string, progress = 0) {
    const t = targetsFor(name, progress);
    if (!t) { hasTargets = false; return; }
    hasTargets = true;
    const m = t.length / 2;
    // symbolen ska läsas som en form, inte som ett moln — nästan inget brus
    const jx = name === 'mark' ? 0.6 : 3;
    const jy = name === 'mark' ? 0.4 : 2;
    for (let i = 0; i < N; i++) {
      const j = perm[i] % m;
      tx[i] = t[j * 2] + (seeds[i * 3] - 1.95) * jx;
      ty[i] = t[j * 2 + 1] + (seeds[i * 3 + 2] - Math.PI) * jy;
    }
  }

  /* Formationer som räknas om varje bildruta: de är billiga (ren aritmetik)
     och antingen levande eller ankrade i layouten. 'shapes' står utanför —
     den läser tillbaka en canvas och kostar för mycket per bildruta.
     'logo' har sin egen väg via layoutWord. */
  const LIVE = new Set(['wave', 'strand', 'braid', 'bars', 'mark']);

  /* Rigid följning.

     En ankrad formation får nya mål när sidan scrollar, och fjädern drar
     partiklarna efter. Vid långsam scroll märks det inte; vid snabb scroll
     ligger figuren efter och guppar ikapp — den ser ut att jaga vyn.

     Botemedlet är att flytta partiklarna lika mycket som ankaret flyttade
     sig, i samma bildruta som målen. Då är avståndet till målet oförändrat
     och fjädern har inget att ta igen: figuren sitter fast i sidan och
     scrollar som vilket innehåll som helst. Fjädern får sköta formen, inte
     transporten. */
  let pinBottom = H; // hjältepinnens underkant i vyn — trådarnas fäste
  let pinPrev = NaN;
  let dispS = 0; // utjämnad upplösningsgrad
  let anchorPrevY = NaN;
  function rideAnchor(name: string) {
    const r = anchorRect(name);
    if (!r) { anchorPrevY = NaN; return; }
    const y = r.top + r.height / 2;
    if (Number.isFinite(anchorPrevY)) {
      const dy = y - anchorPrevY;
      // stora hopp (ankarbyte, hash-navigering) ska inte kasta iväg molnet
      if (dy !== 0 && Math.abs(dy) < H * 1.5) {
        for (let i = 0; i < N; i++) py[i] += dy;
      }
    }
    anchorPrevY = y;
  }

  // ————— Rendering: WebGL med Canvas2D-fallback —————
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);

  const gl = (canvas.getContext('webgl2', { alpha: true, antialias: false }) ||
    canvas.getContext('webgl', { alpha: true, antialias: false })) as
    | WebGLRenderingContext
    | null;

  let draw: (time: number) => void;
  let ctx2d: CanvasRenderingContext2D | null = null;

  if (gl) {
    const vsrc = `
attribute vec2 aPos;
attribute vec3 aSeed;
uniform vec2 uRes;
uniform float uTime;
uniform float uDpr;
uniform mediump float uCalm;
uniform mediump float uWm;
varying float vShade;
varying float vTw;
void main() {
  vec2 clip = (aPos / uRes) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vShade = aSeed.y;
  vTw = 0.88 + 0.12 * (1.0 - 0.7 * uCalm) * sin(uTime * 0.35 + aSeed.z);
  gl_PointSize = aSeed.x * uDpr * (1.0 + uWm * uCalm);
}`;
    const fsrc = `
precision mediump float;
uniform float uAlpha;
uniform mediump float uCalm;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
varying float vShade;
varying float vTw;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, mix(0.2, 0.34, uCalm), d) * uAlpha * vTw;
  vec3 c = vShade < 0.5 ? uC0 : (vShade < 1.5 ? uC1 : uC2);
  c = mix(c, uC0, 0.3 * uCalm); // ordläge: dra paletten mot navy — orden ska bära
  gl_FragColor = vec4(c * a, a);
}`;
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, vsrc));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, fsrc));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const posBuf = gl.createBuffer();
    const seedBuf = gl.createBuffer();
    const aPos = gl.getAttribLocation(prog, 'aPos');
    const aSeed = gl.getAttribLocation(prog, 'aSeed');
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aSeed);
    gl.vertexAttribPointer(aSeed, 3, gl.FLOAT, false, 0, 0);

    const interleaved = new Float32Array(N * 2);
    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uDpr = gl.getUniformLocation(prog, 'uDpr');
    const uAlpha = gl.getUniformLocation(prog, 'uAlpha');
    const uCalm = gl.getUniformLocation(prog, 'uCalm');
    const uWm = gl.getUniformLocation(prog, 'uWm');
    // mörka märken på vit mark — navy bär, blått accentuerar
    gl.uniform3f(gl.getUniformLocation(prog, 'uC0'), 0.016, 0.071, 0.231); // #04123b
    gl.uniform3f(gl.getUniformLocation(prog, 'uC1'), 0.145, 0.388, 0.922); // #2563eb
    gl.uniform3f(gl.getUniformLocation(prog, 'uC2'), 0.231, 0.51, 0.965); // #3b82f6
    gl.uniform1f(uDpr, DPR);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // normal alfa (premultiplicerad)
    gl.clearColor(0, 0, 0, 0);

    draw = (time) => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, W, H);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uAlpha, Math.min(1, intensity * 0.92));
      gl.uniform1f(uCalm, calm);
      // ordläge: punkterna växer något så glyferna fylls — mer på smal skärm
      gl.uniform1f(uWm, W < 760 ? 0.42 : 0.45);
      gl.clear(gl.COLOR_BUFFER_BIT);
      for (let i = 0; i < N; i++) {
        interleaved[i * 2] = px[i];
        interleaved[i * 2 + 1] = py[i];
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, N);
    };
  } else {
    // Canvas 2D — gamla/svaga enheter
    ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const cols = ['#04123b', '#2563eb', '#3b82f6'];
    draw = () => {
      const c = ctx2d!;
      c.setTransform(DPR, 0, 0, DPR, 0, 0);
      c.clearRect(0, 0, W, H);
      c.globalAlpha = Math.min(1, intensity * 0.92);
      const word = calm > 0.5;
      const step = word ? 2 : 4; // ordmärket behöver tätheten
      for (let i = 0; i < N; i += step) {
        c.fillStyle = cols[seeds[i * 3 + 1]];
        const s = seeds[i * 3] * (word ? 1.35 : 1);
        c.fillRect(px[i], py[i], s, s);
      }
      c.globalAlpha = 1;
    };
  }

  // fallback-texten i hjälten viker undan när fältet tagit över rendering
  const wmEl = document.getElementById('wm');
  const takeOver = () => { wmEl?.classList.add('wm-taken'); };

  // Logotypen ÄR hjältens titel — vänta tills filen är dekodad innan vi samplar.
  const LOGO_SRC = `${import.meta.env.BASE_URL.replace(/\/+$/, '')}/img/logo.webp`;
  let loadingLogo = false;
  let logoTries = 0;
  function reloadLogo() {
    if (loadingLogo) return Promise.resolve();
    loadingLogo = true;
    const n = logoTries++;
    return new Promise<void>((res) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => { logoImg = im; loadingLogo = false; res(); };
      im.onerror = () => { loadingLogo = false; res(); };
      // första försöket delar naven's kopia; omförsök går förbi cachen,
      // annars serveras samma misslyckande om och om igen
      im.src = n ? `${LOGO_SRC}?r=${n}` : LOGO_SRC;
    });
  }
  const logoGate = reloadLogo();

  // ————— Reducerad rörelse: en stilla, färdig bild — sedan klart —————
  if (reduced) {
    logoGate.then(() => {
      setFormation('logo');
      for (let i = 0; i < N; i++) { px[i] = tx[i]; py[i] = ty[i]; }
      intensity = 1.05;
      calm = 1;
      draw(1.5);
      if (hasTargets) takeOver(); // annars står textfallbacken kvar
    });
    return;
  }

  // ————— Interaktion —————
  let mx = -9999, my = -9999, pmx = -9999, pmy = -9999;
  let mvx = 0, mvy = 0;
  let holding = false;

  addEventListener('pointermove', (e) => {
    if (pmx > -9000) {
      mvx = e.clientX - pmx;
      mvy = e.clientY - pmy;
    }
    pmx = mx = e.clientX;
    pmy = my = e.clientY;
  }, { passive: true });
  addEventListener('pointerdown', (e) => {
    const el = e.target as Element;
    if (!el.closest || !el.closest('a, button, summary, input, select, textarea, label')) holding = true;
    pmx = mx = e.clientX;
    pmy = my = e.clientY;
  }, { passive: true });
  addEventListener('pointerup', () => { holding = false; }, { passive: true });
  addEventListener('pointercancel', () => { holding = false; }, { passive: true });
  addEventListener('pointerleave', () => { mx = my = -9999; pmx = pmy = -9999; }, { passive: true });

  // ————— Formationer följer scrollen —————
  /* Ägaren räknas ut ur färska rektanglar varje bildruta, inte ur
     IntersectionObserver-poster. Observatören levererar flera sektioner i
     samma svall vid en snabb svep, och den som råkade ligga sist i listan
     vann — scrollade man sedan inte mer satt fel formation kvar för alltid.
     Ingen händelseleverans att lita på nu: sektionen vars mitt ligger
     närmast rutans mittlinje, och som täcker den, äger fältet. */
  const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-field]'));
  shapesEl = sections.find((s) => s.dataset.field === 'shapes') || null;
  stepsEl = document.querySelector('[data-field="steps"] .steps');

  function ownerField(): string | null {
    const mid = H / 2;
    let best: HTMLElement | null = null;
    let bestD = Infinity;
    for (const el of sections) {
      const r = el.getBoundingClientRect();
      if (r.top > mid || r.bottom < mid) continue; // täcker inte mittlinjen
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestD) { bestD = d; best = el; }
    }
    return best ? best.dataset.field || 'drift' : null; // ingen? behåll den vi har
  }

  // ————— Loopen —————
  let raf = 0;
  let last = performance.now();
  let running = true;
  let ownerT = 0;
  let retryT = 0;
  let pinEl: HTMLElement | null = null;

  function tick(now: number) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 1 / 30); // realtid → samma rörelse i 60 som 120 Hz
    last = now;
    const t = now / 1000;

    // Tjänster: två former efter hur långt man scrollat genom sektionen
    if (formation === 'shapes' && shapesEl) {
      const r = shapesEl.getBoundingClientRect();
      const prog = Math.min(Math.max((H * 0.5 - r.top) / Math.max(r.height, 1), 0), 0.999);
      const phase = prog < 0.5 ? 0 : 1;
      if (phase !== shapesPhase) {
        shapesPhase = phase;
        setFormation('shapes', prog);
      }
    }

    /* Trådarnas fäste läses färskt: de hänger i hjältepinnen, inte i rutan.
       Utan detta står de kvar mitt i vyn och följer med skärmen nedåt — de
       ska tvärtom ligga still i sidan och scrolla ut ur bilden. */
    if (!pinEl) pinEl = document.querySelector('.hero-pin');
    if (pinEl) pinBottom = pinEl.getBoundingClientRect().bottom;
    const dPin = Number.isFinite(pinPrev) ? pinBottom - pinPrev : 0;
    pinPrev = pinBottom;

    // Vem äger fältet just nu? Billigt: en handfull rektangler, var 8:e bildruta.
    ownerT += dt;
    if (ownerT > 0.13) {
      ownerT = 0;
      const owner = ownerField();
      if (owner === 'shapes') {
        if (formation !== 'shapes') { shapesPhase = -1; formation = 'shapes'; }
      } else if (owner && owner !== formation) {
        setFormation(owner);
      } else if (owner === 'logo' && !hasTargets) {
        // logotypfilen fanns inte när vi först försökte (avbrott, kall
        // dev-server, tappat nät). Försök igen — annars driver hjälten
        // fritt resten av besöket och titeln kommer aldrig tillbaka.
        retryT += 0.13;
        if (retryT > 0.6) {
          retryT = 0;
          if (logoImg) { setFormation('logo'); if (hasTargets) takeOver(); }
          else reloadLogo().then(() => {
            if (!logoImg || formation !== 'logo') return;
            setFormation('logo');
            if (hasTargets) takeOver(); // bildfallbacken viker undan först nu
          });
        }
      }
    }

    animT = t;

    // Levande och ankrade formationer räknas om varje bildruta: vågorna
    // vandrar, och figurerna åker med sitt innehåll när sidan scrollar.
    if (hasTargets && LIVE.has(formation)) {
      rideAnchor(formation); // flytta molnet FÖRE målen — annars uppstår glappet
      applyTargets(formation, lastProgress);
    }

    // Så arbetar vi: banan följer steglistan i stället för att stå still i
    // vyn medan texten glider upp i den
    if (formation === 'steps' && stepsEl) {
      const b = stepsBand();
      if (Math.abs(b.top - stepsTop) > 2) { stepsTop = b.top; setFormation('steps'); }
    }

    intensity += (intensityGoal - intensity) * Math.min(1, dt * 2.5);
    const wordMode = hasTargets && formation === 'logo';

    // Ordets ruta läses om VARJE bildruta — aldrig cachad över scroll.
    // Klistrad, oklistrad, transformerad, efter resize: målen följer #wm,
    // så ordet återsamlas alltid exakt i sin slot oavsett scrollväg.
    if (wordMode) {
      const b = wmViewBox();
      if (
        Math.abs(b.x - wmBoxCur.x) > 0.1 || Math.abs(b.y - wmBoxCur.y) > 0.1 ||
        Math.abs(b.w - wmBoxCur.w) > 0.1 || Math.abs(b.h - wmBoxCur.h) > 0.1
      ) {
        layoutWord(b);
      }
    }

    // Hjältens upplösning: ordet släpper taget i takt med scrollen och
    // samlar ihop sig igen på vägen upp — övergången ÄR effekten.
    /* Upplösningsgraden läses inte rakt av scrollpositionen. Ett hjul
       levererar scroll i klumpar om 100–120 px; läser man dem direkt hoppar
       morfningen i samma takt och trådarna ser ut att skaka. Värdet jagar
       i stället sitt mål med en egen tidskonstant, så rycken jämnas ut utan
       att övergången blir långsammare. */
    let disp = 0;
    if (wordMode) {
      const p = Math.min(Math.max(scrollY / (H * 0.5), 0), 1);
      dispS += (p * p * (3 - 2 * p) - dispS) * Math.min(1, dt * 7);
      disp = dispS;
    } else {
      dispS = 0;
    }

    // calm = skarpt läge: större, hårdare punkter. Gäller logotypen medan den
    // vilar, och symbolen i Kontakt — båda ska läsas som märket, inte som dis.
    const sharp = wordMode ? 1 - disp : formation === 'mark' && hasTargets ? 1 : 0;
    /* Trådarna hänger i pinnen och pinnen rör sig med scrollen. Utan detta
       drar fjädern partiklarna efter de nya målen och hela knippet skakar
       vid snabb scroll. Flytta dem lika mycket som fästet flyttade sig, i
       samma bildruta — men bara i den mån de faktiskt är trådar: ordet
       självt sitter i den klistrade hjälten och ska inte flyttas alls. */
    if (wordMode && disp > 0.002 && dPin !== 0 && Math.abs(dPin) < H * 1.5) {
      const gAll = Math.min(disp / 0.42, 1);
      const ride = dPin * gAll * gAll * (3 - 2 * gAll);
      if (ride !== 0) for (let i = 0; i < N; i++) py[i] += ride;
    }

    calm += (sharp - calm) * Math.min(1, dt * 3);

    // kritiskt dämpade fjädrar: partiklarna anländer, stannar och står stilla
    const damp = Math.exp(-(hasTargets ? (wordMode ? 8 : 6.2) : 1.3) * dt);
    const spring = (wordMode ? 16 : 10) * dt;
    const driftAmp = 1.6 * dt; // i formation: långsam, sammanhängande andning
    const freeAmp = 12 * dt; // fritt flöde: fortfarande lugnt
    const R = holding ? 340 : 240;
    const mmag = Math.hypot(mvx, mvy);

    for (let i = 0; i < N; i++) {
      let x = px[i], y = py[i];
      const free = !hasTargets || (wordMode && (i & FREE) === FREE); // tunt fritt strö bakom ordet

      if (free) {
        // organiskt flöde — bara de fria punkterna
        const a =
          Math.sin(x * 0.0012 + t * 0.16 + seeds[i * 3 + 2] * 0.6) * 1.9 +
          Math.cos(y * 0.0011 - t * 0.13) * 1.7;
        vx[i] += Math.cos(a) * freeAmp;
        vy[i] += Math.sin(a) * freeAmp;
        // i ordläget hör varje strö hemma på en egen fast punkt i ordets
        // band — svag fjäder dit. Utspridda mörka korn över hela den vita
        // sidan läses som damm; en gles, avsiktlig aura kring ordet gör inte det.
        if (wordMode && wmBoxCur.w > 0) {
          const ph = seeds[i * 3 + 2];
          const u = (seeds[i * 3] - 1.2) / 1.5; // 0..1 ur storleksfröet
          const hx = wmBoxCur.x + wmBoxCur.w * (0.5 + Math.cos(ph) * 0.52 * (0.3 + 0.7 * u));
          // smal skärm: undertexten ligger tätt under ordet — håll auran snävare
          const hy = wmBoxCur.y + wmBoxCur.h * (0.5 + Math.sin(ph * 7) * (W < 760 ? 0.62 : 0.95));
          vx[i] += (hx - x) * 1.4 * dt;
          vy[i] += (hy - y) * 1.4 * dt;
        }
      } else {
        // i formation: rumsligt sammanhängande, långsam dyning — grannar rör sig ihop
        const a = Math.sin(x * 0.0008 + t * 0.1) * 2.0 + Math.cos(y * 0.0007 - t * 0.09) * 2.0;
        vx[i] += Math.cos(a) * driftAmp;
        vy[i] += Math.sin(a) * driftAmp;
        /* Hjältens upplösning i två akter.

           Först exploderar ordet — partiklarna kastas utåt. Men ett moln som
           bara fortsätter tunnas ut lämnar en tom, grå yta mellan hjälten och
           logotyperna. Så i andra akten samlar sig stoftet i TVÅ nedåtgående
           trådar som väver om varandra och rinner ner mot samarbetsremsan,
           där de möts i den vågräta tråden. Explosionen får en riktning. */
        let txi = tx[i], tyi = ty[i];
        if (disp > 0.002) {
          const ph = seeds[i * 3 + 2];
          const sz = (seeds[i * 3] - 1.2) / 1.5; // 0..1 ur storleksfröet

          /* Knuffen utåt är bara en knuff — inget moln. Tidigare svällde
             ordet till en skärmfyllande grå sky som låg kvar en hel
             skärmhöjd innan trådarna tog form. Nu släpper bokstäverna och
             dras direkt in i trådarna: ingen mellanbild. */
          const blast = Math.min(disp / 0.1, 1);
          const rad = blast * H * (0.05 + 0.11 * sz);
          txi += Math.cos(ph * 3.7) * rad;
          tyi += (Math.sin(ph * 2.9) - 0.7) * rad;

          // och genast ner i två trådar
          const g = Math.min(disp / 0.42, 1);
          if (g > 0) {
            const gather = g * g * (3 - 2 * g);
            const side = i & 1 ? 1 : -1;
            const u = (ph / TAU + sz * 0.37) % 1; // egen plats längs tråden

            /* Trådarna går isär på vägen ner och lämnar rutan i var sitt
               nedre hörn — de rinner ut ur bilden i stället för att sluta
               mitt i den. Kvadratisk öppning: smalt uppe, brett nere. */
            const splay = 0.13 + 0.62 * u * u;
            // en tråd är inte en linje: den har kropp. Tvärsnittet växer
            // nedåt, tätast i mitten (kubisk fördelning ur fröet).
            const q = Math.sin(ph * 12.9 + sz * 7.3);
            const thick = (W * 0.016 + u * W * 0.03) * q * q * q;

            const sx =
              W * 0.5 +
              side * (W * splay + thick) +
              Math.sin(u * TAU * 1.35 + animT * 0.3 + (side > 0 ? 0 : 2.1)) * W * 0.05;
            // dokumentförankrat: mätt från pinnens underkant, inte från rutan
            const sy = pinBottom - H * 1.06 + u * H * 1.5 + Math.cos(ph * 8.1) * H * 0.012;
            txi += (sx - txi) * gather;
            tyi += (sy - tyi) * gather;
          }
        }
        vx[i] += (txi - x) * spring;
        vy[i] += (tyi - y) * spring;
      }

      // markören: skjut undan — eller dra in och snurra när man håller
      const dx = x - mx, dy = y - my;
      const d2 = dx * dx + dy * dy;
      if (d2 < R * R && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const f = (1 - d / R) * (1 - d / R);
        if (holding) {
          const pull = 640 * f * dt;
          vx[i] += (-dx / d) * pull + (-dy / d) * 360 * f * dt; // virvel
          vy[i] += (-dy / d) * pull + (dx / d) * 360 * f * dt;
        } else {
          const push = 950 * f * dt;
          vx[i] += (dx / d) * push;
          vy[i] += (dy / d) * push;
        }
        // släng med markörens rörelse
        if (mmag > 0.5) {
          vx[i] += mvx * f * 12 * dt;
          vy[i] += mvy * f * 12 * dt;
        }
      }

      vx[i] *= damp;
      vy[i] *= damp;
      x += vx[i] * dt;
      y += vy[i] * dt;

      // mjuk kant i frilage; fjädern/ellipsen sköter det annars
      if (free && !wordMode) {
        if (x < -30) x = W + 28; else if (x > W + 30) x = -28;
        if (y < -30) y = H + 28; else if (y > H + 30) y = -28;
      }
      px[i] = x; py[i] = y;
    }
    mvx *= 0.8; mvy *= 0.8;

    draw(t);
    raf = requestAnimationFrame(tick);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (!running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  });

  let resizeT = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      const ow = W, oh = H;
      W = innerWidth; H = innerHeight;
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      for (let i = 0; i < N; i++) {
        px[i] = (px[i] / ow) * W;
        py[i] = (py[i] / oh) * H;
      }
      anchorEls.clear();
      if (formation) setFormation(formation, lastProgress);
    }, 150) as unknown as number;
  }, { passive: true });

  // ————— Start —————
  setFormation('logo'); // fritt driv tills filen är dekodad
  logoGate.then(() => {
    if (formation === 'logo') setFormation('logo', lastProgress);
    // först nu viker bildfallbacken undan — annars står hjälten tom en stund
    if (hasTargets) takeOver();
  });
  raf = requestAnimationFrame(tick);

  // liten introspektionslucka för test — läser bara tillstånd
  (canvas as any).__field = () => {
    let spread = 0;
    let vel = 0;
    for (let i = 0; i < N; i++) {
      spread += Math.hypot(tx[i] - px[i], ty[i] - py[i]);
      vel += Math.abs(vy[i]);
    }
    vel /= N;
    let targetBox: { x0: number; y0: number; x1: number; y1: number } | null = null;
    if (hasTargets && formation === 'logo') {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < N; i++) {
        if ((i & FREE) === FREE) continue;
        if (tx[i] < x0) x0 = tx[i];
        if (tx[i] > x1) x1 = tx[i];
        if (ty[i] < y0) y0 = ty[i];
        if (ty[i] > y1) y1 = ty[i];
      }
      targetBox = { x0, y0, x1, y1 };
    }
    return { formation, hasTargets, n: N, gl: !!gl, intensity, calm, vel, spread: spread / N, targetBox, wmBox: { ...wmBoxCur } };
  };
}
