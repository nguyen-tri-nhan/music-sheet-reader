import { MusicPartManagerIterator } from "opensheetmusicdisplay";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import type { OsmdNoteLike } from "./graphicalNoteTypes";

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
  // Nếu bản nhạc có lặp lại (segno/coda/D.C...), iterator này sẽ đi qua cùng 1 ô nhịp nhiều lần,
  // nhưng notehead SVG tương ứng chỉ được OSMD vẽ ra 1 lần trên trang. Không dedupe thì mỗi lượt
  // đi qua sẽ gắn thêm 1 listener lên CÙNG 1 phần tử - khi bấm, tất cả listener đó cùng chạy (theo
  // đúng thứ tự đã gắn), và listener gắn SAU CÙNG (ứng với lượt lặp lại) luôn "thắng", khiến bấm
  // vào 1 nốt ở đoạn lặp lại luôn nhảy tới thời điểm của lượt lặp thay vì lượt đầu tiên như mong đợi.
  const attachedElements = new Set<SVGElement>();

  while (!iterator.EndReached) {
    const timestamp = iterator.currentTimeStamp.RealValue;
    for (const voiceEntry of iterator.CurrentVoiceEntries) {
      for (const note of voiceEntry.Notes) {
        if (note.isRest()) continue;
        const graphicalNote = rules.GNote(note) as unknown as OsmdNoteLike | undefined;
        // getNoteheadSVGs() trả về TẤT CẢ notehead của cả hợp âm dùng chung StaveNote - phải lấy
        // đúng phần tử ở vfnoteIndex, không thì mỗi nốt trong hợp âm sẽ gắn listener trùng lặp lên
        // cả các notehead khác (dù không sai chức năng ở đây vì cùng timestamp, nhưng thừa và dễ lỗi).
        const el = graphicalNote?.getNoteheadSVGs?.()?.[graphicalNote.vfnoteIndex];
        if (!el || attachedElements.has(el)) continue;
        attachedElements.add(el);
        el.style.cursor = "pointer";
        el.addEventListener("click", () => onNoteClick(timestamp));
      }
    }
    iterator.moveToNext();
  }
}
