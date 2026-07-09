import type { FeedbackState } from "../lib/noteFeedback";

interface VirtualPianoKeyboardProps {
  minMidiNote: number;
  maxMidiNote: number;
  /** Nốt đang cần đánh tại vị trí cursor - luôn tô sáng nhẹ, không phụ thuộc MIDI. */
  expectedMidiNotes: number[];
  /** Nốt đang thực sự được nhấn qua đàn MIDI, kèm trạng thái so khớp (tái dùng màu của noteFeedback.ts). */
  playedKeyStates: Map<number, FeedbackState>;
  /** Để ngỏ cho mở rộng sau (click phím ảo để tự chơi) - chưa dùng ở bản này. */
  onKeyClick?: (midiNote: number) => void;
}

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
/** Chiều rộng phím đen so với phím trắng, để định vị đúng giữa 2 phím trắng liền kề. */
const BLACK_KEY_WIDTH_RATIO = 0.62;
/** Middle C - đánh dấu riêng để người chơi dễ định vị trên bàn phím ảo. */
const MIDDLE_C_MIDI_NOTE = 60;

function isWhiteKey(midi: number): boolean {
  return WHITE_PITCH_CLASSES.has(((midi % 12) + 12) % 12);
}

interface KeyLayout {
  whiteKeys: number[];
  blackKeys: { midi: number; whiteIndexBefore: number }[];
  whiteKeyCount: number;
}

/** Xếp phím trắng thành hàng đều nhau, phím đen định vị tuyệt đối theo % chiều rộng ngay tại
 * ranh giới giữa 2 phím trắng liền kề (đúng quy luật piano - không có phím đen giữa E-F, B-C). */
function buildKeyLayout(minMidiNote: number, maxMidiNote: number): KeyLayout {
  const whiteKeys: number[] = [];
  const blackKeys: { midi: number; whiteIndexBefore: number }[] = [];

  for (let midi = minMidiNote; midi <= maxMidiNote; midi++) {
    if (isWhiteKey(midi)) {
      whiteKeys.push(midi);
    } else {
      blackKeys.push({ midi, whiteIndexBefore: whiteKeys.length });
    }
  }
  return { whiteKeys, blackKeys, whiteKeyCount: whiteKeys.length };
}

export function VirtualPianoKeyboard({
  minMidiNote,
  maxMidiNote,
  expectedMidiNotes,
  playedKeyStates,
  onKeyClick,
}: VirtualPianoKeyboardProps) {
  const { whiteKeys, blackKeys, whiteKeyCount } = buildKeyLayout(minMidiNote, maxMidiNote);
  const expectedSet = new Set(expectedMidiNotes);
  const whiteKeyWidthPercent = 100 / Math.max(whiteKeyCount, 1);
  const blackKeyWidthPercent = whiteKeyWidthPercent * BLACK_KEY_WIDTH_RATIO;

  function keyStateClass(midi: number): string {
    const played = playedKeyStates.get(midi);
    if (played) return ` virtual-keyboard__key--${played}`;
    if (expectedSet.has(midi)) return " virtual-keyboard__key--expected";
    return "";
  }

  return (
    <div className="virtual-keyboard">
      <div className="virtual-keyboard__white-row">
        {whiteKeys.map((midi) => (
          <div
            key={midi}
            className={`virtual-keyboard__key virtual-keyboard__key--white${keyStateClass(midi)}`}
            style={{ width: `${whiteKeyWidthPercent}%` }}
            onClick={onKeyClick ? () => onKeyClick(midi) : undefined}
          >
            {midi === MIDDLE_C_MIDI_NOTE && <span className="virtual-keyboard__label">C4</span>}
          </div>
        ))}
      </div>
      <div className="virtual-keyboard__black-row">
        {blackKeys.map(({ midi, whiteIndexBefore }) => (
          <div
            key={midi}
            className={`virtual-keyboard__key virtual-keyboard__key--black${keyStateClass(midi)}`}
            style={{
              left: `${whiteIndexBefore * whiteKeyWidthPercent - blackKeyWidthPercent / 2}%`,
              width: `${blackKeyWidthPercent}%`,
            }}
            onClick={onKeyClick ? () => onKeyClick(midi) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
