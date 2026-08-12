import { Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';

export interface CopilotJsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
}

export interface CopilotToolDefinition {
  name: string;
  description: string;
  inputSchema: CopilotJsonSchema;
  requiresReminderPermission: boolean;
}

export interface OpenAiToolShape {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: CopilotJsonSchema;
  };
}

@Injectable()
export class CopilotToolRegistry {
  static readonly SAFE_TOOL_NAMES = [
    'getReceivableSummary',
    'getCollectionActivityTimeline',
    'getPaymentHistory',
    'draftReminderEmail',
    'sendReminderEmail',
  ] as const;

  private readonly tools = new Map<string, CopilotToolDefinition>();

  register(tool: CopilotToolDefinition): void {
    if (
      !CopilotToolRegistry.SAFE_TOOL_NAMES.some((name) => name === tool.name)
    ) {
      throw new AppError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        `Tool "${tool.name}" is not in the Copilot safe tool allowlist (${CopilotToolRegistry.SAFE_TOOL_NAMES.join(', ')}).`,
      );
    }
    this.tools.set(tool.name, tool);
  }

  getTools(canSendReminders: boolean): OpenAiToolShape[] {
    return Array.from(this.tools.values())
      .filter((tool) => canSendReminders || !tool.requiresReminderPermission)
      .map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));
  }
}
