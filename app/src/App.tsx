import { useCallback, useEffect, useRef, useState } from "react";
import { useOsmd } from "./hooks/useOsmd";
import { usePlayback } from "./hooks/usePlayback";
import { FileDropzone } from "./components/FileDropzone";
import { PlayerControls } from "./components/PlayerControls";
import { ScoreViewer } from "./components/ScoreViewer";
import "./index.css";

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bpm, setBpm] = useState(100);

  // usePlayback cần osmdRef (do useOsmd tạo ra), nhưng useOsmd cần 1 callback để báo khi
  // người dùng bấm vào 1 nốt, và callback đó gọi seekTo của usePlayback -> dùng 1 ref trung
  // gian để phá vòng phụ thuộc giữa 2 hook mà không phải gộp chúng làm một.
  const seekToRef = useRef<(timestampRealValue: number) => void>(() => {});
  const handleNoteClick = useCallback((timestampRealValue: number) => {
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

  const handleOpenNewFile = useCallback(() => {
    pause();
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
