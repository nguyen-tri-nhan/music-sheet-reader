export interface KeyInfo {
  fifths: number;
  mode: "major" | "minor";
  tonicName: string;
}

const MAJOR_BY_FIFTHS: Record<number, string> = {
  "-7": "Cb", "-6": "Gb", "-5": "Db", "-4": "Ab", "-3": "Eb", "-2": "Bb", "-1": "F",
  "0": "C", "1": "G", "2": "D", "3": "A", "4": "E", "5": "B", "6": "F#", "7": "C#",
};

const MINOR_BY_FIFTHS: Record<number, string> = {
  "-7": "Ab", "-6": "Eb", "-5": "Bb", "-4": "F", "-3": "C", "-2": "G", "-1": "D",
  "0": "A", "1": "E", "2": "B", "3": "F#", "4": "C#", "5": "G#", "6": "D#", "7": "A#",
};

const NOTE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const NOTE_INDEX: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11,
};

/** Đọc key signature ban đầu (số dấu hóa + trưởng/thứ) từ MusicXML thô. */
export function parseInitialKey(xml: string): KeyInfo | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const fifthsEl = doc.getElementsByTagName("fifths")[0];
  if (!fifthsEl?.textContent) return null;

  const fifths = parseInt(fifthsEl.textContent, 10);
  const modeText = doc.getElementsByTagName("mode")[0]?.textContent?.trim().toLowerCase();
  const mode: "major" | "minor" = modeText === "minor" ? "minor" : "major";
  const table = mode === "minor" ? MINOR_BY_FIFTHS : MAJOR_BY_FIFTHS;
  const tonicName = table[fifths] ?? "C";
  return { fifths, mode, tonicName };
}

/** Tên giọng hiện tại sau khi transpose n nửa cung (chỉ để hiển thị UI, không dùng để render notation). */
export function describeTransposedKey(key: KeyInfo, semitones: number): string {
  const baseIndex = NOTE_INDEX[key.tonicName] ?? 0;
  const names = key.fifths < 0 ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  const index = ((baseIndex + semitones) % 12 + 12) % 12;
  return `${names[index]} ${key.mode}`;
}
