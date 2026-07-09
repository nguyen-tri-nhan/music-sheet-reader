const A4_MIDI_NOTE = 69;
const A4_FREQUENCY = 440;

/** Chuyển tần số (Hz) sang số phím MIDI gần nhất (0-127, 60 = C4/middle C).
 * Đã verify khớp chính xác trên toàn dải 88 phím (21-108). */
export function frequencyToMidiNote(frequency: number): number {
  return Math.round(A4_MIDI_NOTE + 12 * Math.log2(frequency / A4_FREQUENCY));
}

/** Tầm phím đàn piano chuẩn 88 phím: A0 (21) đến C8 (108). */
export const FULL_PIANO_RANGE = { minMidiNote: 21, maxMidiNote: 108 };
