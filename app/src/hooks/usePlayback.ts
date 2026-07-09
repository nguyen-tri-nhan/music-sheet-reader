import { useCallback, useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { toScientificPitchName } from "../lib/pitchName";
import { moveCursorToTimestamp } from "../lib/cursorNavigation";
import { createPianoSampler } from "../lib/pianoSampler";

interface ScheduledNote {
  time: number;
  duration: number;
  note: string;
}

interface Schedule {
  notes: ScheduledNote[];
  cursorTimes: number[];
  totalDuration: number;
}

/** Xây lịch phát bắt đầu từ vị trí HIỆN TẠI của cursor, để có thể tiếp tục phát từ bất kỳ nốt
 * nào người dùng đã bấm chọn hoặc đã tạm dừng ở đó. Mốc thời gian trả về là thời gian tương đối
 * tính từ vị trí bắt đầu này.
 *
 * Quét bằng 1 bản clone độc lập của iterator (osmd.cursor.iterator.clone()), KHÔNG dùng trực tiếp
 * osmd.cursor - vì osmd bật followCursor:true nên mỗi lần osmd.cursor.next() chạy sẽ tự cuộn trang
 * theo. Nếu dùng cursor thật để quét hết bản nhạc (chỉ để tính thời gian, không phải để hiển thị),
 * trang sẽ bị cuộn xuống cuối rồi phải cuộn ngược lại - đúng bug đã gặp khi bấm Play. Cursor thật
 * chỉ nên di chuyển đúng theo nhịp độ thật của nhạc (qua các lệnh Tone.Transport.schedule bên dưới).
 *
 * QUAN TRỌNG: iterator.currentTimeStamp.RealValue là mốc thời gian THEO VỊ TRÍ TRONG BẢN NHẠC GỐC,
 * không phải thời gian phát nhạc thực tế đã trôi qua - khi bản nhạc có lặp lại (segno/coda/D.C...),
 * iterator sẽ đi qua CÙNG 1 đoạn nhạc nhiều lần và mốc thời gian này LẶP LẠI giống hệt lần trước
 * (đã verify bằng OSMD thật: ô nhịp 20 cho ra RealValue=18.5 ở CẢ 2 lượt đi qua). Nếu dùng thẳng
 * giá trị này để lên lịch Tone.Transport.schedule, thời gian sẽ NHẢY NGƯỢC VỀ QUÁ KHỨ ở lượt lặp
 * lại thứ 2, khiến Transport dồn 1 loạt note/cursor.next() chạy gần như ngay lập tức thay vì đúng
 * theo nhịp độ - đây là nguyên nhân cursor bị sai khi phát nhạc có đoạn lặp lại. Để tránh điều này,
 * tự cộng dồn thời gian đã trôi qua (elapsed) theo ĐỘ DÀI THỰC TẾ của từng bước (khoảng cách note
 * ngắn nhất trong các voice hiện tại - đã verify bằng OSMD thật rằng giá trị này luôn khớp đúng
 * bằng độ lệch thời gian thật giữa 2 bước liên tiếp), thay vì dựa vào RealValue tuyệt đối. */
function buildScheduleFromCurrentPosition(osmd: OpenSheetMusicDisplay, bpm: number): Schedule {
  const secondsPerWholeNote = (60 / bpm) * 4;
  const notes: ScheduledNote[] = [];
  const cursorTimes: number[] = [];
  const iterator = osmd.cursor.iterator.clone();
  let elapsedWholeNotes = 0;

  while (!iterator.EndReached) {
    const timestamp = elapsedWholeNotes * secondsPerWholeNote;
    cursorTimes.push(timestamp);
    let stepDuration = Infinity;
    for (const voiceEntry of iterator.CurrentVoiceEntries) {
      for (const note of voiceEntry.Notes) {
        stepDuration = Math.min(stepDuration, note.Length.RealValue);
        if (note.isRest()) continue;
        const pitch = note.TransposedPitch ?? note.Pitch;
        if (!pitch) continue;
        const duration = Math.max(note.Length.RealValue * secondsPerWholeNote, 0.05);
        notes.push({ time: timestamp, duration, note: toScientificPitchName(pitch) });
      }
    }
    if (Number.isFinite(stepDuration)) {
      elapsedWholeNotes += stepDuration;
    }
    iterator.moveToNext();
  }
  const totalDuration = cursorTimes.length > 0 ? cursorTimes[cursorTimes.length - 1] + 2 : 0;
  return { notes, cursorTimes, totalDuration };
}

export function usePlayback(osmdRef: React.RefObject<OpenSheetMusicDisplay | null>, bpm: number) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingSampler, setIsLoadingSampler] = useState(false);
  const samplerRef = useRef<Tone.Sampler | null>(null);
  const isPlayingRef = useRef(false);

  const ensureSampler = useCallback(async () => {
    if (samplerRef.current) return samplerRef.current;
    setIsLoadingSampler(true);
    const sampler = await createPianoSampler((err) => {
      console.error("Không tải được piano soundfont, dùng synth dự phòng.", err);
    });
    samplerRef.current = sampler;
    setIsLoadingSampler(false);
    return sampler;
  }, []);

  const stop = useCallback(() => {
    Tone.Transport.stop();
    Tone.Transport.cancel(0);
    isPlayingRef.current = false;
    setIsPlaying(false);
    const osmd = osmdRef.current;
    osmd?.cursor.reset();
    osmd?.cursor.show();
  }, [osmdRef]);

  /** Phát tiếp từ vị trí hiện tại của cursor (không đổi vị trí cursor). */
  const playFromCurrentCursor = useCallback(async () => {
    const osmd = osmdRef.current;
    if (!osmd?.Sheet) return;
    await Tone.start();
    const sampler = await ensureSampler();

    Tone.Transport.stop();
    Tone.Transport.cancel(0);
    Tone.Transport.position = 0;

    const schedule = buildScheduleFromCurrentPosition(osmd, bpm);

    for (const n of schedule.notes) {
      Tone.Transport.schedule((time) => {
        sampler.triggerAttackRelease(n.note, n.duration, time);
      }, n.time);
    }
    // Bước 0 là vị trí bắt đầu (cursor đã ở đó sẵn), chỉ cần lên lịch các bước tiếp theo.
    for (let i = 1; i < schedule.cursorTimes.length; i++) {
      Tone.Transport.schedule(() => {
        osmd.cursor.next();
      }, schedule.cursorTimes[i]);
    }
    Tone.Transport.schedule(() => {
      stop();
    }, schedule.totalDuration);

    osmd.cursor.show();
    Tone.Transport.start();
    isPlayingRef.current = true;
    setIsPlaying(true);
  }, [osmdRef, bpm, ensureSampler, stop]);

  const play = useCallback(() => {
    void playFromCurrentCursor();
  }, [playFromCurrentCursor]);

  const pause = useCallback(() => {
    Tone.Transport.pause();
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  /** Bấm vào 1 nốt: chuyển cursor tới đó; nếu đang phát thì tiếp tục phát luôn từ vị trí mới. */
  const seekTo = useCallback(
    (timestampRealValue: number) => {
      const osmd = osmdRef.current;
      if (!osmd?.Sheet) return;
      const wasPlaying = isPlayingRef.current;
      Tone.Transport.stop();
      Tone.Transport.cancel(0);
      moveCursorToTimestamp(osmd, timestampRealValue);
      if (wasPlaying) {
        void playFromCurrentCursor();
      }
    },
    [osmdRef, playFromCurrentCursor],
  );

  useEffect(() => {
    return () => {
      Tone.Transport.stop();
      Tone.Transport.cancel(0);
      samplerRef.current?.dispose();
    };
  }, []);

  return { isPlaying, isLoadingSampler, play, pause, stop, seekTo };
}
