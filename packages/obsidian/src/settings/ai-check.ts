// Test beside a model's address on the settings page (spec §19, user_models; §13, offline_and_mobile_apis). Pressing it
// asks the address for its list of models, with the model's key, once. No note and no part of the vault is sent. An
// address that would travel unencrypted is refused before anything goes (ai_private_is_own).
import { Notice, requestUrl } from 'obsidian';
import { endpointProblem, modelsAddress, word } from '@thoughtknot/core';
import type { AiModel } from '@thoughtknot/core';

/** What the address answered, in words, after asking it once. */
export async function testModel(m: AiModel, key: string | null): Promise<string> {
  const problem = endpointProblem(m.endpoint);
  if (problem) return word('models.test.refused', { why: problem });
  const address = modelsAddress(m.endpoint);
  try {
    const reply = await requestUrl({
      url: address,
      method: 'GET',
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      throw: false,
    });
    // anything but a 2xx, a redirect to a sign-in page among them, is not an answer from the model
    if (reply.status < 200 || reply.status >= 300) return word('models.test.status', { address, status: reply.status });
    const names = modelNames(reply.text);
    return names.length
      ? word('models.test.ok', { address, names: names.join(', ') })
      : word('models.test.ok-none', { address });
  } catch (e) {
    return word('models.test.failed', { address, why: e instanceof Error ? e.message : String(e) });
  }
}

/** The ids of the models a list answer names, at most eight: the chat completions shape's `data[].id`. */
function modelNames(text: string): string[] {
  try {
    const data = (JSON.parse(text) as { data?: unknown }).data;
    if (!Array.isArray(data)) return [];
    return data
      .map((d) => (d && typeof d === 'object' ? (d as { id?: unknown }).id : undefined))
      .filter((id): id is string => typeof id === 'string')
      .slice(0, 8);
  } catch {
    return [];
  }
}

/** Test pressed: the answer said in a notice. */
export async function showTest(m: AiModel, key: string | null): Promise<void> {
  new Notice(await testModel(m, key), 10000);
}
