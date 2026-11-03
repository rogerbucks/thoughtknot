// Ready-made starting points for an AI model (editor spec §19, user_models): the address of each well-known service that
// takes the chat completions shape. A preset fills the name and endpoint only. The person gives the model's name and key.
// Until then nothing is sent. The ceiling starts at the lowest classification.
import type { WordKey } from '@thoughtknot/core';

/** A service a model can be added from: the key of its name in the catalogue, and the full address its requests go to. */
export interface AiPreset {
  id: string;
  name: WordKey;
  endpoint: string;
}

/** The services, in the order they are offered. A subscription to an app is not a key: each needs its own API key. */
export const AI_PRESETS: readonly AiPreset[] = [
  { id: 'claude', name: 'models.preset.claude', endpoint: 'https://api.anthropic.com/v1/chat/completions' },
  {
    id: 'gemini',
    name: 'models.preset.gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  },
  { id: 'grok', name: 'models.preset.grok', endpoint: 'https://api.x.ai/v1/chat/completions' },
  { id: 'chatgpt', name: 'models.preset.chatgpt', endpoint: 'https://api.openai.com/v1/chat/completions' },
];
