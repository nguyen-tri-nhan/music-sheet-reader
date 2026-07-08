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
  onOpenNewFile,
  disabled,
}: PlayerControlsProps) {
  const clampBpm = (value: number) => Math.max(MIN_BPM, Math.min(MAX_BPM, value));

  return (
    <div className="player-controls">
      <button
        className="player-controls__play"
        onClick={onPlayPause}
        disabled={disabled || isLoadingSampler}
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
        <button disabled={disabled} onClick={() => onBpmChange(clampBpm(bpm - 5))}>
          −
        </button>
        <input
          className="player-controls__bpm-input"
          type="number"
          min={MIN_BPM}
          max={MAX_BPM}
          value={bpm}
          disabled={disabled}
          onChange={(e) => onBpmChange(clampBpm(Number(e.target.value) || bpm))}
        />
        <button disabled={disabled} onClick={() => onBpmChange(clampBpm(bpm + 5))}>
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

      <button className="player-controls__new-file" onClick={onOpenNewFile}>
        Đổi file khác
      </button>
    </div>
  );
}
