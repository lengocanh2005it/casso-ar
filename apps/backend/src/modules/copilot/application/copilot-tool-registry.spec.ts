import {
  type CopilotToolDefinition,
  CopilotToolRegistry,
} from './copilot-tool-registry';
import { RankReceivablesByRiskTool } from './tools/rank-receivables-by-risk.tool';

function fakeTool(
  name: string,
  requiresReminderPermission = false,
  requiresPaymentAllocatePermission = false,
): CopilotToolDefinition {
  return {
    name,
    description: `fake tool ${name}`,
    inputSchema: { type: 'object', properties: {}, required: [] },
    requiresReminderPermission,
    requiresPaymentAllocatePermission,
  };
}

function registerAll(registry: CopilotToolRegistry): void {
  registry.register(fakeTool('getReceivableSummary'));
  registry.register(fakeTool('getCollectionActivityTimeline'));
  registry.register(fakeTool('getPaymentHistory'));
  registry.register(fakeTool('findOverdueReceivables'));
  registry.register(fakeTool(RankReceivablesByRiskTool.NAME));
  registry.register(fakeTool('getCashFlowSnapshot'));
  registry.register(fakeTool('getExceptionQueueItems', false, true));
  registry.register(
    fakeTool('getReceivableCombinationSuggestions', false, true),
  );
  registry.register(fakeTool('draftReminderEmail', true));
  registry.register(fakeTool('sendReminderEmail', true));
}

describe('CopilotToolRegistry', () => {
  it('only returns tools from the hardcoded safe allowlist', () => {
    const registry = new CopilotToolRegistry();
    registerAll(registry);

    const names = registry
      .getTools(true, true)
      .map((tool) => tool.function.name);

    expect(names.sort()).toEqual([
      'draftReminderEmail',
      'findOverdueReceivables',
      'getCashFlowSnapshot',
      'getCollectionActivityTimeline',
      'getExceptionQueueItems',
      'getPaymentHistory',
      'getReceivableCombinationSuggestions',
      'getReceivableSummary',
      RankReceivablesByRiskTool.NAME,
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
    expect(registry.getTools(true, true)).toHaveLength(0);
  });

  it('hides reminder tools without REMINDER_SEND_MANUAL', () => {
    const registry = new CopilotToolRegistry();
    registerAll(registry);

    expect(
      registry.getTools(false, true).map((tool) => tool.function.name),
    ).toEqual([
      'getReceivableSummary',
      'getCollectionActivityTimeline',
      'getPaymentHistory',
      'findOverdueReceivables',
      RankReceivablesByRiskTool.NAME,
      'getCashFlowSnapshot',
      'getExceptionQueueItems',
      'getReceivableCombinationSuggestions',
    ]);
  });

  it('hides PAYMENT_ALLOCATE tools without the allocate gate', () => {
    const registry = new CopilotToolRegistry();
    registerAll(registry);

    const names = registry
      .getTools(true, false)
      .map((tool) => tool.function.name);

    for (const gated of [
      'getExceptionQueueItems',
      'getReceivableCombinationSuggestions',
    ]) {
      expect(names).not.toContain(gated);
      expect(
        registry.getTools(false, false).map((tool) => tool.function.name),
      ).not.toContain(gated);
    }
    // The reminder gate alone must not expose the allocate-gated tools.
    expect(names).toHaveLength(8);
  });

  it('keeps every existing tool visible regardless of the allocate gate', () => {
    const registry = new CopilotToolRegistry();
    registerAll(registry);

    const withoutAllocate = registry
      .getTools(true, false)
      .map((tool) => tool.function.name)
      .sort();
    const withAllocate = registry
      .getTools(true, true)
      .map((tool) => tool.function.name)
      .sort();

    const allocateGated = [
      'getExceptionQueueItems',
      'getReceivableCombinationSuggestions',
    ];
    expect(
      withAllocate.filter((name) => !allocateGated.includes(name)),
    ).toEqual(withoutAllocate);
  });
});
