import { render } from 'preact';
import 'preact/compat';
import { DirectComparisonWorkspace } from './DirectComparisonWorkspace';
import { MitsubishiWorkspace } from './MitsubishiWorkspace';
import type { LadderPalette } from './ViewerToolbar';
import { KeyenceViewer } from './keyence/Viewer';
import './style.css';
import { useViewerWorkspace } from './useViewerWorkspace';
function App() {
  const workspace = useViewerWorkspace();
  const {
    directComparison,
    initialComparison,
    theme,
    ladderPalette,
    changeLadderPalette,
    toggleTheme,
    setDirectComparison,
    setInitialComparison,
    keyenceProgram,
    programNames,
    chooseProgram,
    busy,
    progress,
    error,
    openSelection,
    load,
  } = workspace;
  if (directComparison)
    return (
      <DirectComparisonWorkspace
        initial={initialComparison}
        dark={theme === 'dark'}
        palette={ladderPalette}
        changePalette={(value) => changeLadderPalette(value as LadderPalette)}
        toggleTheme={toggleTheme}
        back={() => {
          setDirectComparison(false);
          setInitialComparison(undefined);
        }}
      />
    );
  if (keyenceProgram)
    return (
      <KeyenceViewer
        onCompare={() => setDirectComparison(true)}
        palette={ladderPalette}
        changePalette={(value) => changeLadderPalette(value as LadderPalette)}
        program={keyenceProgram}
        names={programNames}
        choose={chooseProgram}
        busy={busy}
        progress={progress}
        error={error}
        dark={theme === 'dark'}
        toggleTheme={toggleTheme}
        openFiles={() => openSelection('open-csv')}
        openFolder={() => openSelection('open-folder')}
        drop={(files) => {
          void load(files);
        }}
      />
    );
  return <MitsubishiWorkspace {...workspace} />;
}
render(<App />, document.getElementById('app')!);
