import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

const EPSILON = 1e-6;

/** Di chuyển cursor của OSMD tới đúng vị trí thời gian (tính theo whole-note, giống
 * iterator.currentTimeStamp.RealValue) bằng cách đi bộ lại từ đầu bản nhạc - cách duy nhất
 * để cursor giữ đúng trạng thái nội bộ (measure/voice/repetition...) thay vì "nhảy cóc". */
export function moveCursorToTimestamp(osmd: OpenSheetMusicDisplay, targetRealValue: number): void {
  const cursor = osmd.cursor;
  cursor.reset();
  const iterator = cursor.iterator;
  while (!iterator.EndReached && iterator.currentTimeStamp.RealValue < targetRealValue - EPSILON) {
    cursor.next();
  }
  cursor.show();
}
