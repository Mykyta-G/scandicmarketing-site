/* Partikellabbet — kontrakt för en formation.

   En formation är en ren funktion: den får rutans mått och en deterministisk
   slumpkälla, och lämnar tillbaka en platt lista med målpunkter i
   viewport-pixlar: [x0, y0, x1, y1, …]. Motorn fördelar sedan partiklarna
   över listan och fjädrar dem dit. Ingen DOM, inga beroenden, inget tillstånd.
*/
export type Formation = {
  /** kebab-case, används som data-field på sektionen */
  name: string;
  /** svensk rubrik som visas i labbet */
  title: string;
  /** en rad om vad man ser och varför det är intressant */
  note: string;
  /** global täthet/opacitet, 0.4 (lugn bakgrund) – 1.1 (bärande motiv) */
  goal: number;
  /** målpunkter i viewport-px, [x,y,x,y,…] */
  points: (W: number, H: number, rr: () => number) => number[];
};
