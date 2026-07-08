import { Pitch } from "opensheetmusicdisplay";

/** OSMD's internal Pitch.Octave is NOT standard scientific pitch notation - it's offset by
 * Pitch.OctaveXmlDifference (= 3). Confirmed empirically: a note OSMD reports as octave 1 with
 * FundamentalNote=A has Frequency 440Hz, which is standard A4 (concert pitch), not A1 (55Hz).
 * Pitch.ToStringShort() does NOT apply this correction, so feeding it straight to Tone.js
 * (which expects real scientific pitch notation, e.g. "A4" = 440Hz) plays everything 3 octaves
 * too low. This helper builds the correct scientific pitch name instead. */
export function toScientificPitchName(pitch: Pitch): string {
  const letter = Pitch.getNoteEnumString(pitch.FundamentalNote);
  const accidental = accidentalSymbol(pitch.AccidentalHalfTones);
  const octave = pitch.Octave + Pitch.OctaveXmlDifference;
  return `${letter}${accidental}${octave}`;
}

function accidentalSymbol(halfTones: number): string {
  if (halfTones === 1) return "#";
  if (halfTones === 2) return "##";
  if (halfTones === -1) return "b";
  if (halfTones === -2) return "bb";
  return "";
}
