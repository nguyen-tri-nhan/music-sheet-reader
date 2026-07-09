import { Chord } from "tonal";
import { readScoreFile } from "./scoreFile";

export type ChordSource = "existing" | "detected" | "none";

export interface PreparedScore {
  xml: string;
  chordSource: ChordSource;
}

interface DetectedChord {
  rootLetter: string;
  rootAlter: number;
  suffix: string;
  kind: string;
}

/** suffix hiển thị + kind chuẩn MusicXML cho từng loại hợp âm mà tonal có thể trả về. */
const TYPE_TO_DISPLAY: Record<string, { suffix: string; kind: string }> = {
  major: { suffix: "", kind: "major" },
  minor: { suffix: "m", kind: "minor" },
  "dominant seventh": { suffix: "7", kind: "dominant" },
  "major seventh": { suffix: "maj7", kind: "major-seventh" },
  "minor seventh": { suffix: "m7", kind: "minor-seventh" },
  diminished: { suffix: "dim", kind: "diminished" },
  "diminished seventh": { suffix: "dim7", kind: "diminished-seventh" },
  "half-diminished": { suffix: "m7b5", kind: "half-diminished" },
  augmented: { suffix: "aug", kind: "augmented" },
  "suspended second": { suffix: "sus2", kind: "suspended-second" },
  "suspended fourth": { suffix: "sus4", kind: "suspended-fourth" },
  fifth: { suffix: "5", kind: "power" },
  "minor major seventh": { suffix: "mMaj7", kind: "major-minor" },
  "major sixth": { suffix: "6", kind: "major-sixth" },
  "minor sixth": { suffix: "m6", kind: "minor-sixth" },
  "dominant ninth": { suffix: "9", kind: "dominant-ninth" },
  "major ninth": { suffix: "maj9", kind: "major-ninth" },
  "minor ninth": { suffix: "m9", kind: "minor-ninth" },
};

/** Đọc file user upload (.mxl/.xml), nếu file đã có sẵn <harmony> thì giữ nguyên phần hợp âm;
 * nếu không, tự phân tích hợp âm từ các nốt ở khóa Fa (theo từng ô nhịp) và chèn
 * <harmony> tương ứng vào MusicXML để OSMD tự vẽ + tự transpose cùng bản nhạc.
 * Ngoài ra luôn dọn dẹp text bị lỗi export (vd "To Coda" hiện literal <font>/<sym> tag) dù
 * file đã có harmony hay chưa. */
export async function prepareScoreXml(file: File): Promise<PreparedScore> {
  const rawXml = await readScoreFile(file);
  const doc = new DOMParser().parseFromString(rawXml, "application/xml");

  if (doc.querySelector("parsererror")) {
    throw new Error("Không đọc được nội dung MusicXML từ file này.");
  }

  const textSanitized = sanitizeMalformedWordsText(doc);
  const hasHarmony = doc.getElementsByTagName("harmony").length > 0;

  if (hasHarmony) {
    return { xml: textSanitized ? new XMLSerializer().serializeToString(doc) : rawXml, chordSource: "existing" };
  }

  const injectedCount = injectDetectedHarmony(doc);
  if (injectedCount === 0) {
    return { xml: textSanitized ? new XMLSerializer().serializeToString(doc) : rawXml, chordSource: "none" };
  }

  const serialized = new XMLSerializer().serializeToString(doc);
  return { xml: serialized, chordSource: "detected" };
}

/** Tên hiển thị cho các <sym> hay gặp trong text bị lỗi export (MuseScore đôi khi xuất chỉ dẫn
 * "To Coda"/"D.S. al Coda" thành text thô chứa literal "<font ...></font><sym>coda</sym>" thay vì
 * dùng đúng ký hiệu, khiến OSMD vẽ ra nguyên chuỗi đó thay vì tên gọi dễ đọc. */
const SYM_DISPLAY_NAMES: Record<string, string> = {
  coda: "Coda",
  segno: "Segno",
  repeat: "Repeat",
};

/** Dọn các <words>/<credit-words> có literal "<font ...>"/"</font>"/"<sym>...</sym>" lẫn trong text
 * (đây là text thật, không phải markup thật - do lỗi export nên mới bị escape thành entity rồi hiện
 * ra y nguyên). Trả về true nếu có sửa gì đó, để biết có cần serialize lại XML hay không. */
function sanitizeMalformedWordsText(doc: Document): boolean {
  let changed = false;
  const elements = [...Array.from(doc.getElementsByTagName("words")), ...Array.from(doc.getElementsByTagName("credit-words"))];

  for (const el of elements) {
    const original = el.textContent ?? "";
    if (!original.includes("<")) continue;

    const cleaned = original
      .replace(/<font[^>]*>/gi, "")
      .replace(/<\/font>/gi, "")
      .replace(/<sym>([a-zA-Z-]+)<\/sym>/gi, (_match, name: string) => {
        const key = name.toLowerCase();
        return SYM_DISPLAY_NAMES[key] ?? name.charAt(0).toUpperCase() + name.slice(1);
      })
      .replace(/\s+/g, " ")
      .trim();

    if (cleaned !== original) {
      el.textContent = cleaned;
      changed = true;
    }
  }

  return changed;
}

interface Bucket {
  pitchClasses: string[];
  anchorNote: Element;
}

/** Cửa sổ (tính theo số phách/beat) để gom nốt khóa Fa lại phân tích thành 1 hợp âm.
 * Nhịp chẵn (4/4, 2/4...) -> nửa ô nhịp; nhịp lẻ (3/4...) -> cả ô nhịp.
 * Đây là suy đoán về nhịp điệu hòa âm (harmonic rhythm), không phải lúc nào cũng đúng
 * với mọi bài (best-effort fallback). */
function getWindowBeats(doc: Document): number {
  const beatsText = doc.getElementsByTagName("beats")[0]?.textContent;
  const beatsPerMeasure = beatsText ? parseInt(beatsText, 10) : 4;
  if (!beatsPerMeasure || Number.isNaN(beatsPerMeasure)) return 2;
  return beatsPerMeasure % 2 === 0 ? Math.min(2, beatsPerMeasure) : beatsPerMeasure;
}

function injectDetectedHarmony(doc: Document): number {
  let injected = 0;
  const windowBeats = getWindowBeats(doc);
  const parts = Array.from(doc.getElementsByTagName("part"));

  for (const part of parts) {
    const bassStaffNumbers = findBassStaffNumbers(part);
    if (bassStaffNumbers.size === 0) continue;
    // Hợp âm phân tích từ khóa Fa nhưng hiển thị ở vị trí chuẩn (trên khuông cao nhất/khóa Sol
    // của hệ thống), giống cách các phần mềm chép nhạc thường làm, thay vì ngay trên khóa Fa.
    const displayStaff = findTopStaffNumber(part);

    let divisions = 1;
    const measures = Array.from(part.children).filter((el) => el.tagName === "measure");

    for (const measure of measures) {
      const buckets = new Map<number, Bucket>();
      let position = 0;

      for (const child of Array.from(measure.children)) {
        if (child.tagName === "attributes") {
          const divisionsText = child.getElementsByTagName("divisions")[0]?.textContent;
          if (divisionsText) {
            divisions = parseFloat(divisionsText) || divisions;
          }
        } else if (child.tagName === "backup") {
          const duration = parseFloat(child.getElementsByTagName("duration")[0]?.textContent ?? "0");
          position -= duration;
        } else if (child.tagName === "forward") {
          const duration = parseFloat(child.getElementsByTagName("duration")[0]?.textContent ?? "0");
          position += duration;
        } else if (child.tagName === "note") {
          const isChordNote = child.getElementsByTagName("chord").length > 0;
          const isRest = child.getElementsByTagName("rest").length > 0;
          const duration = parseFloat(child.getElementsByTagName("duration")[0]?.textContent ?? "0");
          const staffText = child.getElementsByTagName("staff")[0]?.textContent?.trim();
          const staffNum = staffText ? parseInt(staffText, 10) : 1;

          if (!isRest && bassStaffNumbers.has(staffNum)) {
            const pitchEl = child.getElementsByTagName("pitch")[0];
            if (pitchEl) {
              const windowTicks = divisions * windowBeats;
              const bucketIndex = Math.floor(position / windowTicks);
              const bucket = buckets.get(bucketIndex);
              if (bucket) {
                bucket.pitchClasses.push(pitchNodeToNoteName(pitchEl));
              } else {
                buckets.set(bucketIndex, { pitchClasses: [pitchNodeToNoteName(pitchEl)], anchorNote: child });
              }
            }
          }

          if (!isChordNote) {
            position += duration;
          }
        }
      }

      const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
      for (const [, bucket] of sortedBuckets) {
        const chord = detectChordFromPitchClasses(bucket.pitchClasses);
        if (!chord) continue;
        const harmonyEl = buildHarmonyElement(doc, chord, displayStaff);
        measure.insertBefore(harmonyEl, bucket.anchorNote);
        injected++;
      }
    }
  }
  return injected;
}

/** Số hiệu staff trên cùng của 1 part (thường là 1 = khóa Sol trong piano 2 khuông).
 * Dùng làm nơi hiển thị hợp âm theo đúng vị trí chuẩn. */
function findTopStaffNumber(part: Element): number {
  const result = new Set<number>();
  const clefs = Array.from(part.getElementsByTagName("clef"));
  for (const clef of clefs) {
    const numberAttr = clef.getAttribute("number");
    result.add(numberAttr ? parseInt(numberAttr, 10) : 1);
  }
  return result.size > 0 ? Math.min(...result) : 1;
}

function findBassStaffNumbers(part: Element): Set<number> {
  const result = new Set<number>();
  const clefs = Array.from(part.getElementsByTagName("clef"));
  for (const clef of clefs) {
    const sign = clef.getElementsByTagName("sign")[0]?.textContent?.trim();
    if (sign !== "F") continue;
    const numberAttr = clef.getAttribute("number");
    result.add(numberAttr ? parseInt(numberAttr, 10) : 1);
  }
  return result;
}

function pitchNodeToNoteName(pitchEl: Element): string {
  const step = pitchEl.getElementsByTagName("step")[0]?.textContent?.trim() ?? "C";
  const alterText = pitchEl.getElementsByTagName("alter")[0]?.textContent?.trim();
  const alter = alterText ? Math.round(parseFloat(alterText)) : 0;
  const accidental = alter === 1 ? "#" : alter === 2 ? "##" : alter === -1 ? "b" : alter === -2 ? "bb" : "";
  return `${step}${accidental}`;
}

export function detectChordFromPitchClasses(pitchClasses: string[]): DetectedChord | null {
  const unique = Array.from(new Set(pitchClasses));
  if (unique.length === 0) return null;
  if (unique.length === 1) {
    return splitRoot(unique[0], "", "major");
  }

  const candidates = Chord.detect(unique);
  if (candidates.length === 0) {
    return splitRoot(unique[0], "", "other");
  }

  const best = candidates.find((c) => !c.includes("/")) ?? candidates[0];
  const cleanSymbol = best.split("/")[0];
  const info = Chord.get(cleanSymbol);
  const display = TYPE_TO_DISPLAY[info.type] ?? { suffix: info.aliases[0] ?? "", kind: "other" };
  return splitRoot(info.tonic ?? cleanSymbol, display.suffix, display.kind);
}

function splitRoot(rootNoteName: string, suffix: string, kind: string): DetectedChord {
  const match = /^([A-G])(#{1,2}|b{1,2})?/.exec(rootNoteName);
  const letter = match?.[1] ?? "C";
  const accidental = match?.[2] ?? "";
  const alter = accidental === "#" ? 1 : accidental === "##" ? 2 : accidental === "b" ? -1 : accidental === "bb" ? -2 : 0;
  return { rootLetter: letter, rootAlter: alter, suffix, kind };
}

function buildHarmonyElement(doc: Document, chord: DetectedChord, staff: number): Element {
  const harmony = doc.createElement("harmony");

  const root = doc.createElement("root");
  const rootStep = doc.createElement("root-step");
  rootStep.textContent = chord.rootLetter;
  root.appendChild(rootStep);
  if (chord.rootAlter !== 0) {
    const rootAlter = doc.createElement("root-alter");
    rootAlter.textContent = String(chord.rootAlter);
    root.appendChild(rootAlter);
  }
  harmony.appendChild(root);

  const kind = doc.createElement("kind");
  kind.setAttribute("text", chord.suffix);
  kind.textContent = chord.kind;
  harmony.appendChild(kind);

  const staffEl = doc.createElement("staff");
  staffEl.textContent = String(staff);
  harmony.appendChild(staffEl);

  return harmony;
}
