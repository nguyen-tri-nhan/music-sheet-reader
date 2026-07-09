import { useCallback, useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useMidiInput } from "./useMidiInput";
import { midiNoteToFrequency, matchPlayedNotes } from "../lib/practiceMatcher";
import { showNoteFeedback, clearNoteFeedback } from "../lib/noteFeedback";
import { createPianoSampler } from "../lib/pianoSampler";
import type { OsmdNoteLike } from "../lib/graphicalNoteTypes";
import type { StaffRoles } from "../lib/staffRoles";

/** Gom các Note On đến trong cửa sổ này thành 1 "lần đánh" trước khi so khớp - đủ để chờ đánh
 * đầy đủ 1 hợp âm, cũng tự nhiên đóng vai trò bộ đệm chống báo sai giả (xem specs/keyboard.md). */
const COLLECTION_WINDOW_MS = 220;
/** Thời gian hiện chớp xanh lá trước khi thực sự chuyển cursor sang nốt tiếp theo. */
const CORRECT_DISPLAY_MS = 250;
/** Độ trễ giữa mỗi bước tự động bỏ qua vị trí không có nốt của tay đang chọn - vẫn hiện cursor
 * trôi qua để người học cảm nhận được nhịp của cả bài, không nhảy thẳng tức thì. */
const SKIP_STEP_DELAY_MS = 220;

export type PracticeHand = "both" | "left" | "right";

interface UsePracticeModeOptions {
  osmdRef: React.RefObject<OpenSheetMusicDisplay | null>;
  containerRef: React.RefObject<HTMLElement | null>;
  enabled: boolean;
  staffRoles: StaffRoles | null;
}

export function usePracticeMode({ osmdRef, containerRef, enabled, staffRoles }: UsePracticeModeOptions) {
  const bufferRef = useRef<Set<number>>(new Set());
  const collectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [practiceHand, setPracticeHandState] = useState<PracticeHand>("both");

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

  /** Tay đang chọn không có nốt nào ở vị trí hiện tại (tay kia đang chơi) - tự động cho cursor
   * chạy qua (có độ trễ để vẫn cảm nhận được nhịp) tới khi tìm được vị trí có nốt của tay đó,
   * hoặc hết bài. Gọi sau: bật Practice Mode, đổi tay, sau khi advance tới nốt tiếp theo, và sau
   * khi bấm chọn 1 nốt (click-to-seek) - luôn đảm bảo cursor dừng đúng ở nơi có gì để so khớp. */
  const advanceUntilHandHasNotes = useCallback(() => {
    if (skipTimerRef.current) clearTimeout(skipTimerRef.current);
    if (practiceHand === "both" || !staffRoles || staffRoles.singleStaff) return;
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
  }, [osmdRef, practiceHand, staffRoles, getExpectedNotes]);

  const setPracticeHand = useCallback(
    (value: PracticeHand) => {
      setPracticeHandState(value);
    },
    [],
  );

  const expectedFrequenciesOf = useCallback((notes: OsmdNoteLike[]): number[] => {
    return notes
      .map((gn) => gn.sourceNote.TransposedPitch ?? gn.sourceNote.Pitch)
      .filter((pitch): pitch is NonNullable<typeof pitch> => !!pitch)
      .map((pitch) => pitch.Frequency);
  }, []);

  const evaluate = useCallback(() => {
    const osmd = osmdRef.current;
    const container = containerRef.current;
    const played = Array.from(bufferRef.current);
    bufferRef.current.clear();
    if (!osmd?.Sheet || !container || played.length === 0) return;

    const expectedNotes = getExpectedNotes();
    const expectedFrequencies = expectedFrequenciesOf(expectedNotes);
    const playedFrequencies = played.map(midiNoteToFrequency);
    const result = matchPlayedNotes(playedFrequencies, expectedFrequencies);

    if (result === "correct") {
      showNoteFeedback(container, expectedNotes, "correct");
      advanceTimerRef.current = setTimeout(() => {
        clearNoteFeedback(container);
        osmd.cursor.next();
        osmd.cursor.show();
        advanceUntilHandHasNotes();
      }, CORRECT_DISPLAY_MS);
    } else {
      showNoteFeedback(container, expectedNotes, "incorrect");
    }
  }, [osmdRef, containerRef, getExpectedNotes, expectedFrequenciesOf, advanceUntilHandHasNotes]);

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

      const container = containerRef.current;
      if (container) {
        showNoteFeedback(container, getExpectedNotes(), "listening");
      }
      bufferRef.current.add(noteNumber);
      if (collectTimerRef.current) clearTimeout(collectTimerRef.current);
      collectTimerRef.current = setTimeout(evaluate, COLLECTION_WINDOW_MS);
    },
    [enabled, playMidiAudio, containerRef, getExpectedNotes, evaluate],
  );

  const handleNoteOff = useCallback(
    (noteNumber: number) => {
      if (!playMidiAudio || !midiSamplerRef.current) return;
      if (sustainPedalDownRef.current) {
        // Pedal đang giữ - hoãn release, chỉ đánh dấu để nhả khi pedal thả ra.
        sustainingNotesRef.current.add(noteNumber);
        return;
      }
      midiSamplerRef.current.triggerRelease(midiNoteToFrequency(noteNumber), Tone.immediate());
    },
    [playMidiAudio],
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
    if (collectTimerRef.current) clearTimeout(collectTimerRef.current);
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    bufferRef.current.clear();
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
  }, [enabled, resetForManualSeek]);

  // Bật Practice Mode hoặc đổi tay đang luyện tập: đảm bảo cursor đang đứng ở vị trí có nốt của
  // tay đó, nếu không thì tự động chạy tiếp (xem specs/keyboard.md).
  useEffect(() => {
    if (!enabled) return;
    advanceUntilHandHasNotes();
  }, [enabled, practiceHand, advanceUntilHandHasNotes]);

  useEffect(() => {
    return () => {
      if (collectTimerRef.current) clearTimeout(collectTimerRef.current);
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (skipTimerRef.current) clearTimeout(skipTimerRef.current);
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
    practiceHand,
    setPracticeHand,
  };
}
