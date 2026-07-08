import type { OsmdNoteLike } from "./graphicalNoteTypes";

const FEEDBACK_GROUP_ID = "practice-feedback-overlay";
const SVG_NS = "http://www.w3.org/2000/svg";

export type FeedbackState = "listening" | "correct" | "incorrect";

/** Xanh dương: vừa bấm phím, đang chờ gom đủ hợp âm để so khớp.
 * Xanh lá: đúng - hiện chớp nhanh rồi fade, cursor chuyển sang nốt tiếp theo.
 * Đỏ (tông vừa phải, không chói gắt): sai - giữ nguyên tới khi người chơi sửa đúng, không tự fade,
 * để tránh cảm giác báo động giật mình (theo quyết định UX trong specs/keyboard.md). */
const STATE_COLORS: Record<FeedbackState, string> = {
  listening: "#4a9eff",
  correct: "#2ecc71",
  incorrect: "#e0524a",
};

function ensureGroup(container: HTMLElement): SVGGElement | null {
  const svg = container.querySelector("svg");
  if (!svg) return null;
  let group = svg.querySelector(`#${FEEDBACK_GROUP_ID}`) as SVGGElement | null;
  if (!group) {
    group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("id", FEEDBACK_GROUP_ID);
    group.setAttribute("pointer-events", "none");
    svg.appendChild(group);
  }
  return group;
}

export function clearNoteFeedback(container: HTMLElement): void {
  container.querySelector(`#${FEEDBACK_GROUP_ID}`)?.remove();
}

/** Vẽ overlay hình elip màu đè lên đúng notehead đang được mong đợi tại cursor - tái dùng kỹ
 * thuật định vị của tính năng "hiện tên nốt" (getNoteheadSVGs()[vfnoteIndex] + getBBox()).
 * Dùng CSS transition (khai báo qua style.transition) để đổi màu/fade mượt thay vì đổi cứng ngay,
 * tránh cảm giác giật mình khi báo sai. */
export function showNoteFeedback(container: HTMLElement, notes: OsmdNoteLike[], state: FeedbackState): void {
  const group = ensureGroup(container);
  if (!group) return;
  group.innerHTML = "";

  const color = STATE_COLORS[state];
  for (const note of notes) {
    const el = note.getNoteheadSVGs?.()[note.vfnoteIndex];
    const bbox = el?.getBBox?.();
    if (!bbox || bbox.width === 0 || bbox.height === 0) continue;

    const ellipse = document.createElementNS(SVG_NS, "ellipse");
    ellipse.setAttribute("cx", String(bbox.x + bbox.width / 2));
    ellipse.setAttribute("cy", String(bbox.y + bbox.height / 2));
    ellipse.setAttribute("rx", String(bbox.width * 0.85));
    ellipse.setAttribute("ry", String(bbox.height * 0.85));
    ellipse.setAttribute("fill", color);
    ellipse.setAttribute("fill-opacity", "0.55");
    ellipse.style.transition = "fill 150ms ease, fill-opacity 300ms ease";
    group.appendChild(ellipse);

    if (state === "correct") {
      // Chớp xanh lá nhanh rồi fade ra - báo hiệu "đúng, đang chuyển tiếp".
      requestAnimationFrame(() => {
        ellipse.setAttribute("fill-opacity", "0");
      });
    }
  }
}
