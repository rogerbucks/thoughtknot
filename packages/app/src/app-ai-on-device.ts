// The phone's own model (editor spec ES§19, app_ai_on_device; host_ai_first). Where the phone offers a model on the
// device itself, such as Apple's with Apple Intelligence on, it is offered first and counts as private.
// A note sent to it never leaves the phone. It is the core's host model, as VS Code's own models are (ask-ai.ts there).
// So every rule of a send holds for it too: its ceiling, the sheet first, the record. Where the phone offers none,
// nothing changes: no model is added, and the rest are offered as before.
import { word } from '@thoughtknot/core';
import type { Transport } from '@thoughtknot/core';
import type { OnDeviceModel } from './app-ai-host.ts';

/** Asks the phone's own model, with the instructions and the person's turn, and gives its answer as text. */
export type AskOnDevice = (instructions: string, prompt: string) => Promise<string>;

/**
 * A transport to the phone's own model: the chat request the core made is read back into its instructions and the
 * person's turn. The answer is given back in the chat answer's shape, so the core reads it as from any model.
 */
export function onDeviceTransport(ask: AskOnDevice): Transport {
  return async (request) => {
    const { messages } = JSON.parse(request.body) as { messages: { role: string; content: string }[] };
    const instructions = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const prompt = messages
      .filter((m) => m.role !== 'system')
      .map((m) => m.content)
      .join('\n\n');
    const content = await ask(instructions, prompt);
    return { status: 200, text: JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }) };
  };
}

/** The phone's own model, with `ceiling`, asked through `ask`. */
export function onDeviceModel(ask: AskOnDevice, ceiling: string): OnDeviceModel {
  return {
    model: {
      name: word('app.ai.on-device.name'),
      model: 'apple-on-device',
      address: word('app.ai.on-device.address'),
      ceiling,
    },
    transport: onDeviceTransport(ask),
  };
}
