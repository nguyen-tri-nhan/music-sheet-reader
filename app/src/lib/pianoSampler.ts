import * as Tone from "tone";

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

/** Tạo 1 Tone.Sampler piano (Salamander soundfont) dùng chung cho cả phát nhạc tự động
 * (usePlayback) lẫn phát âm thanh khi bấm phím đàn MIDI (usePracticeMode). */
export function createPianoSampler(onLoadError?: (err: unknown) => void): Promise<Tone.Sampler> {
  return new Promise((resolve) => {
    const sampler = new Tone.Sampler({
      urls: SALAMANDER_URLS,
      baseUrl: SALAMANDER_BASE_URL,
      release: 1,
      onload: () => resolve(sampler),
      onerror: (err) => {
        onLoadError?.(err);
        resolve(sampler);
      },
    }).toDestination();
  });
}
