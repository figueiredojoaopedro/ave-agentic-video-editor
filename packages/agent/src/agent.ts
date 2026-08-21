import type { AIMessage, AIProvider, AIToolDefinition } from '@agentic-video-editor/ai-providers';
import type { Project } from '@agentic-video-editor/editor-core';
import type { AgentContext } from './context.js';
import type { AgentTool, ToolResult } from './tools.js';

export interface AgentOptions {
  context: AgentContext;
  provider: AIProvider;
  model: string;
  tools: AgentTool[];
  userMessage: string;
  systemPrompt?: string;
  maxIterations?: number;
}

export interface AgentResult {
  response: string;
  appliedOperations: string[];
  project: Project;
}

export const DEFAULT_SYSTEM_PROMPT = [
  'You are an assistant that edits video projects by calling tools.',
  'Read project state with the get* tools before editing.',
  'Every edit must be a valid operation on the timeline; the tools validate and apply it.',
  'When the task is done, reply with a short summary.',
].join(' ');

export async function runAgent(options: AgentOptions): Promise<AgentResult> {
  const maxIterations = options.maxIterations ?? 10;
  const messages: AIMessage[] = [
    { role: 'system', content: options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
    { role: 'user', content: options.userMessage },
  ];
  const toolDefinitions: AIToolDefinition[] = options.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parametersJsonSchema,
  }));
  const appliedOperations: string[] = [];

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const response = await options.provider.generate({
      model: options.model,
      messages,
      tools: toolDefinitions,
    });

    messages.push({ role: 'assistant', content: response.content, toolCalls: response.toolCalls });

    if (response.toolCalls.length === 0) {
      return {
        response: response.content.length > 0 ? response.content : 'Done.',
        appliedOperations,
        project: options.context.getProject(),
      };
    }

    for (const call of response.toolCalls) {
      const tool = options.tools.find((candidate) => candidate.name === call.name);
      let result: ToolResult;
      if (!tool) {
        result = { ok: false, message: `error: unknown tool '${call.name}'` };
      } else {
        result = await tool.handler(options.context, call.arguments);
        if (result.ok && tool.kind === 'edit') {
          appliedOperations.push(tool.name);
        }
      }
      messages.push({
        role: 'tool',
        content: result.ok ? `ok: ${result.message}` : result.message,
        toolCallId: call.id,
      });
    }
  }

  return {
    response: 'Reached the maximum number of tool iterations.',
    appliedOperations,
    project: options.context.getProject(),
  };
}
