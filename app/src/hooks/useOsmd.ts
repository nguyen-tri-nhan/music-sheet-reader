import { useCallback, useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay, TransposeCalculator } from "opensheetmusicdisplay";
import { prepareScoreXml, type ChordSource } from "../lib/chordDetector";
import { parseInitialKey, describeTransposedKey, type KeyInfo } from "../lib/keySignature";
import { renderNoteNameLabels, clearNoteNameLabels } from "../lib/noteNameLabels";
import { attachNoteClickHandlers } from "../lib/noteInteraction";
import { detectStaffRoles, type StaffRoles } from "../lib/staffRoles";

const MAX_TRANSPOSE_SEMITONES = 12;

export function useOsmd(containerRef: React.RefObject<HTMLDivElement | null>, onNoteClick?: (timestampRealValue: number) => void) {
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasScore, setHasScore] = useState(false);
  const [chordSource, setChordSource] = useState<ChordSource | null>(null);
  const [semitones, setSemitones] = useState(0);
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [showChordSymbols, setShowChordSymbolsState] = useState(true);
  const [showNoteNames, setShowNoteNamesState] = useState(false);
  const [staffRoles, setStaffRoles] = useState<StaffRoles | null>(null);

  const onNoteClickRef = useRef(onNoteClick);
  useEffect(() => {
    onNoteClickRef.current = onNoteClick;
  }, [onNoteClick]);

  useEffect(() => {
    if (!containerRef.current || osmdRef.current) return;
    const osmd = new OpenSheetMusicDisplay(containerRef.current, {
      autoResize: true,
      backend: "svg",
      drawTitle: true,
      drawComposer: true,
      drawPartNames: false,
      drawMeasureNumbers: false,
      followCursor: true,
    });
    osmd.TransposeCalculator = new TransposeCalculator();
    osmdRef.current = osmd;
  }, [containerRef]);

  /** Phải gọi lại sau MỌI lần osmd.render() (load, transpose, đổi option hợp âm...) vì render()
   * vẽ lại toàn bộ SVG, xóa sạch overlay tên nốt và các click-listener đã gắn trước đó. */
  const refreshInteractionLayer = useCallback(
    (noteNamesEnabled: boolean) => {
      const osmd = osmdRef.current;
      const container = containerRef.current;
      if (!osmd || !container) return;
      if (noteNamesEnabled) {
        renderNoteNameLabels(osmd, container);
      } else {
        clearNoteNameLabels(container);
      }
      attachNoteClickHandlers(osmd, (timestamp) => onNoteClickRef.current?.(timestamp));
    },
    [containerRef],
  );

  const loadFile = useCallback(
    async (file: File) => {
      const osmd = osmdRef.current;
      if (!osmd) return;
      setIsLoading(true);
      setError(null);
      try {
        const prepared = await prepareScoreXml(file);
        await osmd.load(prepared.xml);
        osmd.Sheet.Transpose = 0;
        osmd.EngravingRules.RenderChordSymbols = showChordSymbols;
        osmd.render();
        osmd.cursor.reset();
        osmd.cursor.show();
        refreshInteractionLayer(showNoteNames);
        setKeyInfo(parseInitialKey(prepared.xml));
        setStaffRoles(detectStaffRoles(prepared.xml));
        setSemitones(0);
        setChordSource(prepared.chordSource);
        setFileName(file.name);
        setHasScore(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không đọc được file.");
        setHasScore(false);
      } finally {
        setIsLoading(false);
      }
    },
    [showChordSymbols, showNoteNames, refreshInteractionLayer],
  );

  const transpose = useCallback(
    (newSemitones: number) => {
      const osmd = osmdRef.current;
      if (!osmd?.Sheet) return;
      const clamped = Math.max(-MAX_TRANSPOSE_SEMITONES, Math.min(MAX_TRANSPOSE_SEMITONES, newSemitones));
      osmd.Sheet.Transpose = clamped;
      osmd.updateGraphic();
      osmd.render();
      osmd.cursor.show();
      refreshInteractionLayer(showNoteNames);
      setSemitones(clamped);
    },
    [showNoteNames, refreshInteractionLayer],
  );

  const setShowChordSymbols = useCallback(
    (value: boolean) => {
      setShowChordSymbolsState(value);
      const osmd = osmdRef.current;
      if (!osmd?.Sheet) return;
      osmd.EngravingRules.RenderChordSymbols = value;
      osmd.updateGraphic();
      osmd.render();
      osmd.cursor.show();
      refreshInteractionLayer(showNoteNames);
    },
    [showNoteNames, refreshInteractionLayer],
  );

  const setShowNoteNames = useCallback((value: boolean) => {
    setShowNoteNamesState(value);
    const osmd = osmdRef.current;
    const container = containerRef.current;
    if (!osmd || !container) return;
    if (value) {
      renderNoteNameLabels(osmd, container);
    } else {
      clearNoteNameLabels(container);
    }
  }, [containerRef]);

  const reset = useCallback(() => {
    setHasScore(false);
    setError(null);
  }, []);

  const currentKeyLabel = keyInfo ? describeTransposedKey(keyInfo, semitones) : null;
  const hasChords = chordSource === "existing" || chordSource === "detected";

  return {
    osmdRef,
    isLoading,
    error,
    hasScore,
    chordSource,
    hasChords,
    semitones,
    maxTranspose: MAX_TRANSPOSE_SEMITONES,
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
  };
}
