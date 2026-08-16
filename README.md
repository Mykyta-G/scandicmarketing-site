# Scandic Marketing

Webbplats för Scandic Marketing — film, foto, hemsidor och digital marknadsföring
i Helsingborg.

Byggd med [Astro](https://astro.build), handskriven CSS och självhostade typsnitt.
Under 1 kB JavaScript (gzippat) över hela sajten.

## Utveckling

```sh
npm install
npm run dev      # dev-server på :4321
npm run build    # produktionsbygge till dist/
```

## Deploy

Push till `main` bygger och deployar automatiskt till GitHub Pages via
`.github/workflows/deploy.yml`. För produktion på egen domän: bygg utan
`SITE`/`BASE_PATH` (default är https://www.scandicmarketing.se med basen `/`).
