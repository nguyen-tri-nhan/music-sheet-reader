import type { MidiConnectionStatus } from "../hooks/useMidiInput";
import type { PracticeHand } from "../hooks/usePracticeMode";
import { DropdownMenu } from "./DropdownMenu";

interface PracticeModeControlsProps {
  enabled: boolean;
  onToggle: (value: boolean) => void;
  midiStatus: MidiConnectionStatus;
  midiError: string | null;
  onConnectMidi: () => void;
  playMidiAudio: boolean;
  onPlayMidiAudioChange: (value: boolean) => void;
  practiceHand: PracticeHand;
  onPracticeHandChange: (value: PracticeHand) => void;
  canSelectHand: boolean;
  strictMode: boolean;
  onStrictModeChange: (value: boolean) => void;
  disabled: boolean;
}

const STATUS_TOOLTIP: Record<MidiConnectionStatus, string> = {
  unsupported: "Trình duyệt không hỗ trợ Web MIDI (dùng Chrome/Edge)",
  idle: "Chưa kết nối đàn MIDI",
  requesting: "Đang xin quyền truy cập MIDI…",
  connected: "Đã kết nối đàn MIDI",
  denied: "Không xin được quyền truy cập MIDI",
  error: "Lỗi kết nối MIDI",
};

const HAND_OPTIONS: { value: PracticeHand; label: string }[] = [
  { value: "both", label: "Cả 2 tay" },
  { value: "left", label: "Tay trái" },
  { value: "right", label: "Tay phải" },
];

export function PracticeModeControls({
  enabled,
  onToggle,
  midiStatus,
  midiError,
  onConnectMidi,
  playMidiAudio,
  onPlayMidiAudioChange,
  practiceHand,
  onPracticeHandChange,
  canSelectHand,
  strictMode,
  onStrictModeChange,
  disabled,
}: PracticeModeControlsProps) {
  const isConnected = midiStatus === "connected";

  return (
    <div className="practice-controls">
      <label className="player-controls__toggle">
        <input type="checkbox" checked={enabled} disabled={disabled} onChange={(e) => onToggle(e.target.checked)} />
        Practice Mode (đàn MIDI)
      </label>

      {enabled && (
        <div className="practice-controls__status">
          <span
            className={`practice-controls__dot practice-controls__dot--${isConnected ? "on" : "off"}`}
            title={midiError ?? STATUS_TOOLTIP[midiStatus]}
          />
          {!isConnected && midiStatus !== "unsupported" && (
            <button onClick={onConnectMidi} disabled={midiStatus === "requesting"}>
              Kết nối đàn MIDI
            </button>
          )}

          <DropdownMenu label="Cài đặt luyện tập">
            <label
              className="player-controls__toggle"
              title="Phát âm thanh qua loa máy tính khi bấm phím đàn MIDI - hữu ích nếu đàn không có loa riêng"
            >
              <input type="checkbox" checked={playMidiAudio} onChange={(e) => onPlayMidiAudioChange(e.target.checked)} />
              Phát âm thanh qua máy tính
            </label>

            {canSelectHand && (
              <label className="player-controls__toggle" title="Chọn tay luyện tập">
                <span className="player-controls__label">Tay luyện tập</span>
                <select
                  className="practice-controls__hand-select"
                  aria-label="Chọn tay luyện tập"
                  value={practiceHand}
                  onChange={(e) => onPracticeHandChange(e.target.value as PracticeHand)}
                >
                  {HAND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label
              className="player-controls__toggle"
              title="Đánh sai phải chơi lại từ đầu ô nhịp hiện tại, không chỉ sửa nốt vừa sai"
            >
              <input type="checkbox" checked={strictMode} onChange={(e) => onStrictModeChange(e.target.checked)} />
              Chế độ khó
            </label>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
