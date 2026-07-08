import { useCallback, useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { toScientificPitchName } from "../lib/pitchName";
import { moveCursorToTimestamp } from "../lib/cursorNavigation";

const SALAMANDER_BASE_URL = "https://tonejs.github.io/audio/salamander/";
const SALAMANDER_URLS: Record<string, string> = {
  A0: "A0.mp3", C1: "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3", A1: "A1.mp3",
  C2: "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3", A2: "A2.mp3",
  C3: "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3", A3: "A3.mp3",
  C4: "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3", A4: "A4.mp3",
  C5: "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3", A5: "A5.mp3",
  C6: "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3", A6: "A6.mp3",
  C7: "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3", A7: "A7.mp3", C8: "C8.mp3",
};

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
 * chỉ nên di chuyển đúng theo nhịp độ thật của nhạc (qua các lệnh Tone.Transport.schedule bên dưới). */
function buildScheduleFromCurrentPosition(osmd: OpenSheetMusicDisplay, bpm: number): Schedule {
  const secondsPerWholeNote = (60 / bpm) * 4;
  const notes: ScheduledNote[] = [];
  const cursorTimes: number[] = [];
  const iterator = osmd.cursor.iterator.clone();
  const startTimestamp = iterator.currentTimeStamp.RealValue;

  while (!iterator.EndReached) {
    const timestamp = (iterator.currentTimeStamp.RealValue - startTimestamp) * secondsPerWholeNote;
    cursorTimes.push(timestamp);
    for (const voiceEntry of iterator.CurrentVoiceEntries) {
      for (const note of voiceEntry.Notes) {
        if (note.isRest()) continue;
        const pitch = note.TransposedPitch ?? note.Pitch;
        if (!pitch) continue;
        const duration = Math.max(note.Length.RealValue * secondsPerWholeNote, 0.05);
        notes.push({ time: timestamp, duration, note: toScientificPitchName(pitch) });
      }
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
    const sampler = await new Promise<Tone.Sampler>((resolve) => {
      const s = new Tone.Sampler({
        urls: SALAMANDER_URLS,
        baseUrl: SALAMANDER_BASE_URL,
        release: 1,
        onload: () => resolve(s),
        onerror: (err) => {
          console.error("Không tải được piano soundfont, dùng synth dự phòng.", err);
          resolve(s);
        },
      }).toDestination();
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
