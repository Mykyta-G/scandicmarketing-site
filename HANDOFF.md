# Överlämning

Det här dokumentet beskriver vem som äger vad, hur sajten uppdateras och vad
som återstår att fixa. Det är skrivet för dig som tar över sajten.

## Vem äger vad

Allt ska stå i ditt namn. Utvecklaren har åtkomst för att kunna arbeta, men
äger ingenting och betalar för ingenting.

| Sak | Ägare | Var |
| --- | --- | --- |
| Domänen `scandicmarketing.se` | Du | One.com |
| E-post `kontakt@scandicmarketing.se` | Du | One.com |
| Bokningsfunktionen | Du | Supabase (`ubhdzsfwhigtrnnefzsy`) |
| Hostingen | Du | Vercel |
| Koden | Du | GitHub |

Utvecklaren är **collaborator** på GitHub — kan skicka in ändringar, kan inte
ta bort projektet, står inte på några fakturor.

## Så uppdateras sajten

Koden på GitHub är sanningen. När en ändring skickas in till grenen `main`
bygger Vercel om sajten och lägger ut den automatiskt, oftast inom en minut.

Du behöver inte göra något vid en uppdatering. Du byter aldrig DNS igen —
domänen pekar på *projektet*, inte på en enskild version.

**Viktigt:** sajten redigeras inte längre i Lovable. Ändringar där hamnar på
en sajt som ingen ser. All redigering sker i koden.

## Om något ska sättas upp på nytt

Vercel behöver två miljövariabler, annars faller bokningsformuläret tillbaka
på att öppna besökarens e-postprogram i stället för att skicka i bakgrunden:

```
PUBLIC_SUPABASE_URL        https://ubhdzsfwhigtrnnefzsy.supabase.co
PUBLIC_SUPABASE_ANON_KEY   <anon-nyckeln från Supabase → Project Settings → API>
```

Båda är publika av design och skyddas av radnivåsäkerhet på Supabase-sidan.

DNS hos One.com: **rör aldrig namnservrarna.** E-posten ligger där. Bara
A-posten och CNAME för `www` pekas om vid ett hostbyte.

## Kvar att fixa — i din Supabase, inte i sajten

Tre saker i edge-funktionen `send-booking-email` som sajten inte kan lösa:

1. **Bekräftelsen till kunden fäller hela bokningen.** Skriver en besökare fel
   i sin e-postadress (`gmial.com`) misslyckas hela anropet — trots att din
   avisering redan har skickats. Besökaren tror att det gick fel och skickar
   igen, och du får samma förfrågan flera gånger. Lägg bekräftelsen i ett eget
   `try/catch` så att den inte kan fälla en bokning som redan gått fram.

2. **Funktionen kräver ingen inloggning.** Vem som helst på internet kan anropa
   den och skapa mejl i din inkorg. Slå på `verify_jwt`, eller lägg in en
   spärr för hur ofta den får anropas.

3. **Ingenting sparas.** Bokningar finns bara som mejl. Fastnar ett mejl i
   skräpposten är förfrågan borta utan spår. Låt funktionen skriva en rad i
   databasen också.

## Kvar att fixa — hos One.com

Domänen saknar **SPF, DKIM och DMARC**. Det betyder att dina utgående mejl
lättare hamnar i skräpposten — inklusive bokningsaviseringarna — och att vem
som helst kan förfalska avsändaradressen `kontakt@scandicmarketing.se`.
One.com sätter upp det åt dig i deras e-postpanel.

Kontrollera också att **automatisk förnyelse** är på. Domänen förnyas
2026-09-16, och en domän som går ut tar med sig både sajten och e-posten.
