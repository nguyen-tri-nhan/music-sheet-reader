import type { MidiConnectionStatus } from "../hooks/useMidiInput";

interface PracticeModeControlsProps {
  enabled: boolean;
  onToggle: (value: boolean) => void;
  midiStatus: MidiConnectionStatus;
  midiError: string | null;
  onConnectMidi: () => void;
  playMidiAudio: boolean;
  onPlayMidiAudioChange: (value: boolean) => void;
  disabled: boolean;
}

const STATUS_LABEL: Record<MidiConnectionStatus, string> = {
  unsupported: "Trình duyệt không hỗ trợ Web MIDI (dùng Chrome/Edge)",
  idle: "Chưa kết nối đàn MIDI",
  requesting: "Đang xin quyền truy cập MIDI…",
  connected: "Đã kết nối đàn MIDI",
  denied: "Không xin được quyền truy cập MIDI",
  error: "Lỗi kết nối MIDI",
};

export function PracticeModeControls({
  enabled,
  onToggle,
  midiStatus,
  midiError,
  onConnectMidi,
  playMidiAudio,
  onPlayMidiAudioChange,
  disabled,
}: PracticeModeControlsProps) {
  return (
    <div className="practice-controls">
      <label className="player-controls__toggle">
        <input type="checkbox" checked={enabled} disabled={disabled} onChange={(e) => onToggle(e.target.checked)} />
        Practice Mode (đàn MIDI)
      </label>

      {enabled && (
        <div className="practice-controls__status">
          <span className={`practice-controls__badge practice-controls__badge--${midiStatus}`}>
            {STATUS_LABEL[midiStatus]}
          </span>
          {midiStatus !== "unsupported" && midiStatus !== "connected" && (
            <button onClick={onConnectMidi} disabled={midiStatus === "requesting"}>
              Kết nối đàn MIDI
            </button>
          )}
          {midiError && <span className="practice-controls__error">{midiError}</span>}

          <label className="player-controls__toggle" title="Phát âm thanh qua loa máy tính khi bấm phím đàn MIDI - hữu ích nếu đàn không có loa riêng">
            <input
              type="checkbox"
              checked={playMidiAudio}
              onChange={(e) => onPlayMidiAudioChange(e.target.checked)}
            />
            Phát âm thanh qua máy tính
          </label>
        </div>
      )}
    </div>
  );
}
