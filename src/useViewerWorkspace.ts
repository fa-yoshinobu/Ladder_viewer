import { useMemo, useState } from 'preact/hooks';
import { mitsubishiCommentList } from './commentListData';
import type { KeyenceProgram } from './keyence/model';
import { type Program } from './model';
import { type NativeCsvSelection } from './nativeCsv';
import { useFindShortcut } from './useFindShortcut';
import { useMitsubishiNavigation } from './useMitsubishiNavigation';
import { useProgramFiles } from './useProgramFiles';
import { type LadderPalette } from './ViewerToolbar';
import { readSetting, writeSetting } from './settings';
type Theme = 'light' | 'dark';
function initialTheme(): Theme {
  return readSetting('theme');
}
document.documentElement.dataset.theme = initialTheme();
// The ladder palette is remembered separately for light and dark mode.
function savedLadderPalette(theme: Theme): LadderPalette {
  return readSetting(`ladderPalette-${theme}`);
}
document.documentElement.dataset.ladder = savedLadderPalette(
  document.documentElement.dataset.theme as Theme,
);

export function useViewerWorkspace() {
  const [directComparison, setDirectComparison] = useState(false);
  const [initialComparison, setInitialComparison] = useState<NativeCsvSelection['comparison']>();
  const [program, setProgram] = useState<Program | null>(null);
  const [keyenceProgram, setKeyenceProgram] = useState<KeyenceProgram | null>(null);
  const files = useProgramFiles({
    showProgram,
    showKeyenceProgram,
    onComparison: (selection) => {
      setInitialComparison(selection);
      setDirectComparison(true);
    },
  });
  const {
    programs,
    keyencePrograms,
    commentsByProgram,
    busy,
    error,
    progress,
    load,
    openSelection,
    nativeCsv,
  } = files;
  const programNames = useMemo(
    () =>
      [...programs, ...keyencePrograms]
        .map((p) => p.name)
        .sort((a, b) => a.localeCompare(b, 'ja', { numeric: true })),
    [programs, keyencePrograms],
  );
  const deviceComments = useMemo(
    () => commentsByProgram[program?.name ?? ''] ?? {},
    [program, commentsByProgram],
  );
  const commentList = useMemo(
    () => (program ? mitsubishiCommentList(program, deviceComments) : undefined),
    [program, deviceComments],
  );
  const view = useMitsubishiNavigation(program, keyenceProgram, deviceComments);
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme as Theme);
  const [ladderPalette, setLadderPalette] = useState<LadderPalette>(
    () => document.documentElement.dataset.ladder as LadderPalette,
  );
  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    const palette = savedLadderPalette(next);
    document.documentElement.dataset.theme = next;
    document.documentElement.dataset.ladder = palette;
    setTheme(next);
    setLadderPalette(palette);
    writeSetting('theme', next);
  }
  function changeLadderPalette(next: LadderPalette) {
    document.documentElement.dataset.ladder = next;
    setLadderPalette(next);
    writeSetting(`ladderPalette-${theme}`, next);
  }
  function chooseProgram(name: string) {
    const keyence = keyencePrograms.find((p) => p.name === name);
    if (keyence) {
      showKeyenceProgram(keyence);
      return;
    }
    const mitsubishi = programs.find((p) => p.name === name);
    if (mitsubishi) showProgram(mitsubishi);
  }
  useFindShortcut();
  function showProgram(next: Program) {
    setKeyenceProgram(null);
    setProgram(next);
    view.resetProgram(next);
  }
  function showKeyenceProgram(next: KeyenceProgram) {
    setProgram(null);
    setKeyenceProgram(next);
    view.resetKeyence();
  }

  return {
    ...view,
    directComparison,
    initialComparison,
    theme,
    ladderPalette,
    changeLadderPalette,
    toggleTheme,
    setDirectComparison,
    setInitialComparison,
    keyenceProgram,
    program,
    programNames,
    chooseProgram,
    busy,
    progress,
    error,
    openSelection,
    load,
    commentList,
    nativeCsv,
    deviceComments,
  };
}
