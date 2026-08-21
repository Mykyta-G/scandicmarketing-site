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

Push till `main` bygger och deployar automatiskt via Vercel. Domänen pekar på
projektet, inte på en enskild version — DNS rörs alltså bara en gång.

Bygget behöver `PUBLIC_SUPABASE_URL` och `PUBLIC_SUPABASE_ANON_KEY` för att
bokningsformuläret ska skicka i bakgrunden; utan dem faller det tillbaka på
besökarens e-postprogram. Lokalt ligger de i `.env` (gitignorerad), i
produktion som miljövariabler i Vercel.

`SITE`/`BASE_PATH` lämnas tomma på egen domän — default är
https://www.scandicmarketing.se med basen `/`.

Se [HANDOFF.md](HANDOFF.md) för ägarskap, roller och vad som återstår.
