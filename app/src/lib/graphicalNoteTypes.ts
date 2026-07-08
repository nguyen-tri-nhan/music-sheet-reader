import type { NoteType, Pitch } from "opensheetmusicdisplay";

/** Kiểu tối giản cho GraphicalNote thật của OSMD (backend VexFlow) - vfnoteIndex/getNoteheadSVGs
 * tồn tại trên VexFlowGraphicalNote lúc runtime nhưng không có trong type GraphicalNote công khai
 * của OSMD, nên phải khai báo lại tối thiểu những gì cần dùng rồi ép kiểu (as unknown as OsmdNoteLike). */
export interface OsmdNoteLike {
  sourceNote: {
    isRest(): boolean;
    Pitch: Pitch;
    TransposedPitch?: Pitch;
    NoteTypeXml: NoteType;
    /** Staff (khuông nhạc) chứa nốt này - dùng để lọc theo tay trái/phải (bass/treble). */
    ParentStaffEntry?: { ParentStaff?: { Id: number } };
  };
  /** Chỉ số của nốt này trong hợp âm (VexFlow StaveNote dùng chung 1 nhóm SVG cho cả hợp âm). */
  vfnoteIndex: number;
  getNoteheadSVGs?: () => SVGGraphicsElement[];
}
