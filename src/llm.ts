import { request } from 'undici';
import { config } from './config.ts';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatOptions = {
  temperature?: number;
  timeoutMs?: number;
};

export class LLMRequestError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'LLMRequestError';
  }
}

export class LLMTimeoutError extends LLMRequestError {
  constructor(message = 'LLM request timed out') {
    super(message);
    this.name = 'LLMTimeoutError';
  }
}

export class LLMModelNotFoundError extends LLMRequestError {
  constructor(message: string) {
    super(message);
    this.name = 'LLMModelNotFoundError';
  }
}

export async function chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
  const { temperature = 0.8, timeoutMs = config.llmTimeoutMs } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { body, statusCode } = await request(`${config.ollamaHost}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        messages,
        options: { temperature }
      }),
      signal: controller.signal
    });

    if (statusCode < 200 || statusCode >= 300) {
      const errorText = await body.text();

      if (statusCode === 404) {
        try {
          const parsed = JSON.parse(errorText) as { error?: string };
          const detail = parsed?.error ?? errorText;
          if (detail.toLowerCase().includes('model')) {
            throw new LLMModelNotFoundError(
              `Modelo "${config.model}" não encontrado em ${config.ollamaHost}. ` +
                'Garanta que o modelo exista (ex.: `ollama pull <modelo>`) ou ajuste OLLAMA_HOST para um endpoint compatível.'
            );
          }
        } catch {
          /* swallow JSON parse error and rethrow generic request error below */
        }
      }

      throw new LLMRequestError(`Ollama responded ${statusCode}: ${errorText}`);
    }

    const raw = await body.text();
    try {
      const json = JSON.parse(raw);
      return (json?.message?.content ?? '').trim();
    } catch (parseError) {
      throw new LLMRequestError('Failed to parse Ollama response', parseError);
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new LLMTimeoutError();
    }
    if (error instanceof LLMRequestError) {
      throw error;
    }
    throw new LLMRequestError('Unexpected LLM failure', error);
  } finally {
    clearTimeout(timeout);
  }
}
