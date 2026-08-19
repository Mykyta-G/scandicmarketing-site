/* Samlingen som partikellabbet visar. Varje set ligger i en egen fil så att
   de kan skrivas och bytas ut oberoende av varandra. Motorn i field.ts tar
   emot listan som gästformationer — labbet är alltså ingen egen kopia av
   fysiken, bara ett annat urval former. */
import type { Formation } from './types';
import { SET_GEOMETRY } from './set-geometry';
import { SET_PHYSICS } from './set-physics';
import { SET_DATA } from './set-data';
import { SET_ORGANIC } from './set-organic';

export const LAB: Formation[] = [
  ...SET_GEOMETRY,
  ...SET_PHYSICS,
  ...SET_DATA,
  ...SET_ORGANIC,
];
