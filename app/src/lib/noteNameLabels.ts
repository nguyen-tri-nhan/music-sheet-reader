import { NoteType, Pitch } from "opensheetmusicdisplay";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

const LABEL_GROUP_ID = "note-name-labels-overlay";
const SVG_NS = "http://www.w3.org/2000/svg";

/** Notehead đặc (nốt đen: quarter trở xuống) -> chữ màu trắng, viền tối.
 * Notehead rỗng (half/whole...) -> chữ màu tối, viền trắng.
 * Luôn vẽ thêm viền/halo tương phản ngược màu chữ quanh từng ký tự (paint-order: stroke) thay vì
 * chỉ dựa vào 1 màu chữ duy nhất - vì notehead rỗng chỉ là 1 vòng viền mỏng, chữ tối dễ bị lẫn
 * vào chính đường viền đó nếu không có halo tách biệt rõ với nốt xung quanh. */
const FILLED_NOTEHEAD_TEXT_COLOR = "#ffffff";
const FILLED_NOTEHEAD_HALO_COLOR = "#000000";
const OPEN_NOTEHEAD_TEXT_COLOR = "#000000";
const OPEN_NOTEHEAD_HALO_COLOR = "#ffffff";

interface NoteheadCapable {
  sourceNote: {
    isRest(): boolean;
    Pitch: Pitch;
    TransposedPitch?: Pitch;
    NoteTypeXml: NoteType;
  };
  getNoteheadSVGs?: () => SVGGraphicsElement[];
}

export function clearNoteNameLabels(container: HTMLElement): void {
  container.querySelector(`#${LABEL_GROUP_ID}`)?.remove();
}

/** Vẽ đè tên nốt (C/D/E/F/G/A/B) vào giữa từng notehead đã render.
 * Phải gọi lại mỗi khi osmd.render() chạy lại (transpose, đổi option...) vì OSMD vẽ lại toàn bộ SVG. */
export function renderNoteNameLabels(osmd: OpenSheetMusicDisplay, container: HTMLElement): void {
  clearNoteNameLabels(container);

  const svg = container.querySelector("svg");
  if (!svg) return;

  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("id", LABEL_GROUP_ID);
  group.setAttribute("pointer-events", "none");
  svg.appendChild(group);

  const measureRows = osmd.GraphicSheet?.MeasureList ?? [];
  for (const row of measureRows) {
    for (const measure of row) {
      if (!measure) continue;
      for (const staffEntry of measure.staffEntries) {
        for (const voiceEntry of staffEntry.graphicalVoiceEntries) {
          for (const graphicalNote of voiceEntry.notes as unknown as NoteheadCapable[]) {
            appendLabelForNote(group, graphicalNote);
          }
        }
      }
    }
  }
}

function appendLabelForNote(group: SVGGElement, graphicalNote: NoteheadCapable): void {
  const sourceNote = graphicalNote.sourceNote;
  if (!sourceNote || sourceNote.isRest()) return;

  const pitch = sourceNote.TransposedPitch ?? sourceNote.Pitch;
  if (!pitch) return;

  const noteheadEls = graphicalNote.getNoteheadSVGs?.();
  if (!noteheadEls || noteheadEls.length === 0) return;

  const isOpenNotehead = sourceNote.NoteTypeXml >= NoteType.HALF;
  const letter = Pitch.getNoteEnumString(pitch.FundamentalNote);
  const fill = isOpenNotehead ? OPEN_NOTEHEAD_TEXT_COLOR : FILLED_NOTEHEAD_TEXT_COLOR;
  const halo = isOpenNotehead ? OPEN_NOTEHEAD_HALO_COLOR : FILLED_NOTEHEAD_HALO_COLOR;

  for (const el of noteheadEls) {
    const bbox = el.getBBox?.();
    if (!bbox || bbox.width === 0 || bbox.height === 0) continue;

    const fontSize = Math.max(bbox.height * 0.85, 4.5);
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", String(bbox.x + bbox.width / 2));
    text.setAttribute("y", String(bbox.y + bbox.height / 2));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.setAttribute("font-size", String(fontSize));
    text.setAttribute("font-family", "sans-serif");
    text.setAttribute("font-weight", "700");
    text.setAttribute("fill", fill);
    text.setAttribute("stroke", halo);
    text.setAttribute("stroke-width", String(fontSize * 0.22));
    text.setAttribute("stroke-linejoin", "round");
    text.setAttribute("paint-order", "stroke fill");
    text.textContent = letter;
    group.appendChild(text);
  }
}
