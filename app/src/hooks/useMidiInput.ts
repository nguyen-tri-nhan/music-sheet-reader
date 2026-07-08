import { useCallback, useEffect, useRef, useState } from "react";
import { isWebMidiSupported, listInputs, type MidiInputInfo } from "../lib/webMidi";

export type MidiConnectionStatus = "unsupported" | "idle" | "requesting" | "connected" | "denied" | "error";

const CONTROL_CHANGE_STATUS = 0xb0;
const SUSTAIN_PEDAL_CONTROLLER = 64;
/** Theo quy ước MIDI, các controller kiểu on/off (như sustain) coi giá trị >= 64 là "đạp xuống". */
const SUSTAIN_PEDAL_DOWN_THRESHOLD = 64;

interface UseMidiInputOptions {
  onNoteOn?: (noteNumber: number, velocity: number) => void;
  onNoteOff?: (noteNumber: number) => void;
  /** Pedal sustain (Control Change 64) - down=true khi đạp xuống, false khi nhả ra. */
  onSustainPedal?: (down: boolean) => void;
}

/** Kết nối đàn MIDI thật qua USB (Web MIDI API). Chỉ nhắm tới đàn phím vật lý class-compliant -
 * không phân biệt/hỗ trợ riêng virtual MIDI port (theo phạm vi đã chốt trong specs/keyboard.md). */
export function useMidiInput({ onNoteOn, onNoteOff, onSustainPedal }: UseMidiInputOptions): {
  status: MidiConnectionStatus;
  inputs: MidiInputInfo[];
  error: string | null;
  connect: () => Promise<void>;
} {
  const [status, setStatus] = useState<MidiConnectionStatus>(() => (isWebMidiSupported() ? "idle" : "unsupported"));
  const [inputs, setInputs] = useState<MidiInputInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const accessRef = useRef<MIDIAccess | null>(null);

  const onNoteOnRef = useRef(onNoteOn);
  const onNoteOffRef = useRef(onNoteOff);
  const onSustainPedalRef = useRef(onSustainPedal);
  useEffect(() => {
    onNoteOnRef.current = onNoteOn;
  }, [onNoteOn]);
  useEffect(() => {
    onNoteOffRef.current = onNoteOff;
  }, [onNoteOff]);
  useEffect(() => {
    onSustainPedalRef.current = onSustainPedal;
  }, [onSustainPedal]);

  const attachListeners = useCallback((access: MIDIAccess) => {
    for (const input of access.inputs.values()) {
      input.onmidimessage = (event: MIDIMessageEvent) => {
        const data = event.data;
        if (!data || data.length < 2) return;
        const command = data[0] & 0xf0;
        if (command === CONTROL_CHANGE_STATUS && data[1] === SUSTAIN_PEDAL_CONTROLLER) {
          onSustainPedalRef.current?.((data[2] ?? 0) >= SUSTAIN_PEDAL_DOWN_THRESHOLD);
          return;
        }
        const noteNumber = data[1];
        const velocity = data[2] ?? 0;
        if (command === 0x90 && velocity > 0) {
          onNoteOnRef.current?.(noteNumber, velocity);
        } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
          onNoteOffRef.current?.(noteNumber);
        }
        // Các message khác (pitch bend, aftertouch...) bị bỏ qua có chủ đích.
      };
    }
    setInputs(listInputs(access));
  }, []);

  const connect = useCallback(async () => {
    if (!isWebMidiSupported()) {
      setStatus("unsupported");
      return;
    }
    setStatus("requesting");
    setError(null);
    try {
      const access = await navigator.requestMIDIAccess();
      accessRef.current = access;
      attachListeners(access);
      access.onstatechange = () => attachListeners(access);
      setStatus("connected");
    } catch (e) {
      setStatus("denied");
      setError(e instanceof Error ? e.message : "Không xin được quyền truy cập MIDI.");
    }
  }, [attachListeners]);

  useEffect(() => {
    return () => {
      const access = accessRef.current;
      if (!access) return;
      access.onstatechange = null;
      for (const input of access.inputs.values()) {
        input.onmidimessage = null;
      }
    };
  }, []);

  return { status, inputs, error, connect };
}
