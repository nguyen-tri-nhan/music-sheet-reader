import type { FeedbackState } from "../lib/noteFeedback";
import type { HighlightedNote } from "../hooks/useCursorHighlightedNotes";

interface VirtualPianoKeyboardProps {
  minMidiNote: number;
  maxMidiNote: number;
  /** Nốt cần đánh tại/quanh vị trí cursor (tier 0 = ngay bây giờ, 1-3 = sắp tới), kèm tay trái/phải
   * của từng nốt - luôn tô sáng nhẹ, không phụ thuộc MIDI. */
  highlightedNotes: HighlightedNote[];
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

/** Nếu 1 nốt (hiếm khi, vd lặp cách quãng 8) xuất hiện ở nhiều tier cùng lúc, luôn ưu tiên hiện
 * tier NHỎ NHẤT (gần/ngay bây giờ hơn) - đó mới là thông tin quan trọng hơn. */
function buildHighlightLookup(highlightedNotes: HighlightedNote[]): Map<number, HighlightedNote> {
  const lookup = new Map<number, HighlightedNote>();
  for (const note of highlightedNotes) {
    const existing = lookup.get(note.midi);
    if (!existing || note.tier < existing.tier) {
      lookup.set(note.midi, note);
    }
  }
  return lookup;
}

const TIER_SUFFIX: Record<HighlightedNote["tier"], string> = {
  0: "current",
  1: "next1",
  2: "next2",
  3: "next3",
};

export function VirtualPianoKeyboard({
  minMidiNote,
  maxMidiNote,
  highlightedNotes,
  playedKeyStates,
  onKeyClick,
}: VirtualPianoKeyboardProps) {
  const { whiteKeys, blackKeys, whiteKeyCount } = buildKeyLayout(minMidiNote, maxMidiNote);
  const highlightLookup = buildHighlightLookup(highlightedNotes);
  const whiteKeyWidthPercent = 100 / Math.max(whiteKeyCount, 1);
  const blackKeyWidthPercent = whiteKeyWidthPercent * BLACK_KEY_WIDTH_RATIO;

  function keyStateClass(midi: number): string {
    // Trạng thái đánh MIDI thật (đúng/sai/đang chờ) luôn ưu tiên hơn gợi ý tay/tier - đây là
    // phản hồi về ĐỘ CHÍNH XÁC, quan trọng hơn thông tin "sắp tới, tay nào".
    const played = playedKeyStates.get(midi);
    if (played) return ` virtual-keyboard__key--${played}`;

    const highlight = highlightLookup.get(midi);
    if (highlight) return ` virtual-keyboard__key--${highlight.hand}-${TIER_SUFFIX[highlight.tier]}`;
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
