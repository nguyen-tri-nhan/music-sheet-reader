import type { MidiConnectionStatus } from "../hooks/useMidiInput";
import type { PracticeHand } from "../hooks/usePracticeMode";
import { PracticeModeControls } from "./PracticeModeControls";
import { DropdownMenu } from "./DropdownMenu";

interface PlayerControlsProps {
  isPlaying: boolean;
  isLoadingSampler: boolean;
  onPlayPause: () => void;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  semitones: number;
  maxTranspose: number;
  onTransposeChange: (semitones: number) => void;
  currentKeyLabel: string | null;
  hasChords: boolean;
  showChordSymbols: boolean;
  onShowChordSymbolsChange: (value: boolean) => void;
  showNoteNames: boolean;
  onShowNoteNamesChange: (value: boolean) => void;
  practiceModeEnabled: boolean;
  onPracticeModeChange: (value: boolean) => void;
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
  showVirtualKeyboard: boolean;
  onShowVirtualKeyboardChange: (value: boolean) => void;
  showNoteHints: boolean;
  onShowNoteHintsChange: (value: boolean) => void;
  onOpenNewFile: () => void;
  disabled: boolean;
}

const MIN_BPM = 20;
const MAX_BPM = 260;

export function PlayerControls({
  isPlaying,
  isLoadingSampler,
  onPlayPause,
  bpm,
  onBpmChange,
  semitones,
  maxTranspose,
  onTransposeChange,
  currentKeyLabel,
  hasChords,
  showChordSymbols,
  onShowChordSymbolsChange,
  showNoteNames,
  onShowNoteNamesChange,
  practiceModeEnabled,
  onPracticeModeChange,
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
  showVirtualKeyboard,
  onShowVirtualKeyboardChange,
  showNoteHints,
  onShowNoteHintsChange,
  onOpenNewFile,
  disabled,
}: PlayerControlsProps) {
  const clampBpm = (value: number) => Math.max(MIN_BPM, Math.min(MAX_BPM, value));
  // Practice Mode dùng đàn MIDI làm nguồn nhịp - tắt hẳn Play/BPM tự động (Tone.Transport)
  // trong lúc bật, tránh 2 nguồn điều khiển cursor giẫm lên nhau.
  const playbackDisabled = disabled || practiceModeEnabled;

  return (
    <div className="player-controls">
      <button
        className="player-controls__play"
        onClick={onPlayPause}
        disabled={playbackDisabled || isLoadingSampler}
        title={isPlaying ? "Tạm dừng" : "Phát"}
      >
        {isLoadingSampler ? "…" : isPlaying ? "❚❚" : "▶"}
      </button>

      <div className="player-controls__group">
        <span className="player-controls__label">Transpose</span>
        <button disabled={disabled || semitones <= -maxTranspose} onClick={() => onTransposeChange(semitones - 2)}>
          −1 cung
        </button>
        <button disabled={disabled || semitones <= -maxTranspose} onClick={() => onTransposeChange(semitones - 1)}>
          −½ cung
        </button>
        <span className="player-controls__value">
          {semitones > 0 ? `+${semitones}` : semitones} {currentKeyLabel ? `(${currentKeyLabel})` : ""}
        </span>
        <button disabled={disabled || semitones >= maxTranspose} onClick={() => onTransposeChange(semitones + 1)}>
          +½ cung
        </button>
        <button disabled={disabled || semitones >= maxTranspose} onClick={() => onTransposeChange(semitones + 2)}>
          +1 cung
        </button>
      </div>

      <div className="player-controls__group">
        <span className="player-controls__label">BPM</span>
        <button disabled={playbackDisabled} onClick={() => onBpmChange(clampBpm(bpm - 5))}>
          −
        </button>
        <input
          className="player-controls__bpm-input"
          type="number"
          min={MIN_BPM}
          max={MAX_BPM}
          value={bpm}
          disabled={playbackDisabled}
          onChange={(e) => onBpmChange(clampBpm(Number(e.target.value) || bpm))}
        />
        <button disabled={playbackDisabled} onClick={() => onBpmChange(clampBpm(bpm + 5))}>
          +
        </button>
      </div>

      <DropdownMenu label="Hiển thị" disabled={disabled}>
        {hasChords && (
          <label className="player-controls__toggle">
            <input
              type="checkbox"
              checked={showChordSymbols}
              disabled={disabled}
              onChange={(e) => onShowChordSymbolsChange(e.target.checked)}
            />
            Hiện hợp âm
          </label>
        )}

        <label className="player-controls__toggle">
          <input
            type="checkbox"
            checked={showNoteNames}
            disabled={disabled}
            onChange={(e) => onShowNoteNamesChange(e.target.checked)}
          />
          Hiện tên nốt
        </label>

        <label className="player-controls__toggle">
          <input
            type="checkbox"
            checked={showVirtualKeyboard}
            disabled={disabled}
            onChange={(e) => onShowVirtualKeyboardChange(e.target.checked)}
          />
          Hiện bàn phím ảo
        </label>

        {showVirtualKeyboard && (
          <label
            className="player-controls__toggle"
            title="Tắt để tự luyện không cần gợi ý - bàn phím ảo vẫn hiện nốt bạn vừa đánh đúng/sai, chỉ không tô sáng trước nốt cần đánh nữa"
          >
            <input
              type="checkbox"
              checked={showNoteHints}
              disabled={disabled}
              onChange={(e) => onShowNoteHintsChange(e.target.checked)}
            />
            Gợi ý nốt cần đánh
          </label>
        )}
      </DropdownMenu>

      <PracticeModeControls
        enabled={practiceModeEnabled}
        onToggle={onPracticeModeChange}
        midiStatus={midiStatus}
        midiError={midiError}
        onConnectMidi={onConnectMidi}
        playMidiAudio={playMidiAudio}
        onPlayMidiAudioChange={onPlayMidiAudioChange}
        practiceHand={practiceHand}
        onPracticeHandChange={onPracticeHandChange}
        canSelectHand={canSelectHand}
        strictMode={strictMode}
        onStrictModeChange={onStrictModeChange}
        disabled={disabled}
      />

      <button className="player-controls__new-file" onClick={onOpenNewFile}>
        Đổi file khác
      </button>
    </div>
  );
}
