import { useEditorStore } from '../editorStore';

export function MediaBin() {
  const project = useEditorStore((state) => state.project);

  return (
    <section className="media-bin">
      <h2>Media</h2>
      {!project || Object.keys(project.assets).length === 0 ? (
        <p>No assets imported.</p>
      ) : (
        <ul>
          {Object.values(project.assets).map((asset) => (
            <li key={asset.id}>
              {asset.name} — {asset.kind} — {Math.round(asset.durationUs / 1_000_000)}s
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
