// Ready-made starting points for an AI model (editor spec §19, user_models): the address of each well-known service that
// takes the chat completions shape. A preset fills the name and endpoint only. The model's own name and the key stay the
// person's to give, so nothing is sent until they have, and the ceiling starts at the lowest classification.
import { aiModel } from './ai-model.ts';
import type { AiModel } from './ai-model.ts';

/** A service a model can be added from: its name, and the full address its requests go to. */
export interface AiPreset {
  id: string;
  name: string;
  endpoint: string;
}

/** The services, in the order they are offered. A subscription to an app is not a key: each needs its own API key. */
export const AI_PRESETS: readonly AiPreset[] = [
  { id: 'claude', name: 'Claude', endpoint: 'https://api.anthropic.com/v1/chat/completions' },
  {
    id: 'gemini',
    name: 'Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  },
  { id: 'grok', name: 'Grok', endpoint: 'https://api.x.ai/v1/chat/completions' },
  { id: 'chatgpt', name: 'ChatGPT', endpoint: 'https://api.openai.com/v1/chat/completions' },
];

/** A new model from the preset named `id`, or null when there is none of that name. */
export function modelFromPreset(id: string, classifications?: string[]): AiModel | null {
  const preset = AI_PRESETS.find((p) => p.id === id);
  return preset ? aiModel({ name: preset.name, endpoint: preset.endpoint }, classifications) : null;
}
