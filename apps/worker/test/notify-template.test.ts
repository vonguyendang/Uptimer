import { describe, expect, it } from 'vitest';

import {
  buildNotificationMessage,
  defaultMessageForEvent,
  renderJsonTemplate,
  renderStringTemplate,
  shouldSendEvent,
} from '../src/notify/template';

describe('notify/template', () => {
  const vars = {
    event: 'monitor.down',
    message: 'API timeout',
    monitor: { id: 9, name: 'API', target: 'https://api.example.com/health' },
    state: { status: 'down', error: 'Timeout 10000ms', latency_ms: 10000 },
    incident: { title: 'API outage', impact: 'major' },
    update: { message: 'Mitigation applied' },
    maintenance: { title: 'DB maintenance' },
    arr: [{ value: 'first' }, { value: 'second' }],
  } satisfies Record<string, unknown>;

  it('renders string templates with nested paths and array indexes', () => {
    const output = renderStringTemplate(
      '[{{event}}] {{monitor.name}} {{state.status}} {{arr[1].value}} {{missing.field}}',
      vars,
    );
    expect(output).toBe('[monitor.down] API down second ');
  });

  it('supports leading-dot paths and empty message fallback', () => {
    expect(renderStringTemplate('{{ .monitor.name }}', vars)).toBe('API');
    expect(renderStringTemplate('Alert: $MSG', { monitor: vars.monitor })).toBe('Alert: $MSG');
  });

  it('supports legacy-compatible $MSG replacement', () => {
    expect(renderStringTemplate('$MSG', vars)).toBe('API timeout');
    expect(renderStringTemplate('Alert: $MSG', vars)).toBe('Alert: API timeout');
    expect(renderStringTemplate('Alert: {{message}}', vars)).toBe('Alert: API timeout');
  });

  it('blocks prototype-pollution style path expressions', () => {
    expect(renderStringTemplate('{{__proto__.polluted}}', vars)).toBe('');
    expect(renderStringTemplate('{{constructor.prototype}}', vars)).toBe('');
    expect(renderStringTemplate('{{arr[foo]}}', vars)).toBe('');
    expect(renderStringTemplate('{{arr[0}}', vars)).toBe('');
    expect(renderStringTemplate('{{monitor.name[0]}}', vars)).toBe('');
  });

  it('renders JSON templates recursively and respects maxDepth', () => {
    const payload = {
      text: '{{message}}',
      monitor: {
        id: '{{monitor.id}}',
        target: '{{monitor.target}}',
      },
      rows: ['{{arr[0].value}}', '{{arr[1].value}}'],
    };

    expect(renderJsonTemplate(payload, vars)).toEqual({
      text: 'API timeout',
      monitor: {
        id: '9',
        target: 'https://api.example.com/health',
      },
      rows: ['first', 'second'],
    });

    expect(renderJsonTemplate({ deep: { deeper: { value: 'x' } } }, vars, { maxDepth: 1 })).toEqual(
      {
        deep: {
          deeper: null,
        },
      },
    );

    expect(renderJsonTemplate(123, vars)).toBe(123);
  });

  it('builds default message templates for built-in event types', () => {
    expect(defaultMessageForEvent('monitor.down', vars)).toContain('Monitor DOWN: API');
    expect(defaultMessageForEvent('monitor.up', vars)).toBe(
      'Monitor UP: API (https://api.example.com/health)',
    );
    expect(defaultMessageForEvent('incident.created', vars)).toBe(
      'Incident created: API outage (impact: major)',
    );
    expect(defaultMessageForEvent('incident.updated', vars)).toContain('Mitigation applied');
    expect(defaultMessageForEvent('incident.resolved', vars)).toBe('Incident resolved: API outage');
    expect(defaultMessageForEvent('maintenance.started', vars)).toBe(
      'Maintenance started: DB maintenance',
    );
    expect(defaultMessageForEvent('maintenance.ended', vars)).toBe(
      'Maintenance ended: DB maintenance',
    );
    expect(defaultMessageForEvent('test.ping', vars)).toBe('Uptimer test notification');
    expect(defaultMessageForEvent('custom.event', vars)).toBe('Uptimer event: monitor.down');
    expect(defaultMessageForEvent('custom.event', {})).toBe('Uptimer notification');
  });

  it('falls back when value stringification throws', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(renderStringTemplate('{{circular}}', { circular })).toBe('[object Object]');
    expect(defaultMessageForEvent('custom.event', { event: circular })).toBe(
      'Uptimer event: [object Object]',
    );
  });
  it('shouldSendEvent passes test.ping always, passes all events when list empty, filters otherwise', () => {
    expect(shouldSendEvent({}, 'test.ping')).toBe(true);
    expect(shouldSendEvent({ enabled_events: [] }, 'monitor.down')).toBe(true);
    expect(shouldSendEvent({ enabled_events: ['monitor.down'] }, 'monitor.down')).toBe(true);
    expect(shouldSendEvent({ enabled_events: ['monitor.down'] }, 'monitor.up')).toBe(false);
    expect(shouldSendEvent({ enabled_events: ['monitor.down'] }, 'test.ping')).toBe(true);
  });

  it('buildNotificationMessage renders vars and default message correctly', () => {
    const args = {
      channelId: 5,
      channelName: 'Ops',
      eventType: 'monitor.down',
      eventKey: 'monitor:1:down:1700000000',
      payload: { monitor: { id: 1, name: 'API', target: 'https://api.example.com' }, state: { status: 'down' } },
      now: 1700000000,
    };

    const result = buildNotificationMessage(args);

    expect(result.message).toContain('Monitor DOWN: API');
    expect(result.vars.event).toBe('monitor.down');
    expect(result.vars.event_id).toBe('monitor:1:down:1700000000');
    expect(result.vars.timestamp).toBe(1700000000);
    expect((result.vars.channel as { id: number; name: string }).id).toBe(5);
    expect(result.vars.default_message).toBe(result.vars.message);
  });

  it('buildNotificationMessage uses messageTemplate when provided', () => {
    const args = {
      channelId: 1,
      channelName: 'Test',
      messageTemplate: 'ALERT: {{monitor.name}}',
      eventType: 'monitor.up',
      eventKey: 'monitor:1:up:1700000001',
      payload: { monitor: { id: 1, name: 'DB', target: 'db.example.com' }, state: { status: 'up' } },
      now: 1700000001,
    };

    const result = buildNotificationMessage(args);

    expect(result.message).toBe('ALERT: DB');
    expect(result.vars.message).toBe('ALERT: DB');
  });

  it('buildNotificationMessage handles non-object payloads gracefully', () => {
    const args = {
      channelId: 2,
      channelName: 'Chan',
      eventType: 'test.ping',
      eventKey: 'test:webhook:2:1700000002',
      payload: null,
      now: 1700000002,
    };

    const result = buildNotificationMessage(args);

    expect(result.message).toBe('Uptimer test notification');
    expect(result.vars.payload).toBeNull();
  });
});
