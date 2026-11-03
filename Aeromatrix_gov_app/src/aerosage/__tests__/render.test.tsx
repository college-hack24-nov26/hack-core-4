import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConversationPanel } from '../ConversationPanel';
import type { ChatMessage } from '../types';

const noop = vi.fn();
const render = (messages: ChatMessage[]) =>
  renderToStaticMarkup(<ConversationPanel messages={messages} onConfirm={noop} onDismiss={noop} onRetry={noop} />);

describe('ConversationPanel', () => {
  it('shows both sides of the conversation', () => {
    const out = render([
      { id: '1', role: 'user', text: 'PM2.5 at Hadapsar' },
      { id: '2', role: 'assistant', text: 'PM2.5: **40.1** ug/m3', status: 'ok', sources: ['model_api:/pollution?region=Hadapsar'] },
    ]);
    expect(out).toContain('PM2.5 at Hadapsar');
    expect(out).toContain('<strong>40.1</strong>');
    expect(out).toContain('Source: model_api:/pollution?region=Hadapsar');
    expect(out).toContain('role="log"');
  });

  it('labels unavailable and offline answers instead of hiding them', () => {
    expect(render([{ id: '1', role: 'assistant', text: 'No snapshot', status: 'unavailable' }])).toContain('Unavailable');
    expect(render([{ id: '1', role: 'assistant', text: 'Not reachable', status: 'offline' }])).toContain('Service offline');
  });

  it('asks before changing the scenario', () => {
    const out = render([
      { id: '1', role: 'assistant', text: 'ok', pending: [{ type: 'update_scenario_parameter', parameter: 'traffic_reduction_pct', value: 20 }] },
    ]);
    expect(out).toContain('This would change your scenario');
    expect(out).toContain('Set traffic reduction to 20%');
    expect(out).toContain('Apply');
    expect(out).toContain('Not now');
  });

  it('reports what actually happened in the app, including failures', () => {
    const out = render([
      {
        id: '1',
        role: 'assistant',
        text: 'done',
        outcomes: [
          { label: 'Open the sensors panel', ok: true, message: 'Done' },
          { label: 'Select Nowhere on the map', ok: false, message: 'Nowhere is not on this map\'s station list.' },
        ],
      },
    ]);
    expect(out).toContain('Open the sensors panel');
    expect(out).toContain('Nowhere is not on this map&#x27;s station list.');
  });

  it('offers a retry on a failed reply and shows progress while streaming', () => {
    expect(render([{ id: '1', role: 'assistant', text: 'AeroSage is not reachable.', failed: true }])).toContain('Try again');
    expect(render([{ id: '1', role: 'assistant', text: '', streaming: true }])).toContain('Thinking');
  });
});
