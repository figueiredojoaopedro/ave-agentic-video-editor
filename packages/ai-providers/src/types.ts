export interface AIToolCall {
  id: string;
  name: string;
  /** JSON-encoded arguments string */
  arguments: string;
}

export interface AIToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool parameters */
  parameters: Record<string, unknown>;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: AIToolCall[];
  toolCallId?: string;
}

export interface AIRequest {
  model: string;
  messages: AIMessage[];
  tools?: AIToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

export interface AIResponse {
  content: string;
  toolCalls: AIToolCall[];
}

export interface AIProvider {
  id: string;
  name: string;
  generate(request: AIRequest): Promise<AIResponse>;
}
