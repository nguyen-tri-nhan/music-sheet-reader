import { useEffect, useRef, useState } from "react";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import type { OsmdNoteLike } from "../lib/graphicalNoteTypes";
import { frequencyToMidiNote } from "../lib/pitchToMidi";

/** Theo dõi nốt (số phím MIDI) đang ở vị trí cursor hiện tại, để tô sáng "nốt cần đánh" trên bàn
 * phím ảo - dùng chung cho cả Playback Mode (cursor tự chạy theo Tone.Transport) lẫn Practice Mode
 * (cursor di chuyển theo input MIDI). Vì OSMD thay đổi cursor bằng cách mutate trực tiếp (không
 * qua React state), phải poll định kỳ bằng requestAnimationFrame thay vì lắng nghe sự kiện. */
export function useCursorHighlightedNotes(osmdRef: React.RefObject<OpenSheetMusicDisplay | null>): number[] {
  const [midiNotes, setMidiNotes] = useState<number[]>([]);
  const lastKeyRef = useRef("");

  useEffect(() => {
    let rafId: number;

    const poll = () => {
      const osmd = osmdRef.current;
      if (osmd?.Sheet) {
        const gnotes = osmd.cursor.GNotesUnderCursor() as unknown as OsmdNoteLike[];
        const notes = gnotes
          .filter((gn) => gn.sourceNote && !gn.sourceNote.isRest())
          .map((gn) => gn.sourceNote.TransposedPitch ?? gn.sourceNote.Pitch)
          .filter((pitch): pitch is NonNullable<typeof pitch> => !!pitch)
          .map((pitch) => frequencyToMidiNote(pitch.Frequency));

        const key = [...notes].sort((a, b) => a - b).join(",");
        if (key !== lastKeyRef.current) {
          lastKeyRef.current = key;
          setMidiNotes(notes);
        }
      }
      rafId = requestAnimationFrame(poll);
    };

    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [osmdRef]);

  return midiNotes;
}
