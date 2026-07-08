import JSZip from "jszip";

/** Đọc 1 file .mxl (nén) hoặc .xml/.musicxml (thô) do user upload, trả về nội dung MusicXML dạng text. */
export async function readScoreFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  if (isZipFile(buffer)) {
    return extractMusicXmlFromMxl(buffer);
  }
  return new TextDecoder("utf-8").decode(buffer);
}

function isZipFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 2) return false;
  const bytes = new Uint8Array(buffer, 0, 2);
  return bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
}

async function extractMusicXmlFromMxl(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);

  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) {
    throw new Error("File .mxl không hợp lệ: thiếu META-INF/container.xml");
  }
  const containerXml = await containerFile.async("text");
  const containerDoc = new DOMParser().parseFromString(containerXml, "application/xml");
  const rootfilePath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
  if (!rootfilePath) {
    throw new Error("File .mxl không hợp lệ: không tìm thấy rootfile trong container.xml");
  }

  const rootFile = zip.file(rootfilePath);
  if (!rootFile) {
    throw new Error(`File .mxl không hợp lệ: không tìm thấy "${rootfilePath}" trong archive`);
  }
  return rootFile.async("text");
}
