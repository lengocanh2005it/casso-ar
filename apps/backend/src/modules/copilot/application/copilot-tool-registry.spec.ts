import {
  type CopilotToolDefinition,
  CopilotToolRegistry,
} from './copilot-tool-registry';

function fakeTool(
  name: string,
  requiresReminderPermission = false,
): CopilotToolDefinition {
  return {
    name,
    description: `fake tool ${name}`,
    inputSchema: { type: 'object', properties: {}, required: [] },
    requiresReminderPermission,
  };
}

describe('CopilotToolRegistry', () => {
  it('only returns tools from the hardcoded safe allowlist', () => {
    const registry = new CopilotToolRegistry();
    registry.register(fakeTool('getReceivableSummary'));
    registry.register(fakeTool('getCollectionActivityTimeline'));
    registry.register(fakeTool('getPaymentHistory'));
    registry.register(fakeTool('draftReminderEmail', true));
    registry.register(fakeTool('sendReminderEmail', true));

    const names = registry.getTools(true).map((tool) => tool.function.name);

    expect(names.sort()).toEqual([
      'draftReminderEmail',
      'getCollectionActivityTimeline',
      'getPaymentHistory',
      'getReceivableSummary',
      'sendReminderEmail',
    ]);
  });

  it('rejects write-off, allocation, and dispute tools', () => {
    const registry = new CopilotToolRegistry();

    expect(() => registry.register(fakeTool('writeOffReceivable'))).toThrow(
      /not in the Copilot safe tool allowlist/,
    );
    expect(() => registry.register(fakeTool('allocatePayment'))).toThrow();
    expect(() => registry.register(fakeTool('disputeReceivable'))).toThrow();
    expect(registry.getTools(true)).toHaveLength(0);
  });

  it('hides reminder tools without REMINDER_SEND_MANUAL', () => {
    const registry = new CopilotToolRegistry();
    registry.register(fakeTool('getReceivableSummary'));
    registry.register(fakeTool('getCollectionActivityTimeline'));
    registry.register(fakeTool('getPaymentHistory'));
    registry.register(fakeTool('draftReminderEmail', true));
    registry.register(fakeTool('sendReminderEmail', true));

    expect(registry.getTools(false).map((tool) => tool.function.name)).toEqual([
      'getReceivableSummary',
      'getCollectionActivityTimeline',
      'getPaymentHistory',
    ]);
  });
});
