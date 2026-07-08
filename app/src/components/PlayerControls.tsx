import type { MidiConnectionStatus } from "../hooks/useMidiInput";
import { PracticeModeControls } from "./PracticeModeControls";

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

      <PracticeModeControls
        enabled={practiceModeEnabled}
        onToggle={onPracticeModeChange}
        midiStatus={midiStatus}
        midiError={midiError}
        onConnectMidi={onConnectMidi}
        playMidiAudio={playMidiAudio}
        onPlayMidiAudioChange={onPlayMidiAudioChange}
        disabled={disabled}
      />

      <button className="player-controls__new-file" onClick={onOpenNewFile}>
        Đổi file khác
      </button>
    </div>
  );
}
