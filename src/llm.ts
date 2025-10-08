import { request } from 'undici';
import { config } from './config.ts';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export async function chat(
  messages: ChatMessage[],
  { temperature = 0.8, timeoutMs = 12_000 }: { temperature?: number; timeoutMs?: number } = {}
): Promise<string> {
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
      throw new Error(`Ollama responded ${statusCode}: ${errorText}`);
    }

    const raw = await body.text();
    const json = JSON.parse(raw);
    return (json?.message?.content ?? '').trim();
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('LLM request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
