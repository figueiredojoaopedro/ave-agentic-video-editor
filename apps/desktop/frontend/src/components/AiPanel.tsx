import { useState } from 'react';
import { useEditorStore } from '../editorStore';

export function AiPanel() {
  const busy = useEditorStore((state) => state.busy);
  const projectId = useEditorStore((state) => state.projectId);
  const aiConfig = useEditorStore((state) => state.aiConfig);
  const aiMessages = useEditorStore((state) => state.aiMessages);
  const loadAiConfig = useEditorStore((state) => state.loadAiConfig);
  const saveAiConfig = useEditorStore((state) => state.saveAiConfig);
  const sendAiMessage = useEditorStore((state) => state.sendAiMessage);

  const [providerId, setProviderId] = useState('openai-compatible');
  const [model, setModel] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [chatMessage, setChatMessage] = useState('');

  const canChat = !busy && projectId !== null && aiConfig !== null;

  return (
    <section className="ai-panel">
      <h2>AI Assistant</h2>
      <div className="toolbar-row">
        <input value={providerId} onChange={(e) => setProviderId(e.target.value)} aria-label="provider id" />
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="model" aria-label="model" />
        <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="endpoint (optional)" aria-label="endpoint" />
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="api key" aria-label="api key" />
        <button disabled={busy} onClick={() => void loadAiConfig()}>Load Config</button>
        <button
          disabled={busy || model.length === 0}
          onClick={() => {
            const config: {
              providerId: string;
              model: string;
              endpoint?: string;
              apiKey?: string;
            } = { providerId, model };
            if (endpoint.length > 0) config.endpoint = endpoint;
            if (apiKey.length > 0) config.apiKey = apiKey;
            void saveAiConfig(config);
          }}
        >
          Save Config
        </button>
      </div>
      <p className="status">
        {aiConfig
          ? `Configured: ${aiConfig.providerId} / ${aiConfig.model}${aiConfig.hasApiKey ? '' : ' (no api key)'}`
          : 'No AI configuration yet.'}
      </p>
      <div className="chat-log">
        {aiMessages.map((message, index) => (
          <p key={index} className={`chat-line ${message.role}`}>
            <strong>{message.role}:</strong> {message.content}
          </p>
        ))}
      </div>
      <div className="toolbar-row">
        <input
          value={chatMessage}
          onChange={(e) => setChatMessage(e.target.value)}
          placeholder="e.g. Split the first clip at 400ms"
          aria-label="chat message"
        />
        <button
          disabled={!canChat || chatMessage.length === 0}
          onClick={() => {
            void sendAiMessage(chatMessage);
            setChatMessage('');
          }}
        >
          Send
        </button>
      </div>
    </section>
  );
}
