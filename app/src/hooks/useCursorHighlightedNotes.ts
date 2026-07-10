import { useEffect, useRef, useState } from "react";
import type { OpenSheetMusicDisplay, Note } from "opensheetmusicdisplay";
import { frequencyToMidiNote } from "../lib/pitchToMidi";
import type { StaffRoles } from "../lib/staffRoles";

export type NoteHand = "left" | "right" | "unknown";

/** tier 0 = nốt cần đánh NGAY (tại cursor hiện tại); 1-3 = nốt sắp tới, càng xa càng mờ trên UI. */
export interface HighlightedNote {
  midi: number;
  hand: NoteHand;
  tier: 0 | 1 | 2 | 3;
}

/** Nhìn trước tối đa 3 vị trí có nốt - đủ để chuẩn bị tay trước mà không làm rối bàn phím ảo với
 * hợp âm dày đặc (mỗi bước cursor đã có thể là 1 hợp âm nhiều nốt). */
const LOOKAHEAD_STEPS = 3;
/** Giới hạn số bước cursor TOÀN CỤC (cả 2 tay) được phép quét qua khi tìm 3 vị trí sắp tới của 1
 * tay - chặn quét vô hạn nếu tay kia nghỉ rất dài hoặc đã hết bài. */
const MAX_LOOKAHEAD_GUARD_STEPS = 60;

function resolveHand(note: Note, staffRoles: StaffRoles | null): NoteHand {
  if (!staffRoles || staffRoles.singleStaff) return "unknown";
  const staffId = note.ParentStaffEntry?.ParentStaff?.Id;
  if (staffId === staffRoles.trebleStaffId) return "right";
  if (staffId === staffRoles.bassStaffId) return "left";
  return "unknown";
}

function notesToHighlights(notes: Note[], staffRoles: StaffRoles | null, tier: 0 | 1 | 2 | 3): HighlightedNote[] {
  const highlights: HighlightedNote[] = [];
  for (const note of notes) {
    if (note.isRest()) continue;
    const pitch = note.TransposedPitch ?? note.Pitch;
    if (!pitch) continue;
    highlights.push({ midi: frequencyToMidiNote(pitch.Frequency), hand: resolveHand(note, staffRoles), tier });
  }
  return highlights;
}

/** Quét trước tìm 3 vị trí sắp tới CỦA RIÊNG 1 TAY (hoặc không phân biệt tay, khi `hand` là
 * "unknown" - file 1 khuông nhạc) - dùng 1 bản clone của iterator thật, không đụng cursor thật
 * (giống kỹ thuật đã dùng ở `buildScheduleFromCurrentPosition`/`noteInteraction.ts`).
 *
 * Quan trọng: iterator.moveToNext() đi theo mốc thời gian NGẮN NHẤT giữa CẢ 2 tay (đã verify khi
 * làm tính năng chấm điểm Practice Mode) - nếu quét chung 1 lượt cho cả 2 tay như bản đầu, tay có
 * nhịp nhanh hơn (thường là bè đệm tay trái) sẽ "ăn hết" ngân sách 3 bước nhìn trước trước khi tay
 * kia (thường là giai điệu tay phải) kịp có nốt mới - khiến tay chậm hơn chỉ hiện được 1-2 tier
 * thay vì đủ 3. Quét RIÊNG cho từng tay, bỏ qua các bước không có nốt của tay đó, để mỗi tay luôn
 * có đủ 3 tier nhìn trước theo đúng nhịp của chính nó. */
function collectUpcomingNotesForHand(
  osmd: OpenSheetMusicDisplay,
  staffRoles: StaffRoles | null,
  hand: NoteHand,
): HighlightedNote[] {
  const highlights: HighlightedNote[] = [];
  const iterator = osmd.cursor.iterator.clone();
  let tier = 0;

  for (let guard = 0; guard < MAX_LOOKAHEAD_GUARD_STEPS && tier < LOOKAHEAD_STEPS; guard++) {
    if (iterator.EndReached) break;
    iterator.moveToNext();
    if (iterator.EndReached) break;

    const notes = iterator.CurrentVoiceEntries.flatMap((voiceEntry) => voiceEntry.Notes);
    const notesForHand = notes.filter((note) => resolveHand(note, staffRoles) === hand);
    if (notesForHand.length === 0) continue;

    tier++;
    highlights.push(...notesToHighlights(notesForHand, staffRoles, tier as 1 | 2 | 3));
  }
  return highlights;
}

function collectUpcomingNotes(osmd: OpenSheetMusicDisplay, staffRoles: StaffRoles | null): HighlightedNote[] {
  if (!staffRoles || staffRoles.singleStaff) {
    return collectUpcomingNotesForHand(osmd, staffRoles, "unknown");
  }
  return [
    ...collectUpcomingNotesForHand(osmd, staffRoles, "right"),
    ...collectUpcomingNotesForHand(osmd, staffRoles, "left"),
  ];
}

/** Theo dõi nốt (số phím MIDI) đang ở vị trí cursor hiện tại VÀ vài nốt sắp tới, kèm tay
 * trái/phải của từng nốt - để tô sáng bàn phím ảo. Dùng chung cho cả Playback Mode (cursor tự
 * chạy theo Tone.Transport) lẫn Practice Mode (cursor di chuyển theo input MIDI). Vì OSMD thay
 * đổi cursor bằng cách mutate trực tiếp (không qua React state), phải poll định kỳ bằng
 * requestAnimationFrame thay vì lắng nghe sự kiện. */
export function useCursorHighlightedNotes(
  osmdRef: React.RefObject<OpenSheetMusicDisplay | null>,
  staffRoles: StaffRoles | null,
): HighlightedNote[] {
  const [notes, setNotes] = useState<HighlightedNote[]>([]);
  const lastKeyRef = useRef("");

  useEffect(() => {
    let rafId: number;

    const poll = () => {
      const osmd = osmdRef.current;
      if (osmd?.Sheet) {
        const current = notesToHighlights(osmd.cursor.NotesUnderCursor(), staffRoles, 0);
        const upcoming = collectUpcomingNotes(osmd, staffRoles);
        const combined = [...current, ...upcoming];

        const key = combined
          .map((n) => `${n.tier}:${n.hand}:${n.midi}`)
          .sort()
          .join(",");
        if (key !== lastKeyRef.current) {
          lastKeyRef.current = key;
          setNotes(combined);
        }
      }
      rafId = requestAnimationFrame(poll);
    };

    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [osmdRef, staffRoles]);

  return notes;
}
