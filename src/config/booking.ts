/* Bokningsformulärets inlämning.

   Ägarens nuvarande sajt skickar formuläret till en Supabase Edge Function
   som heter send-booking-email — den bygger och skickar mejlet på servern,
   så besökaren stannar kvar på sidan och får en kvittens.

   Fyll i de två värdena nedan så gör den här sajten samma sak. Båda är
   publika: anon-nyckeln är gjord för att ligga i klientkoden och skyddas av
   radnivåsäkerhet på Supabase-sidan, precis som i hans egen bundle. Hämta
   dem i Supabase → Project Settings → API.

   Lämnas de tomma faller formuläret tillbaka på att öppna besökarens
   e-postklient med allt ifyllt. Sidan fungerar alltså i båda lägena — den
   blir bara bättre när de är satta.

   Går det att sätta miljövariabler i bygget används de i första hand:
     PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY
*/
const env = import.meta.env;

export const SUPABASE_URL: string = env.PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY: string = env.PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Funktionen som tar emot bokningen. Samma namn som hans nuvarande sajt. */
export const BOOKING_FN = 'send-booking-email';

/* Han säljer bara marknadsföring, så tjänstevalet är borta ur formuläret.
   Funktionen får ändå fältet — den gamla sajten skickade alltid med det, och
   ett tomt värde i mejlet vore en försämring. */
export const SERVICE = 'Marknadsföring';

export const canPost = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
