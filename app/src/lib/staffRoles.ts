export interface StaffRoles {
  trebleStaffId: number;
  bassStaffId: number;
  /** true nếu bản nhạc chỉ có 1 khuông nhạc - không có khái niệm "tay trái/tay phải". */
  singleStaff: boolean;
}

/** Xác định staff nào là khóa Sol (tay phải) / khóa Fa (tay trái) từ MusicXML thô, dựa theo
 * thẻ <clef> của part đầu tiên - cùng quy ước staff numbering mà OSMD dùng cho
 * note.ParentStaffEntry.ParentStaff.Id (đã verify khớp nhau bằng OSMD thật). */
export function detectStaffRoles(xml: string): StaffRoles {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const part = doc.getElementsByTagName("part")[0];

  const staffNumbers = new Set<number>();
  const bassStaffNumbers = new Set<number>();

  if (part) {
    for (const clef of Array.from(part.getElementsByTagName("clef"))) {
      const numberAttr = clef.getAttribute("number");
      const staffNum = numberAttr ? parseInt(numberAttr, 10) : 1;
      staffNumbers.add(staffNum);
      if (clef.getElementsByTagName("sign")[0]?.textContent?.trim() === "F") {
        bassStaffNumbers.add(staffNum);
      }
    }
  }

  if (staffNumbers.size <= 1) {
    const only = staffNumbers.size === 1 ? [...staffNumbers][0] : 1;
    return { trebleStaffId: only, bassStaffId: only, singleStaff: true };
  }

  const bassStaffId = bassStaffNumbers.size > 0 ? Math.min(...bassStaffNumbers) : Math.max(...staffNumbers);
  const trebleCandidates = [...staffNumbers].filter((n) => n !== bassStaffId);
  const trebleStaffId = trebleCandidates.length > 0 ? Math.min(...trebleCandidates) : bassStaffId;

  return { trebleStaffId, bassStaffId, singleStaff: false };
}
