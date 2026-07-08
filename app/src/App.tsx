import { useCallback, useEffect, useRef, useState } from "react";
import { useOsmd } from "./hooks/useOsmd";
import { usePlayback } from "./hooks/usePlayback";
import { usePracticeMode } from "./hooks/usePracticeMode";
import { FileDropzone } from "./components/FileDropzone";
import { PlayerControls } from "./components/PlayerControls";
import { ScoreViewer } from "./components/ScoreViewer";
import "./index.css";

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bpm, setBpm] = useState(100);

  // usePlayback/usePracticeMode cần osmdRef (do useOsmd tạo ra), nhưng useOsmd cần 1 callback để
  // báo khi người dùng bấm vào 1 nốt, và callback đó lại cần gọi seekTo/resetForManualSeek của 2
  // hook kia -> dùng ref trung gian để phá vòng phụ thuộc mà không phải gộp các hook làm một.
  const seekToRef = useRef<(timestampRealValue: number) => void>(() => {});
  const resetForManualSeekRef = useRef<() => void>(() => {});
  const handleNoteClick = useCallback((timestampRealValue: number) => {
    // Bấm vào 1 nốt để cursor nhảy tới đó vẫn phải hoạt động bình thường dù đang ở Practice Mode
    // hay không - nếu đang có lần đánh MIDI dở dang / feedback cũ đang hiện, phải hủy trước khi
    // cursor nhảy vị trí, tránh so khớp nhầm nốt cũ với vị trí mới.
    resetForManualSeekRef.current();
    seekToRef.current(timestampRealValue);
  }, []);

  const {
    osmdRef,
    isLoading,
    error,
    hasScore,
    hasChords,
    semitones,
    maxTranspose,
    currentKeyLabel,
    fileName,
    showChordSymbols,
    setShowChordSymbols,
    showNoteNames,
    setShowNoteNames,
    loadFile,
    transpose,
    reset,
  } = useOsmd(containerRef, handleNoteClick);

  const { isPlaying, isLoadingSampler, play, pause, seekTo } = usePlayback(osmdRef, bpm);

  useEffect(() => {
    seekToRef.current = seekTo;
  }, [seekTo]);

  const [practiceModeEnabled, setPracticeModeEnabled] = useState(false);
  const { midiStatus, midiError, connectMidi, resetForManualSeek, playMidiAudio, setPlayMidiAudio } = usePracticeMode({
    osmdRef,
    containerRef,
    enabled: practiceModeEnabled,
  });

  useEffect(() => {
    resetForManualSeekRef.current = resetForManualSeek;
  }, [resetForManualSeek]);

  const handleFileSelected = useCallback(
    (file: File) => {
      pause();
      void loadFile(file);
    },
    [loadFile, pause],
  );

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      void play();
    }
  }, [isPlaying, pause, play]);

  const handlePracticeModeChange = useCallback(
    (value: boolean) => {
      setPracticeModeEnabled(value);
      if (value) pause(); // Practice Mode dùng đàn MIDI làm nguồn nhịp, không phát tự động nữa.
    },
    [pause],
  );

  const handleOpenNewFile = useCallback(() => {
    pause();
    setPracticeModeEnabled(false);
    reset();
  }, [pause, reset]);

  return (
    <div className="app">
      {hasScore && (
        <PlayerControls
          isPlaying={isPlaying}
          isLoadingSampler={isLoadingSampler}
          onPlayPause={handlePlayPause}
          bpm={bpm}
          onBpmChange={setBpm}
          semitones={semitones}
          maxTranspose={maxTranspose}
          onTransposeChange={transpose}
          currentKeyLabel={currentKeyLabel}
          hasChords={hasChords}
          showChordSymbols={showChordSymbols}
          onShowChordSymbolsChange={setShowChordSymbols}
          showNoteNames={showNoteNames}
          onShowNoteNamesChange={setShowNoteNames}
          practiceModeEnabled={practiceModeEnabled}
          onPracticeModeChange={handlePracticeModeChange}
          midiStatus={midiStatus}
          midiError={midiError}
          onConnectMidi={connectMidi}
          playMidiAudio={playMidiAudio}
          onPlayMidiAudioChange={setPlayMidiAudio}
          onOpenNewFile={handleOpenNewFile}
          disabled={!hasScore}
        />
      )}

      <main className="app__main">
        {!hasScore && <FileDropzone onFileSelected={handleFileSelected} />}

        {error && !hasScore && <div className="app__error">{error}</div>}

        {hasScore && (
          <div className="app__meta">
            <span>{fileName}</span>
          </div>
        )}

        <ScoreViewer containerRef={containerRef} isLoading={isLoading} error={hasScore ? error : null} />
      </main>
    </div>
  );
}

export default App;
