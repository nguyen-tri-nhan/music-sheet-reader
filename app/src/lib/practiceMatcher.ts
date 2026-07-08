const A4_MIDI_NOTE = 69;
const A4_FREQUENCY = 440;
/** Sai số cho phép khi so tần số (Hz) - đủ nhỏ để không nhầm 2 nốt liền kề (cách nhau ~vài Hz
 * trở lên ở quãng tám thường dùng), đủ lớn để chịu được sai số làm tròn dấu phẩy động. */
const MATCH_TOLERANCE_HZ = 3;

export function midiNoteToFrequency(noteNumber: number): number {
  return A4_FREQUENCY * Math.pow(2, (noteNumber - A4_MIDI_NOTE) / 12);
}

export type MatchResult = "correct" | "incorrect";

/** So khớp TẬP HỢP nốt đã chơi với TẬP HỢP nốt đang được mong đợi - phải khớp 1-1 chính xác,
 * đánh thừa nốt nào (kể cả nốt đúng) cũng tính là sai (quyết định trong specs/keyboard.md). */
export function matchPlayedNotes(playedFrequencies: number[], expectedFrequencies: number[]): MatchResult {
  if (playedFrequencies.length === 0 || playedFrequencies.length !== expectedFrequencies.length) {
    return "incorrect";
  }
  const remaining = [...expectedFrequencies];
  for (const played of playedFrequencies) {
    const idx = remaining.findIndex((f) => Math.abs(f - played) < MATCH_TOLERANCE_HZ);
    if (idx === -1) return "incorrect";
    remaining.splice(idx, 1);
  }
  return remaining.length === 0 ? "correct" : "incorrect";
}
