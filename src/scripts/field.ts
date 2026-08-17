/*
  Partikelfältet — Scandic Marketings levande yta.

  Egen kod, inga beroenden. CPU-fysik över typade arrayer + WebGL-punkter
  (WebGL2 → WebGL1 → Canvas 2D). Mörka, precisa punkter på vit mark — navy
  med blå accent. Partiklarna vilar tungt i sina formationer, andas långsamt,
  och blir levande först vid interaktion: markören skjuter undan dem, håll
  drar in dem, en snabb gest slungar iväg dem — fjädrarna samlar alltid ihop
  ordet igen.

  Formationer (data-field på sektionerna):
    logo     — ordmärket: "SCANDIC MARKETING" renderat i Inter 800 på en
               högupplöst offscreen-canvas (efter document.fonts.ready) och
               samplat till partikelmål; punkten efter ordet är alltid blå
    drift    — fritt flöde, låg intensitet bakom läsytor
    bars     — stigande staplar (Resultat: mätbarhet)
    shapes   — play-triangel → bländare → webbläsarram genom Tjänster
    wave     — kustlinje/horisont (Break — Helsingborg vid Sundet)
    converge — konvergenspunkt (Kontakt)

  prefers-reduced-motion: en enda stilla, färdig bild — inga lyssnare, ingen loop.
*/

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

export function initField(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;

  let W = innerWidth;
  let H = innerHeight;
  const DPR = Math.min(devicePixelRatio || 1, coarse ? 3 : 2); // riktiga mobiler: skarpare punkter

  // ————— Partikelbudget efter yta och enhet —————
  const density = coarse ? 400 : 250;
  const maxN = coarse ? 2000 : 6000;
  // smala rutor behöver ett golv — ordmärket ska bära även på 375 px
  const N = Math.max(W < 760 ? 2200 : coarse ? 1800 : 1200, Math.min(coarse ? 2400 : maxN, Math.round((W * H) / density)));

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
  let calm = 0; // 1 när ordmärket vilar — hårdare kanter, ingen glimt
  let fontsReady = false;

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
    const lit: number[] = [];
    for (let y = 0; y < off.height; y += step) {
      for (let x = 0; x < off.width; x += step) {
        if (data[(y * off.width + x) * 4 + 3] > 100) lit.push(x, y);
      }
    }
    const n = lit.length / 2;
    if (!n) return null;
    const stride = Math.max(1, Math.floor(n / maxPts));
    const out: number[] = [];
    for (let i = 0; i < n; i += stride) {
      out.push(
        rect.x + (lit[i * 2] / off.width) * rect.w,
        rect.y + (lit[i * 2 + 1] / off.height) * rect.h
      );
    }
    return out;
  }

  function fitRect(aspect: number, maxWFrac: number, maxHFrac: number, cx: number, cy: number) {
    let w = W * maxWFrac;
    let h = w / aspect;
    if (h > H * maxHFrac) { h = H * maxHFrac; w = h * aspect; }
    return { x: cx * W - w / 2, y: cy * H - h / 2, w, h };
  }

  // ————— Ordmärket — skarp text, inte bitmap —————
  // Glyferna samplas EN gång per storlek till råpunkter i offscreen-rymd;
  // läget i vyn läses färskt från #wm:s getBoundingClientRect varje bildruta.
  // gBCR ger den KLISTRADE positionen (offset-kedjan ger den oklistrade) och
  // följer även innehållets scroll-transform — därför är den enda sanningen.
  const FREE = 127; // 1/128 fritt strö i ordläget — resten bemannar glyferna
  let wordRaw: number[] | null = null; // glyfpunkter i offscreen-pixlar
  let wordDotRaw: number[] | null = null; // punkten "." — alltid blåa partiklar
  let wordW = 1, wordH = 1; // offscreen-mått vid samplingen
  let wmBoxCur = { x: 0, y: 0, w: 0, h: 0 }; // ordets ruta i vyn just nu

  function sampleWord(): boolean {
    wordRaw = null;
    wordDotRaw = null;
    if (!fontsReady) return false; // driv fritt tills Inter är laddad

    const twoLine = W < 760;
    const fs = 220; // generös offscreen-storlek: tätheten kommer från glyferna
    const font = `800 ${fs}px Inter, sans-serif`;
    const lines = twoLine ? ['SCANDIC', 'MARKETING'] : ['SCANDIC MARKETING'];

    // mät med samma spärrning som CSS-fallbacken (-0.02em)
    try { (octx as any).letterSpacing = `${(-0.02 * fs).toFixed(1)}px`; } catch { /* äldre motorer */ }
    octx.font = font;
    const widths = lines.map((l) => octx.measureText(l).width);

    const r = fs * 0.088; // punktens radie
    const gap = fs * 0.1;
    const lineH = fs * 1.14;
    const last = lines.length - 1;
    const wAll = Math.max(...widths.map((w2, i) => (i === last ? w2 + gap + r * 2 : w2)));
    const base0 = fs * 0.76; // versalhöjd ≈ 0.72em — lite luft ovanför
    const hAll = base0 + last * lineH + fs * 0.08;

    off.width = Math.min(4096, Math.ceil(wAll) + 6);
    off.height = Math.ceil(hAll);
    // resize nollställer kontexten — sätt om allt
    try { (octx as any).letterSpacing = `${(-0.02 * fs).toFixed(1)}px`; } catch { /* — */ }
    octx.font = font;
    octx.textAlign = 'left';
    octx.textBaseline = 'alphabetic';
    octx.fillStyle = octx.strokeStyle = '#fff';
    octx.lineWidth = fs * 0.015; // hårfin förstärkning — räcker utan att täppa räknarna
    for (let i = 0; i < lines.length; i++) {
      octx.fillText(lines[i], 2, base0 + i * lineH);
      octx.strokeText(lines[i], 2, base0 + i * lineH);
    }

    // nästan hela budgeten på glyferna — bara ett tunt strö förblir fritt.
    // Samplas i offscreen-pixlar; läget i vyn läggs på i layoutWord.
    const maxPts = Math.min(4200, Math.max(700, Math.round(N * 0.8)));
    const t = sampleOffscreen(maxPts, { x: 0, y: 0, w: off.width, h: off.height });
    if (!t) return false;
    wordRaw = t;
    wordW = off.width;
    wordH = off.height;

    // den blå punkten: egen liten fyllotaxi-skiva efter sista raden
    const dcx = 2 + widths[last] + gap + r;
    const dcy = base0 + last * lineH - r * 0.9;
    const nd = Math.max(28, Math.round(N * 0.018));
    const golden = Math.PI * (3 - Math.sqrt(5));
    wordDotRaw = [];
    for (let i = 0; i < nd; i++) {
      const rad = r * 0.92 * Math.sqrt(i / nd);
      const a = i * golden;
      wordDotRaw.push(dcx + Math.cos(a) * rad, dcy + Math.sin(a) * rad);
    }
    return true;
  }

  // Ordets ruta i vyn — läses färskt VARJE bildruta ordet visas, aldrig
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

  // Lägg glyf- och punktmålen i rutan. Deterministisk (samma frön) — kan
  // köras om varje bildruta utan att partiklarna byter plats inbördes.
  function layoutWord(box: { x: number; y: number; w: number; h: number }) {
    wmBoxCur = box;
    if (!wordRaw) return;
    const m = wordRaw.length / 2;
    const sx = box.w / wordW;
    const sy = box.h / wordH;
    const md = wordDotRaw ? wordDotRaw.length / 2 : 0;
    const need = md ? Math.min(md * 2, Math.round(N * 0.04)) : 0;
    let di = 0;
    for (let i = 0; i < N; i++) {
      // punkten "." bemannas av blåa partiklar (färgval 1 = #2563eb)
      if (di < need && seeds[i * 3 + 1] === 1 && (i & FREE) !== FREE) {
        const j = di % md;
        tx[i] = box.x + wordDotRaw![j * 2] * sx + (seeds[i * 3] - 1.95) * 0.6;
        ty[i] = box.y + wordDotRaw![j * 2 + 1] * sy + (seeds[i * 3 + 2] - Math.PI) * 0.3;
        di++;
        continue;
      }
      const j = perm[i] % m;
      // ordmärket kräver stillhet: nästan inget spridningsbrus kring målet
      tx[i] = box.x + wordRaw[j * 2] * sx + (seeds[i * 3] - 1.95) * 0.35;
      ty[i] = box.y + wordRaw[j * 2 + 1] * sy + (seeds[i * 3 + 2] - Math.PI) * 0.14;
    }
  }

  function targetsFor(name: string, progress: number): number[] | null {
    const rr = rng(1234 + name.length);

    if (name === 'bars') {
      // fem stigande staplar av punkter — mätbarhet
      const out: number[] = [];
      const heights = [0.3, 0.45, 0.4, 0.62, 0.85];
      const bandW = Math.min(W * 0.6, 760);
      const x0 = (W - bandW) / 2;
      const baseY = H * 0.72;
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
      if (progress < 0.34) {
        // play-triangel (film)
        octx.beginPath();
        octx.moveTo(cx - 55, cy - 70);
        octx.lineTo(cx + 75, cy);
        octx.lineTo(cx - 55, cy + 70);
        octx.closePath();
        octx.stroke();
      } else if (progress < 0.67) {
        // bländare (foto): ring + sex blad
        octx.beginPath();
        octx.arc(cx, cy, 82, 0, TAU);
        octx.stroke();
        for (let b = 0; b < 6; b++) {
          const a0 = (b / 6) * TAU;
          const a1 = a0 + TAU / 4.1;
          octx.beginPath();
          octx.moveTo(cx + Math.cos(a0) * 78, cy + Math.sin(a0) * 78);
          octx.lineTo(cx + Math.cos(a1) * 14, cy + Math.sin(a1) * 14);
          octx.stroke();
        }
      } else {
        // webbläsarram (hemsidor)
        octx.lineWidth = 6;
        octx.strokeRect(cx - 110, cy - 72, 220, 144);
        octx.beginPath();
        octx.moveTo(cx - 110, cy - 44);
        octx.lineTo(cx + 110, cy - 44);
        octx.stroke();
        for (let d = 0; d < 3; d++) {
          octx.beginPath();
          octx.arc(cx - 94 + d * 17, cy - 58, 4.5, 0, TAU);
          octx.fill();
        }
        octx.beginPath();
        octx.moveTo(cx - 88, cy + 2); octx.lineTo(cx + 20, cy + 2);
        octx.moveTo(cx - 88, cy + 30); octx.lineTo(cx + 60, cy + 30);
        octx.stroke();
      }
      return sampleOffscreen(2000, fitRect(16 / 9, 0.5, 0.55, 0.72, 0.5));
    }

    if (name === 'wave') {
      // kustlinje: tre långsamma dyningar över hela bredden
      const out: number[] = [];
      const rows = [0.46, 0.52, 0.58];
      for (let ri = 0; ri < rows.length; ri++) {
        const yBase = rows[ri] * H;
        const pts = 700;
        for (let i = 0; i < pts; i++) {
          const x = (i / pts) * W;
          const y =
            yBase +
            Math.sin((x / W) * TAU * 1.6 + ri * 1.9) * H * 0.035 +
            Math.sin((x / W) * TAU * 3.7 + ri * 4.1) * H * 0.012 +
            (rr() - 0.5) * H * 0.02;
          out.push(x, y);
        }
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
    logo: 1.12, drift: 0.42, bars: 0.62, shapes: 0.62, wave: 0.72, converge: 0.72,
  };

  let shapesEl: Element | null = null;
  let shapesPhase = -1;
  let lastProgress = 0;

  function setFormation(name: string, progress = 0) {
    lastProgress = progress;
    if (name === 'logo') {
      formation = 'logo';
      intensityGoal = GOALS.logo;
      if (!sampleWord()) { hasTargets = false; return; }
      hasTargets = true;
      layoutWord(wmViewBox()); // och sedan varje bildruta i loopen
      return;
    }
    const t = targetsFor(name, progress);
    formation = name;
    intensityGoal = GOALS[name] ?? 0.5;
    if (!t) { hasTargets = false; return; }
    hasTargets = true;
    const m = t.length / 2;
    for (let i = 0; i < N; i++) {
      const j = perm[i] % m;
      tx[i] = t[j * 2] + (seeds[i * 3] - 1.95) * 3;
      ty[i] = t[j * 2 + 1] + (seeds[i * 3 + 2] - Math.PI) * 2;
    }
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

  const fontsGate = Promise.all([
    document.fonts.load('800 32px Inter'),
    document.fonts.ready,
  ]).catch(() => {});

  // ————— Reducerad rörelse: en stilla, färdig bild — sedan klart —————
  if (reduced) {
    fontsGate.then(() => {
      fontsReady = true;
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
  const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-field]'));
  shapesEl = sections.find((s) => s.dataset.field === 'shapes') || null;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          const name = (e.target as HTMLElement).dataset.field || 'drift';
          if (name === 'shapes') { shapesPhase = -1; }
          else if (name !== formation) setFormation(name);
          else intensityGoal = GOALS[name] ?? 0.5;
          if (name === 'shapes') formation = 'shapes';
        }
      }
    },
    // sektionen som täcker mitten av rutan äger formationen
    { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
  );
  sections.forEach((s) => io.observe(s));

  // ————— Loopen —————
  let raf = 0;
  let last = performance.now();
  let running = true;

  function tick(now: number) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 1 / 30); // realtid → samma rörelse i 60 som 120 Hz
    last = now;
    const t = now / 1000;

    // Tjänster: tre former efter hur långt man scrollat genom sektionen
    if (formation === 'shapes' && shapesEl) {
      const r = shapesEl.getBoundingClientRect();
      const prog = Math.min(Math.max((H * 0.5 - r.top) / Math.max(r.height, 1), 0), 0.999);
      const phase = prog < 0.34 ? 0 : prog < 0.67 ? 1 : 2;
      if (phase !== shapesPhase) {
        shapesPhase = phase;
        setFormation('shapes', prog);
      }
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
    let disp = 0;
    if (wordMode) {
      const p = Math.min(Math.max(scrollY / (H * 0.7), 0), 1);
      disp = p * p * (3 - 2 * p);
    }

    calm += ((wordMode ? 1 - disp : 0) - calm) * Math.min(1, dt * 3);

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
        // fjäder mot målet — som skingras uppåt/utåt när hjälten scrollas förbi
        let txi = tx[i], tyi = ty[i];
        if (disp > 0.002) {
          const ph = seeds[i * 3 + 2];
          const rad = disp * H * (0.22 + 0.5 * ((seeds[i * 3] - 1.2) / 1.5));
          txi += Math.cos(ph * 3.7) * rad;
          tyi += (Math.sin(ph * 2.9) - 0.7) * rad;
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
      if (formation) setFormation(formation, lastProgress);
    }, 150) as unknown as number;
  }, { passive: true });

  // ————— Start —————
  takeOver(); // renderaren finns — partiklarna äger ordmärket
  setFormation('logo'); // fritt driv tills typsnittet är klart
  fontsGate.then(() => {
    fontsReady = true;
    if (formation === 'logo') setFormation('logo', lastProgress);
  });
  raf = requestAnimationFrame(tick);

  // liten introspektionslucka för test — läser bara tillstånd
  (canvas as any).__field = () => {
    let spread = 0;
    for (let i = 0; i < N; i++) spread += Math.hypot(tx[i] - px[i], ty[i] - py[i]);
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
    return { formation, hasTargets, n: N, gl: !!gl, intensity, calm, spread: spread / N, targetBox, wmBox: { ...wmBoxCur } };
  };
}
