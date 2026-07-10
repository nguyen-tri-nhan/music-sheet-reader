import { useCallback, useEffect, useRef, useState } from "react";
import { useOsmd } from "./hooks/useOsmd";
import { usePlayback } from "./hooks/usePlayback";
import { usePracticeMode } from "./hooks/usePracticeMode";
import { useCursorHighlightedNotes } from "./hooks/useCursorHighlightedNotes";
import { FileDropzone } from "./components/FileDropzone";
import { PlayerControls } from "./components/PlayerControls";
import { ScoreViewer } from "./components/ScoreViewer";
import { VirtualPianoKeyboard } from "./components/VirtualPianoKeyboard";
import { FULL_PIANO_RANGE } from "./lib/pitchToMidi";
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
    staffRoles,
    loadFile,
    transpose,
    reset,
  } = useOsmd(containerRef, handleNoteClick);

  const { isPlaying, isLoadingSampler, play, pause, seekTo } = usePlayback(osmdRef, bpm);
  const [showVirtualKeyboard, setShowVirtualKeyboard] = useState(true);
  // Tắt để tự luyện không cần gợi ý - sau khi đã quen tay, user có thể muốn tự nhớ nốt tiếp theo
  // thay vì được tô sáng sẵn. Chỉ ẩn phần TÔ SÁNG TRƯỚC (expected/next), không ảnh hưởng tới việc
  // hiện nốt vừa đánh đúng/sai (playedKeyStates, độc lập với state này).
  const [showNoteHints, setShowNoteHints] = useState(true);
  const highlightedNotesRaw = useCursorHighlightedNotes(osmdRef, staffRoles);
  const highlightedNotes = showNoteHints ? highlightedNotesRaw : [];

  useEffect(() => {
    seekToRef.current = seekTo;
  }, [seekTo]);

  const [practiceModeEnabled, setPracticeModeEnabled] = useState(false);
  const {
    midiStatus,
    midiError,
    connectMidi,
    resetForManualSeek,
    playMidiAudio,
    setPlayMidiAudio,
    practiceHand,
    setPracticeHand,
    playedKeyStates,
    strictMode,
    setStrictMode,
  } = usePracticeMode({
    osmdRef,
    containerRef,
    enabled: practiceModeEnabled,
    staffRoles,
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

  /** Transpose không "hot swap" được như tempo: đổi tempo chỉ là đổi tốc độ 1 tín hiệu định thời
   * (Tone.Transport.bpm), nốt/cursor đã lên lịch tự retime theo - nhưng transpose đổi HẲN cao độ
   * thực sự phát ra (đã bake cứng vào lịch phát dưới dạng tên nốt cụ thể) VÀ vẽ lại toàn bộ khuông
   * nhạc (key signature, dấu hóa) - không thể chỉ chỉnh 1 tham số của lịch đang chạy. Thay vào đó,
   * tự động pause -> transpose -> play lại từ đúng vị trí cursor hiện tại (vị trí không đổi qua
   * transpose), để người dùng không phải tự bấm play lại - cảm giác liền mạch dù có 1 khoảng lặng
   * ngắn không tránh khỏi lúc build lại lịch phát. */
  const handleTransposeChange = useCallback(
    (newSemitones: number) => {
      const wasPlaying = isPlaying;
      if (wasPlaying) pause();
      transpose(newSemitones);
      if (wasPlaying) void play();
    },
    [isPlaying, pause, transpose, play],
  );

  const handleArrowSeek = useCallback(
    (direction: 1 | -1) => {
      const osmd = osmdRef.current;
      if (!osmd?.Sheet) return;
      if (direction === 1) {
        osmd.cursor.next();
      } else {
        osmd.cursor.previous();
      }
      handleNoteClick(osmd.cursor.iterator.currentTimeStamp.RealValue);
    },
    [osmdRef, handleNoteClick],
  );

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

  // Phím tắt: Space = play/pause, ←/→ = seek tới nốt trước/sau tại cursor. Bỏ qua khi đang gõ vào 1
  // input/select (vd ô BPM) để không phá thao tác gõ số bình thường của user.
  useEffect(() => {
    if (!hasScore) return;

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      if (event.code === "Space") {
        event.preventDefault();
        if (!practiceModeEnabled) handlePlayPause();
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        handleArrowSeek(-1);
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        handleArrowSeek(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasScore, practiceModeEnabled, handlePlayPause, handleArrowSeek]);

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
          onTransposeChange={handleTransposeChange}
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
          practiceHand={practiceHand}
          onPracticeHandChange={setPracticeHand}
          strictMode={strictMode}
          onStrictModeChange={setStrictMode}
          canSelectHand={!!staffRoles && !staffRoles.singleStaff}
          showVirtualKeyboard={showVirtualKeyboard}
          onShowVirtualKeyboardChange={setShowVirtualKeyboard}
          showNoteHints={showNoteHints}
          onShowNoteHintsChange={setShowNoteHints}
          onOpenNewFile={handleOpenNewFile}
          disabled={!hasScore}
        />
      )}

      <main className={`app__main${hasScore && showVirtualKeyboard ? " app__main--with-keyboard" : ""}`}>
        {!hasScore && <FileDropzone onFileSelected={handleFileSelected} />}

        {error && !hasScore && <div className="app__error">{error}</div>}

        {hasScore && (
          <div className="app__meta">
            <span>{fileName}</span>
          </div>
        )}

        <ScoreViewer containerRef={containerRef} isLoading={isLoading} error={hasScore ? error : null} />
      </main>

      {hasScore && showVirtualKeyboard && (
        <VirtualPianoKeyboard
          minMidiNote={FULL_PIANO_RANGE.minMidiNote}
          maxMidiNote={FULL_PIANO_RANGE.maxMidiNote}
          highlightedNotes={highlightedNotes}
          playedKeyStates={playedKeyStates}
        />
      )}
    </div>
  );
}

export default App;
