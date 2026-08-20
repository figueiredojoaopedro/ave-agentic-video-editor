import { useEditorStore } from '../editorStore';

const PX_PER_SECOND = 100;

export function Timeline() {
  const project = useEditorStore((state) => state.project);
  const playheadUs = useEditorStore((state) => state.playheadUs);
  const selectedClipId = useEditorStore((state) => state.selectedClipId);
  const selectClip = useEditorStore((state) => state.selectClip);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);

  if (!project) return <section className="timeline"><p>No project yet.</p></section>;

  const durationUs = projectDuration(project);

  return (
    <section className="timeline">
      <div className="timeline-header">
        <span>Timeline</span>
        <input
          type="range"
          min={0}
          max={durationUs}
          step={1000}
          value={playheadUs}
          onChange={(event) => setPlayhead(Number(event.target.value))}
          aria-label="playhead"
        />
        <span>{Math.round(playheadUs / 1000)} ms</span>
      </div>
      <div className="timeline-body" style={{ minWidth: `${Math.max(durationUs / 1_000_000, 1) * PX_PER_SECOND + 200}px` }}>
        {project.timeline.tracks.map((track) => (
          <div className="track" key={track.id}>
            <span className="track-label">{track.kind}</span>
            {track.clips.map((clip) => (
              <div
                key={clip.id}
                className={`clip${clip.id === selectedClipId ? ' selected' : ''}`}
                style={{
                  left: `${(clip.timelineStartUs / 1_000_000) * PX_PER_SECOND}px`,
                  width: `${((clip.timelineEndUs - clip.timelineStartUs) / 1_000_000) * PX_PER_SECOND}px`,
                }}
                onClick={() => selectClip(clip.id === selectedClipId ? null : clip.id)}
                title={`${clip.name} (${Math.round(clip.timelineStartUs / 1000)}ms - ${Math.round(clip.timelineEndUs / 1000)}ms)`}
              >
                {clip.name}
              </div>
            ))}
          </div>
        ))}
        <div
          className="playhead"
          style={{ left: `${(playheadUs / 1_000_000) * PX_PER_SECOND}px` }}
        />
      </div>
    </section>
  );
}

function projectDuration(project: NonNullable<ReturnType<typeof useEditorStore.getState>['project']>): number {
  let max = 0;
  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.timelineEndUs > max) max = clip.timelineEndUs;
    }
  }
  return max;
}
