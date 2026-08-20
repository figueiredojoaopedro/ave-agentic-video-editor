import { useState } from 'react';
import { useEditorStore } from '../editorStore';

export function Toolbar() {
  const busy = useEditorStore((state) => state.busy);
  const hasProject = useEditorStore((state) => state.projectId !== null);
  const createProject = useEditorStore((state) => state.createProject);
  const importAsset = useEditorStore((state) => state.importAsset);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const splitSelected = useEditorStore((state) => state.splitSelected);
  const deleteSelected = useEditorStore((state) => state.deleteSelected);
  const nudgeSelected = useEditorStore((state) => state.nudgeSelected);
  const saveProject = useEditorStore((state) => state.saveProject);
  const loadProject = useEditorStore((state) => state.loadProject);
  const render = useEditorStore((state) => state.render);

  const [projectName, setProjectName] = useState('My Project');
  const [importPath, setImportPath] = useState('');
  const [loadPath, setLoadPath] = useState('');

  return (
    <section className="toolbar">
      <div className="toolbar-row">
        <input value={projectName} onChange={(e) => setProjectName(e.target.value)} aria-label="project name" />
        <button disabled={busy} onClick={() => void createProject(projectName)}>New Project</button>
        <button disabled={busy || !hasProject} onClick={() => void undo()}>Undo</button>
        <button disabled={busy || !hasProject} onClick={() => void redo()}>Redo</button>
        <button disabled={busy || !hasProject} onClick={() => void splitSelected()}>Split</button>
        <button disabled={busy || !hasProject} onClick={() => void deleteSelected()}>Delete</button>
        <button disabled={busy || !hasProject} onClick={() => void nudgeSelected(-100_000)}>Move &lt;-</button>
        <button disabled={busy || !hasProject} onClick={() => void nudgeSelected(100_000)}>Move -&gt;</button>
        <button disabled={busy || !hasProject} onClick={() => void saveProject()}>Save</button>
        <button disabled={busy || !hasProject} onClick={() => void render()}>Render</button>
      </div>
      <div className="toolbar-row">
        <input value={importPath} onChange={(e) => setImportPath(e.target.value)} placeholder="media file path" aria-label="import path" />
        <button disabled={busy || !hasProject || importPath.length === 0} onClick={() => void importAsset(importPath)}>Import</button>
        <input value={loadPath} onChange={(e) => setLoadPath(e.target.value)} placeholder="project file path" aria-label="load path" />
        <button disabled={busy || loadPath.length === 0} onClick={() => void loadProject(loadPath)}>Load</button>
      </div>
    </section>
  );
}
