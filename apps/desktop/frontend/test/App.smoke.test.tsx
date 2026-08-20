import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from '../src/App';

describe('App', () => {
  it('renders the editor shell', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Agentic Video Editor');
  });
});
