import { KeyInstruction, KeyEnum, type OpenSheetMusicDisplay } from "opensheetmusicdisplay";

const MAJOR_BY_FIFTHS: Record<number, string> = {
  "-7": "Cb", "-6": "Gb", "-5": "Db", "-4": "Ab", "-3": "Eb", "-2": "Bb", "-1": "F",
  "0": "C", "1": "G", "2": "D", "3": "A", "4": "E", "5": "B", "6": "F#", "7": "C#",
};

const MINOR_BY_FIFTHS: Record<number, string> = {
  "-7": "Ab", "-6": "Eb", "-5": "Bb", "-4": "F", "-3": "C", "-2": "G", "-1": "D",
  "0": "A", "1": "E", "2": "B", "3": "F#", "4": "C#", "5": "G#", "6": "D#", "7": "A#",
};

/** Đọc tên giọng HIỆN TẠI trực tiếp từ OSMD (đúng cho cả trước/sau transpose), thay vì tự tính lại
 * bằng cách dịch chromatic từ giọng gốc. Lý do đổi cách làm: tự dịch chromatic phải tự đoán nên
 * dùng tên thăng hay giáng cho giọng đích - đã verify bằng OSMD thật là cách đoán cũ SAI khoảng
 * 1/3 số trường hợp (vd D major +1 nửa cung ra "D# major" trong khi OSMD vẽ đúng là "Eb major" -
 * 5 dấu giáng). OSMD's TransposeCalculator đã tự tính đúng key signature theo circle of fifths
 * (chọn giọng có ít dấu hóa hơn khi có 2 cách viết tương đương) - chỉ cần đọc lại kết quả đó thay
 * vì suy luận độc lập, tránh 2 nguồn có thể lệch nhau. */
export function readCurrentKeyLabel(osmd: OpenSheetMusicDisplay): string | null {
  const firstMeasure = osmd.Sheet?.SourceMeasures?.[0];
  const instructions = firstMeasure?.FirstInstructionsStaffEntries?.[0]?.Instructions ?? [];
  const keyInstruction = instructions.find((instr): instr is KeyInstruction => instr instanceof KeyInstruction);
  if (!keyInstruction) return null;

  const isMinor = keyInstruction.Mode === KeyEnum.minor;
  const tonicName = (isMinor ? MINOR_BY_FIFTHS : MAJOR_BY_FIFTHS)[keyInstruction.Key];
  if (!tonicName) return null;
  return `${tonicName} ${isMinor ? "minor" : "major"}`;
}
