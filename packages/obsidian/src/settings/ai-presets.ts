// Ready-made starting points for an AI model (editor spec §19, user_models): the address of each well-known service that
// takes the chat completions shape. A preset fills the name and endpoint only. The person gives the model's name and key.
// Until then nothing is sent. The ceiling starts at the lowest classification.
import type { WordKey } from '@thoughtknot/core';

/** A service a model can be added from: the key of its name in the catalogue, and the full address its requests go to. */
export interface AiPreset {
  id: string;
  name: WordKey;
  endpoint: string;
  /** A model the person runs themselves, so it starts as a private reviewer (ES§19, ai_private_is_own). */
  reach?: 'private';
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
  // LM Studio's own address on this device; one on another of the person's machines is typed in its place
  { id: 'lmstudio', name: 'models.preset.lmstudio', endpoint: 'http://localhost:1234/v1', reach: 'private' },
];
