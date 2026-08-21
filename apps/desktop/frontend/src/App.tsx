import { AiPanel } from './components/AiPanel';
import { MediaBin } from './components/MediaBin';
import { Timeline } from './components/Timeline';
import { Toolbar } from './components/Toolbar';
import { useEditorStore } from './editorStore';

export function App() {
  const error = useEditorStore((state) => state.error);
  const info = useEditorStore((state) => state.info);
  const renderResult = useEditorStore((state) => state.renderResult);
  const project = useEditorStore((state) => state.project);

  return (
    <main className="app">
      <h1>Agentic Video Editor</h1>
      <Toolbar />
      {error && <p className="status error">Error: {error}</p>}
      {info && <p className="status info">{info}</p>}
      <div className="workspace">
        <MediaBin />
        <Timeline />
      </div>
      <AiPanel />
      {renderResult && (
        <p className="status">
          Rendered {renderResult.outputPath} ({Math.round(renderResult.durationUs / 1000)}ms, video:{String(renderResult.hasVideo)}, audio:{String(renderResult.hasAudio)})
        </p>
      )}
      {project && (
        <p className="status">
          Clips: {project.timeline.tracks.reduce((sum, track) => sum + track.clips.length, 0)}
        </p>
      )}
    </main>
  );
}
