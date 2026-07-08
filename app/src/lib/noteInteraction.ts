import { MusicPartManagerIterator } from "opensheetmusicdisplay";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

interface ClickableGraphicalNote {
  sourceNote: { isRest(): boolean };
  getNoteheadSVGs?: () => SVGGraphicsElement[];
}

/** Gắn click handler vào từng notehead đã render, để bấm vào 1 nốt sẽ báo lại đúng
 * thời điểm (whole-note timestamp) của nốt đó, dùng để di chuyển cursor tới đó.
 * Phải gọi lại mỗi khi osmd.render() chạy lại vì OSMD vẽ lại toàn bộ SVG (mất hết listener cũ).
 *
 * Quan trọng: quét bằng 1 MusicPartManagerIterator độc lập (không phải osmd.cursor) - nếu dùng
 * osmd.cursor.next() để đi hết bản nhạc rồi quay lại, vì osmd có followCursor:true nên mỗi bước
 * sẽ tự cuộn trang theo, gây hiệu ứng "cuộn xuống cuối rồi cuộn ngược lên" mỗi khi render lại
 * (bấm Play, ẩn/hiện hợp âm...). Iterator độc lập chỉ là dữ liệu, không có tác dụng phụ lên UI. */
export function attachNoteClickHandlers(osmd: OpenSheetMusicDisplay, onNoteClick: (timestampRealValue: number) => void): void {
  if (osmd.cursor.cursorElement) {
    // Cursor phát nhạc là 1 <img> đè lên trên (z-index cao) để luôn nhìn thấy được - nếu không tắt
    // pointer-events, nó sẽ chặn mất click vào đúng notehead đang nằm bên dưới nó.
    osmd.cursor.cursorElement.style.pointerEvents = "none";
  }

  const rules = osmd.EngravingRules;
  const iterator = new MusicPartManagerIterator(osmd.Sheet);

  while (!iterator.EndReached) {
    const timestamp = iterator.currentTimeStamp.RealValue;
    for (const voiceEntry of iterator.CurrentVoiceEntries) {
      for (const note of voiceEntry.Notes) {
        if (note.isRest()) continue;
        const graphicalNote = rules.GNote(note) as unknown as ClickableGraphicalNote | undefined;
        const noteheadEls = graphicalNote?.getNoteheadSVGs?.();
        if (!noteheadEls) continue;
        for (const el of noteheadEls) {
          el.style.cursor = "pointer";
          el.addEventListener("click", () => onNoteClick(timestamp));
        }
      }
    }
    iterator.moveToNext();
  }
}
