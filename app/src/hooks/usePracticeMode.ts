import { useCallback, useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useMidiInput } from "./useMidiInput";
import { midiNoteToFrequency, matchIncremental } from "../lib/practiceMatcher";
import { showNoteFeedback, clearNoteFeedback, type FeedbackState } from "../lib/noteFeedback";
import { createPianoSampler } from "../lib/pianoSampler";
import { moveCursorToTimestamp } from "../lib/cursorNavigation";
import type { OsmdNoteLike } from "../lib/graphicalNoteTypes";
import type { StaffRoles } from "../lib/staffRoles";

/** Thời gian tối đa chờ gom đủ hợp âm trước khi kết luận THIẾU nốt = sai - tính CỐ ĐỊNH từ nốt
 * ĐẦU TIÊN của lần thử (không reset lại mỗi nốt mới tới như debounce trước đây). Lý do đổi: debounce
 * reset-mỗi-nốt khiến đánh nhanh nhiều nốt đơn liên tiếp (nhanh hơn khoảng này) bị dồn chung vào 1
 * lần so khớp, luôn tính sai vì thừa nốt - đã verify đây là bug thật gây ra "đánh nhanh app không
 * bắt kịp, báo sai" (xem phân tích trong hội thoại). Với cách so khớp incremental mới (mỗi nốt tới
 * kiểm tra ngay), hằng số này CHỈ còn ý nghĩa "chờ bao lâu cho 1 hợp âm nhiều nốt gom đủ", không còn
 * quyết định việc phát hiện đánh nhanh nữa. */
const COLLECTION_WINDOW_MS = 220;
/** Giới hạn số bước dò lùi/tiến khi tìm ô nhịp hoặc nốt kế tiếp - chặn vòng lặp vô hạn ở các trường
 * hợp biên (đầu/cuối bài, hoặc tay đang chọn nghỉ dài). */
const MAX_REWIND_PROBE_STEPS = 500;
const MAX_NEXT_PEEK_STEPS = 100;
/** Số lần tối đa cho phép "nhảy cóc" sang vị trí sau khi phát hiện đánh nhanh (xem `processNote`) -
 * chặn đệ quy vô hạn trong trường hợp lý thuyết hiếm gặp (nhiều vị trí liên tiếp trùng cao độ). */
const MAX_REROUTE_HOPS = 3;
/** Độ trễ giữa mỗi bước tự động bỏ qua vị trí không có nốt của tay đang chọn - vẫn hiện cursor
 * trôi qua để người học cảm nhận được nhịp của cả bài, không nhảy thẳng tức thì. */
const SKIP_STEP_DELAY_MS = 220;
/** Thời gian tự tắt highlight phím ảo sau khi so khớp xong, nếu người chơi chưa kịp nhả phím. */
const PLAYED_KEY_CORRECT_CLEAR_MS = 300;
const PLAYED_KEY_INCORRECT_CLEAR_MS = 500;
/** Chế độ khó: đợi 1 chút sau khi hiện đỏ rồi mới tự lùi cursor về đầu ô nhịp - đủ để người chơi
 * kịp thấy vừa sai (không giật mình), không quá lâu gây cảm giác trễ. */
const STRICT_MODE_REWIND_DELAY_MS = 500;

export type PracticeHand = "both" | "left" | "right";

interface UsePracticeModeOptions {
  osmdRef: React.RefObject<OpenSheetMusicDisplay | null>;
  containerRef: React.RefObject<HTMLElement | null>;
  enabled: boolean;
  staffRoles: StaffRoles | null;
}

export function usePracticeMode({ osmdRef, containerRef, enabled, staffRoles }: UsePracticeModeOptions) {
  const pendingNotesRef = useRef<Set<number>>(new Set());
  const deadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const strictRewindTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [practiceHand, setPracticeHandState] = useState<PracticeHand>("both");
  const [strictMode, setStrictModeState] = useState(false);

  // Trạng thái các phím (số MIDI) đang được nhấn thật, để tô sáng trên bàn phím ảo - độc lập với
  // overlay trên khuông nhạc (notehead giữ đỏ tới khi sửa đúng; bàn phím ảo phản ánh phím ĐANG
  // được nhấn theo thời gian thực nên tự tắt khi nhả phím hoặc sau 1 khoảng ngắn).
  const [playedKeyStates, setPlayedKeyStates] = useState<Map<number, FeedbackState>>(new Map());
  const keyStateTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const setKeyState = useCallback((noteNumber: number, state: FeedbackState, autoClearMs?: number) => {
    const existingTimer = keyStateTimersRef.current.get(noteNumber);
    if (existingTimer) clearTimeout(existingTimer);
    keyStateTimersRef.current.delete(noteNumber);

    setPlayedKeyStates((prev) => {
      const next = new Map(prev);
      next.set(noteNumber, state);
      return next;
    });

    if (autoClearMs !== undefined) {
      const timer = setTimeout(() => {
        keyStateTimersRef.current.delete(noteNumber);
        setPlayedKeyStates((prev) => {
          if (!prev.has(noteNumber)) return prev;
          const next = new Map(prev);
          next.delete(noteNumber);
          return next;
        });
      }, autoClearMs);
      keyStateTimersRef.current.set(noteNumber, timer);
    }
  }, []);

  const clearKeyState = useCallback((noteNumber: number) => {
    const existingTimer = keyStateTimersRef.current.get(noteNumber);
    if (existingTimer) {
      clearTimeout(existingTimer);
      keyStateTimersRef.current.delete(noteNumber);
    }
    setPlayedKeyStates((prev) => {
      if (!prev.has(noteNumber)) return prev;
      const next = new Map(prev);
      next.delete(noteNumber);
      return next;
    });
  }, []);

  // Phát âm thanh piano qua loa máy tính khi bấm phím đàn MIDI - hữu ích cho đàn MIDI-only
  // (controller) không có loa riêng. Tắt mặc định vì nhiều đàn digital piano đã tự phát âm thanh
  // qua loa của đàn, bật thêm sẽ bị phát 2 lần chồng nhau (xem specs/keyboard.md).
  const [playMidiAudio, setPlayMidiAudioState] = useState(false);
  const midiSamplerRef = useRef<Tone.Sampler | null>(null);
  const midiSamplerLoadingRef = useRef(false);
  // Pedal sustain (CC64): trong lúc pedal đang đạp, nhả phím không tắt tiếng ngay mà chờ tới khi
  // nhả pedal mới thật sự release - đúng hành vi piano thật.
  const sustainPedalDownRef = useRef(false);
  const sustainingNotesRef = useRef<Set<number>>(new Set());

  const setPlayMidiAudio = useCallback((value: boolean) => {
    setPlayMidiAudioState(value);
    if (!value) {
      sustainPedalDownRef.current = false;
      sustainingNotesRef.current.clear();
      return;
    }
    // Unlock AudioContext ngay trong lúc xử lý sự kiện click (user gesture thật) - nếu chờ tới
    // lúc nhận được MIDI message mới gọi Tone.start() thì trình duyệt có thể chặn vì message MIDI
    // không được coi là "user gesture" hợp lệ để tự động phát âm thanh.
    void Tone.start();
    if (!midiSamplerRef.current && !midiSamplerLoadingRef.current) {
      midiSamplerLoadingRef.current = true;
      void createPianoSampler((err) => {
        console.error("Không tải được piano soundfont cho MIDI passthrough.", err);
      }).then((sampler) => {
        midiSamplerRef.current = sampler;
        midiSamplerLoadingRef.current = false;
      });
    }
  }, []);

  const getExpectedNotes = useCallback((): OsmdNoteLike[] => {
    const osmd = osmdRef.current;
    if (!osmd?.Sheet) return [];
    const gnotes = osmd.cursor.GNotesUnderCursor() as unknown as OsmdNoteLike[];
    let notes = gnotes.filter((gn) => gn.sourceNote && !gn.sourceNote.isRest());

    if (practiceHand !== "both" && staffRoles && !staffRoles.singleStaff) {
      const targetStaffId = practiceHand === "left" ? staffRoles.bassStaffId : staffRoles.trebleStaffId;
      notes = notes.filter((gn) => gn.sourceNote.ParentStaffEntry?.ParentStaff?.Id === targetStaffId);
    }
    return notes;
  }, [osmdRef, practiceHand, staffRoles]);

  const expectedFrequenciesOf = useCallback((notes: OsmdNoteLike[]): number[] => {
    return notes
      .map((gn) => gn.sourceNote.TransposedPitch ?? gn.sourceNote.Pitch)
      .filter((pitch): pitch is NonNullable<typeof pitch> => !!pitch)
      .map((pitch) => pitch.Frequency);
  }, []);

  /** Dò 1 bước KẾ TIẾP (tính theo tay đang chọn - bỏ qua các bước tay kia đang chơi mà tay này
   * nghỉ, giống `advanceUntilHandHasNotes`) để biết tần số các nốt SẼ được mong đợi tiếp theo.
   * Dùng bản clone của cursor thật (không đụng cursor thật) - để phát hiện trường hợp người chơi
   * đánh nhanh, đã sang tới nốt kế tiếp trước khi cursor kịp nhích (xem `processNote`). Chỉ cần
   * tần số để so khớp, không cần vẽ overlay nên không cần GraphicalNote/SVG. */
  const getNextExpectedFrequencies = useCallback((): number[] => {
    const osmd = osmdRef.current;
    if (!osmd?.Sheet) return [];
    const iterator = osmd.cursor.iterator.clone();

    for (let step = 0; step < MAX_NEXT_PEEK_STEPS; step++) {
      if (iterator.EndReached) return [];
      iterator.moveToNext();
      if (iterator.EndReached) return [];

      let notes = iterator.CurrentVoiceEntries.flatMap((voiceEntry) => voiceEntry.Notes).filter((n) => !n.isRest());
      if (practiceHand !== "both" && staffRoles && !staffRoles.singleStaff) {
        const targetStaffId = practiceHand === "left" ? staffRoles.bassStaffId : staffRoles.trebleStaffId;
        notes = notes.filter((n) => n.ParentStaffEntry?.ParentStaff?.Id === targetStaffId);
      }
      if (notes.length === 0) continue;

      return notes
        .map((n) => n.TransposedPitch ?? n.Pitch)
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map((p) => p.Frequency);
    }
    return [];
  }, [osmdRef, practiceHand, staffRoles]);

  /** Tay đang chọn không có nốt nào ở vị trí hiện tại (tay kia đang chơi) - tự động cho cursor
   * chạy qua (có độ trễ để vẫn cảm nhận được nhịp) tới khi tìm được vị trí có nốt của tay đó,
   * hoặc hết bài. Gọi sau: bật Practice Mode, đổi tay, sau khi advance tới nốt tiếp theo, và sau
   * khi bấm chọn 1 nốt (click-to-seek) - luôn đảm bảo cursor dừng đúng ở nơi có gì để so khớp.
   *
   * Bắt buộc phải bail ngay nếu Practice Mode đang TẮT (`enabled === false`): `resetForManualSeek`
   * (chạy trên MỌI lần click-to-seek, kể cả khi đang ở Listen Mode, và cả lúc tắt Practice Mode)
   * luôn gọi hàm này vô điều kiện - nếu không chặn theo `enabled`, việc chọn tay ("tay phải" chẳng
   * hạn) từ trước đó sẽ khiến cursor tự chạy tìm nốt treble ngay cả khi không còn ở Practice Mode
   * nữa, và mọi click-to-seek tiếp theo lại tự khởi động lại vòng lặp này - không cách nào dừng
   * được bằng thao tác thường (đúng bug đã gặp: chuyển từ Practice sang Listen, chọn tay phải,
   * cursor tự chạy qua các ô đầu không có nốt treble mà không dừng lại). */
  const advanceUntilHandHasNotes = useCallback(() => {
    if (skipTimerRef.current) clearTimeout(skipTimerRef.current);
    if (!enabled || practiceHand === "both" || !staffRoles || staffRoles.singleStaff) return;
    const osmd = osmdRef.current;
    if (!osmd?.Sheet) return;

    const step = () => {
      if (getExpectedNotes().length > 0) return;
      if (osmd.cursor.iterator.EndReached) return;
      osmd.cursor.next();
      osmd.cursor.show();
      skipTimerRef.current = setTimeout(step, SKIP_STEP_DELAY_MS);
    };
    step();
  }, [enabled, osmdRef, practiceHand, staffRoles, getExpectedNotes]);

  const setPracticeHand = useCallback(
    (value: PracticeHand) => {
      setPracticeHandState(value);
    },
    [],
  );

  const setStrictMode = useCallback((value: boolean) => {
    if (!value && strictRewindTimerRef.current) {
      clearTimeout(strictRewindTimerRef.current);
      strictRewindTimerRef.current = null;
    }
    setStrictModeState(value);
  }, []);

  /** Chế độ khó: đánh sai -> lùi cursor về đúng điểm bắt đầu ô nhịp ĐANG ĐỨNG (không phải lần đầu
   * tiên xuất hiện ô nhịp đó trong bài). Dò lùi CỤC BỘ bằng 1 bản clone của chính cursor thật
   * (`osmd.cursor.iterator.clone()`) thay vì quét lại từ đầu bài bằng measureIndex/timestamp - vì
   * bản nhạc có lặp lại (segno/coda/D.C...) khiến timestamp của 1 ô nhịp LẶP LẠI giống hệt ở mỗi
   * lượt (đã verify khi fix bug cursor lặp lại trước đó: đo bằng OSMD thật, ô nhịp 20 cho cùng
   * RealValue=18.5 ở cả 2 lượt) - quét từ đầu bài không thể phân biệt được đang ở lượt nào. Dò lùi
   * cục bộ từ vị trí cursor thật (vốn đã đứng đúng lượt) tránh hẳn vấn đề này.
   *
   * Có 1 điều cần lưu ý (đã verify bằng OSMD thật): `moveToPrevious()` không set `EndReached` khi
   * lùi quá điểm bắt đầu bản nhạc - nó "đứng khựng" lại với timestamp âm (-1) mãi mãi thay vì báo
   * hết bài, nên phải tự chặn (kiểm tra timestamp âm/không đổi) để tránh vòng lặp vô hạn. */
  const rewindToMeasureStart = useCallback(() => {
    const osmd = osmdRef.current;
    if (!osmd?.Sheet) return;
    const probe = osmd.cursor.iterator.clone();
    const targetMeasureIndex = probe.CurrentMeasureIndex;
    let measureStartTimestamp = probe.currentTimeStamp.RealValue;

    for (let i = 0; i < MAX_REWIND_PROBE_STEPS; i++) {
      if (probe.EndReached) break;
      const beforeTimestamp = probe.currentTimeStamp.RealValue;
      probe.moveToPrevious();
      const afterTimestamp = probe.currentTimeStamp.RealValue;
      if (
        probe.EndReached ||
        afterTimestamp < 0 ||
        afterTimestamp === beforeTimestamp ||
        probe.CurrentMeasureIndex !== targetMeasureIndex
      ) {
        break;
      }
      measureStartTimestamp = afterTimestamp;
    }

    moveCursorToTimestamp(osmd, measureStartTimestamp);
    advanceUntilHandHasNotes();
  }, [osmdRef, advanceUntilHandHasNotes]);

  /** Đánh ĐÚNG (đủ, khớp chính xác tập nốt mong đợi) - chuyển cursor NGAY LẬP TỨC, không còn chờ
   * 1 khoảng hiển thị xanh trước khi advance như bản cũ. Lý do đổi: khoảng chờ đó (trước đây
   * CORRECT_DISPLAY_MS=250ms) chỉ nhằm mục đích thẩm mỹ (cho thấy chớp xanh trước khi cursor rời
   * đi) - nhưng chính khoảng chờ này lại là 1 nguồn gây ra bug "đánh nhanh báo sai": nốt kế tiếp
   * đến trong lúc chờ vẫn bị so khớp với vị trí CŨ (đã xong nhưng cursor chưa kịp nhích). Chớp xanh
   * vẫn hiện được bình thường vì overlay là 1 phần tử SVG cố định tại vị trí notehead CŨ, tự fade
   * qua CSS transition độc lập với việc cursor đã chuyển đi hay chưa (xem `noteFeedback.ts`). */
  const resolveCorrect = useCallback(
    (expectedNotes: OsmdNoteLike[], playedNotes: number[]) => {
      const osmd = osmdRef.current;
      const container = containerRef.current;
      if (!osmd?.Sheet || !container) return;

      // Nếu vừa sai (đã lên lịch lùi về đầu ô nhịp) nhưng sửa đúng kịp trước khi lệnh lùi đó chạy -
      // phải hủy nó đi, không thì cursor vừa đi tới sẽ bị kéo ngược lại dù người chơi vừa đánh đúng.
      if (strictRewindTimerRef.current) {
        clearTimeout(strictRewindTimerRef.current);
        strictRewindTimerRef.current = null;
      }
      showNoteFeedback(container, expectedNotes, "correct");
      for (const noteNumber of playedNotes) setKeyState(noteNumber, "correct", PLAYED_KEY_CORRECT_CLEAR_MS);

      pendingNotesRef.current.clear();
      osmd.cursor.next();
      osmd.cursor.show();
      advanceUntilHandHasNotes();
    },
    [osmdRef, containerRef, setKeyState, advanceUntilHandHasNotes],
  );

  const resolveWrong = useCallback(
    (expectedNotes: OsmdNoteLike[], playedNotes: number[]) => {
      const container = containerRef.current;
      if (!container) return;

      showNoteFeedback(container, expectedNotes, "incorrect");
      for (const noteNumber of playedNotes) setKeyState(noteNumber, "incorrect", PLAYED_KEY_INCORRECT_CLEAR_MS);
      pendingNotesRef.current.clear();

      if (strictMode) {
        if (strictRewindTimerRef.current) clearTimeout(strictRewindTimerRef.current);
        strictRewindTimerRef.current = setTimeout(() => {
          strictRewindTimerRef.current = null;
          clearNoteFeedback(container);
          rewindToMeasureStart();
        }, STRICT_MODE_REWIND_DELAY_MS);
      }
    },
    [containerRef, setKeyState, strictMode, rewindToMeasureStart],
  );

  /** So khớp NGAY khi từng nốt tới (không còn đợi hết cửa sổ gom mới so khớp 1 lần) - xem
   * `matchIncremental`. `hopsRemaining` chặn đệ quy vô hạn khi "nhảy cóc" sang vị trí sau (chỉ xảy
   * ra khi đang ở đầu 1 lần thử mới - xem giải thích ở nhánh "wrong" bên dưới). */
  const processNote = useCallback(
    (noteNumber: number, hopsRemaining: number) => {
      const osmd = osmdRef.current;
      const container = containerRef.current;
      if (!osmd?.Sheet || !container) return;

      if (pendingNotesRef.current.size === 0) {
        // Bắt đầu 1 lần thử mới - đặt deadline CỐ ĐỊNH tính từ nốt đầu tiên này, không reset lại
        // mỗi khi có nốt mới tới nữa (khác hành vi debounce cũ) - chỉ dùng để kết luận SAI nếu
        // hợp âm mãi không gom đủ, không còn ảnh hưởng tới tốc độ phát hiện đánh nhanh.
        if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
        deadlineTimerRef.current = setTimeout(() => {
          deadlineTimerRef.current = null;
          if (pendingNotesRef.current.size === 0) return;
          const expectedNotes = getExpectedNotes();
          resolveWrong(expectedNotes, Array.from(pendingNotesRef.current));
        }, COLLECTION_WINDOW_MS);
      }

      pendingNotesRef.current.add(noteNumber);
      setKeyState(noteNumber, "listening");

      const expectedNotes = getExpectedNotes();
      const expectedFrequencies = expectedFrequenciesOf(expectedNotes);
      const pendingFrequencies = Array.from(pendingNotesRef.current).map(midiNoteToFrequency);
      const result = matchIncremental(pendingFrequencies, expectedFrequencies);

      showNoteFeedback(container, expectedNotes, "listening");

      if (result === "complete") {
        if (deadlineTimerRef.current) {
          clearTimeout(deadlineTimerRef.current);
          deadlineTimerRef.current = null;
        }
        resolveCorrect(expectedNotes, Array.from(pendingNotesRef.current));
        return;
      }

      if (result === "partial") {
        // Vẫn đang gom hợp âm, mọi nốt tới giờ đều đúng - chờ thêm (nốt tiếp theo hoặc deadline).
        return;
      }

      // "wrong": có nốt không thuộc tập mong đợi hiện tại. Nếu đây là NỐT ĐẦU TIÊN của lần thử này
      // (chưa gom dở hợp âm nào) - kiểm tra xem có phải người chơi đã đánh NHANH, lỡ sang tới vị
      // trí KẾ TIẾP trước khi cursor kịp nhích hay không (đúng bug đã gặp). Chỉ áp dụng khi
      // pendingNotesRef mới chỉ có 1 nốt DUY NHẤT - tránh nhập nhằng với trường hợp đang gom dở 1
      // hợp âm nhiều nốt rồi mới lệch (trường hợp đó vẫn giữ nguyên coi là sai, không tự suy đoán).
      if (pendingNotesRef.current.size === 1 && hopsRemaining > 0) {
        const nextExpectedFrequencies = getNextExpectedFrequencies();
        const nextResult = matchIncremental([midiNoteToFrequency(noteNumber)], nextExpectedFrequencies);
        if (nextResult !== "wrong" && nextExpectedFrequencies.length > 0) {
          // Đúng là nốt của vị trí SAU - coi vị trí hiện tại (mà nốt này không thuộc về) đã qua,
          // nhảy cursor luôn (không chấm sai/đúng gì cho vị trí cũ) rồi so khớp lại đúng nốt này
          // cho vị trí MỚI.
          if (deadlineTimerRef.current) {
            clearTimeout(deadlineTimerRef.current);
            deadlineTimerRef.current = null;
          }
          pendingNotesRef.current.clear();
          osmd.cursor.next();
          osmd.cursor.show();
          advanceUntilHandHasNotes();
          processNote(noteNumber, hopsRemaining - 1);
          return;
        }
      }

      if (deadlineTimerRef.current) {
        clearTimeout(deadlineTimerRef.current);
        deadlineTimerRef.current = null;
      }
      resolveWrong(expectedNotes, Array.from(pendingNotesRef.current));
    },
    [
      osmdRef,
      containerRef,
      getExpectedNotes,
      expectedFrequenciesOf,
      getNextExpectedFrequencies,
      setKeyState,
      resolveCorrect,
      resolveWrong,
      advanceUntilHandHasNotes,
    ],
  );

  const handleNoteOn = useCallback(
    (noteNumber: number, velocity: number) => {
      if (!enabled) return;

      if (playMidiAudio && midiSamplerRef.current) {
        // Bấm lại 1 nốt đang ngân do pedal giữ - coi như 1 lần đánh mới, không cần release riêng nữa.
        sustainingNotesRef.current.delete(noteNumber);
        // Dùng Tone.immediate() thay vì Tone.now() - Tone.now() cộng thêm "lookAhead" mặc định
        // 0.1s (100ms) để đảm bảo lịch phát nhạc mượt cho nhạc ĐÃ LÊN LỊCH TRƯỚC (Tone.Transport ở
        // usePlayback.ts), nhưng với input real-time từ phím đàn thì 100ms đó là độ trễ cố định,
        // nghe rõ ràng bị hụt hẫng so với tiếng loa thật của đàn. immediate() bỏ qua lookAhead này.
        midiSamplerRef.current.triggerAttack(midiNoteToFrequency(noteNumber), Tone.immediate(), velocity / 127);
      }

      processNote(noteNumber, MAX_REROUTE_HOPS);
    },
    [enabled, playMidiAudio, processNote],
  );

  const handleNoteOff = useCallback(
    (noteNumber: number) => {
      // Tắt highlight phím ảo ngay khi nhả phím thật - phản ánh đúng trạng thái vật lý real-time,
      // độc lập với việc có bật phát âm thanh qua máy tính (playMidiAudio) hay không.
      clearKeyState(noteNumber);

      if (!playMidiAudio || !midiSamplerRef.current) return;
      if (sustainPedalDownRef.current) {
        // Pedal đang giữ - hoãn release, chỉ đánh dấu để nhả khi pedal thả ra.
        sustainingNotesRef.current.add(noteNumber);
        return;
      }
      midiSamplerRef.current.triggerRelease(midiNoteToFrequency(noteNumber), Tone.immediate());
    },
    [playMidiAudio, clearKeyState],
  );

  const handleSustainPedal = useCallback(
    (down: boolean) => {
      sustainPedalDownRef.current = down;
      if (down || !playMidiAudio || !midiSamplerRef.current) return;
      // Pedal vừa thả ra - release toàn bộ các nốt đã nhả phím nhưng bị pedal giữ ngân trước đó.
      const sampler = midiSamplerRef.current;
      for (const noteNumber of sustainingNotesRef.current) {
        sampler.triggerRelease(midiNoteToFrequency(noteNumber), Tone.immediate());
      }
      sustainingNotesRef.current.clear();
    },
    [playMidiAudio],
  );

  const midi = useMidiInput({ onNoteOn: handleNoteOn, onNoteOff: handleNoteOff, onSustainPedal: handleSustainPedal });

  /** Người dùng bấm vào 1 notehead để cursor nhảy tới đó (click-to-seek, vẫn hoạt động độc lập
   * với Practice Mode) - phải hủy mọi lần đánh đang chờ so khớp dở dang và xóa feedback cũ đang
   * hiện (vd đỏ ở nốt vừa rời đi), nếu không lần đánh dở đó sẽ so khớp nhầm với nốt MỚI vừa nhảy
   * tới, và overlay cũ có thể còn sót lại ở vị trí không còn liên quan nữa. */
  const resetForManualSeek = useCallback(() => {
    if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
    deadlineTimerRef.current = null;
    if (strictRewindTimerRef.current) clearTimeout(strictRewindTimerRef.current);
    strictRewindTimerRef.current = null;
    pendingNotesRef.current.clear();
    const container = containerRef.current;
    if (container) clearNoteFeedback(container);
    // Chạy sau khi tick hiện tại (gồm cả seekTo di chuyển cursor) hoàn tất, để kiểm tra đúng vị trí
    // MỚI - nếu tay đang chọn không có nốt nào ngay tại đó, tự động chạy tiếp tới vị trí có nốt.
    setTimeout(() => advanceUntilHandHasNotes(), 0);
  }, [containerRef, advanceUntilHandHasNotes]);

  // Tắt Practice Mode: dọn dẹp timer + feedback đang hiện, không để sót lại giữa chừng.
  useEffect(() => {
    if (enabled) return;
    if (skipTimerRef.current) clearTimeout(skipTimerRef.current);
    resetForManualSeek();
    sustainPedalDownRef.current = false;
    sustainingNotesRef.current.clear();
    for (const timer of keyStateTimersRef.current.values()) clearTimeout(timer);
    keyStateTimersRef.current.clear();
    setPlayedKeyStates(new Map());
  }, [enabled, resetForManualSeek]);

  // Bật Practice Mode hoặc đổi tay đang luyện tập: đảm bảo cursor đang đứng ở vị trí có nốt của
  // tay đó, nếu không thì tự động chạy tiếp (xem specs/keyboard.md).
  useEffect(() => {
    if (!enabled) return;
    advanceUntilHandHasNotes();
  }, [enabled, practiceHand, advanceUntilHandHasNotes]);

  useEffect(() => {
    const keyStateTimers = keyStateTimersRef.current;
    return () => {
      if (deadlineTimerRef.current) clearTimeout(deadlineTimerRef.current);
      if (skipTimerRef.current) clearTimeout(skipTimerRef.current);
      if (strictRewindTimerRef.current) clearTimeout(strictRewindTimerRef.current);
      for (const timer of keyStateTimers.values()) clearTimeout(timer);
      midiSamplerRef.current?.dispose();
    };
  }, []);

  return {
    midiStatus: midi.status,
    midiInputs: midi.inputs,
    midiError: midi.error,
    connectMidi: midi.connect,
    resetForManualSeek,
    playMidiAudio,
    setPlayMidiAudio,
    playedKeyStates,
    practiceHand,
    setPracticeHand,
    strictMode,
    setStrictMode,
  };
}
