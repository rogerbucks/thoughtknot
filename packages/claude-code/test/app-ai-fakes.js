// What the AI tests on the phone app's page share (ES§19, app_ai_host to app_ai_on_device): a device that is not one.
// Its Keychain is a map the test can read, its storage is the window's, its network only records what it was handed,
// and its own model, where it has one, answers as told.
import { JSDOM } from 'jsdom';
import { settingsFrom } from '@thoughtknot/core';
import { AppAi } from '../page/app-ai-host.ts';
import { appAiPorts } from '../page/app-ai-ports.ts';

export const NOTE =
  "# Trip\n\n```gql\n// graph: trip\n(a:Place {name: 'Paris'}),\n(b:Place {name: 'Rome'}),\n(a)-[:NEAR]->(b)\n```\n";

/** A model's answer with one change in it, in the chat answer's shape. */
export const ANSWER = JSON.stringify({
  choices: [
    {
      message: {
        content: JSON.stringify({
          changes: [
            {
              op: 'add-thing',
              name: 'milan',
              kind: 'Place',
              properties: { name: 'Milan' },
              certainty: 'likely',
              reason: 'asked for',
            },
          ],
        }),
      },
    },
  ],
});

/** A model the person runs, on their tailnet. */
export const OWN = {
  name: 'Mac mini',
  endpoint: 'https://mac-mini.tailnet.ts.net/v1',
  model: 'llama',
  purpose: 'Research questions',
  ceiling: 'Public',
  keyName: 'Mac mini',
  reach: 'private',
};

/** A page in a DOM, with a `#gn-page` to put a sheet in. */
export function dom() {
  const d = new JSDOM('<!doctype html><main id="gn-page" class="gn-page"></main>', { url: 'https://app.test/' });
  return d.window;
}

/**
 * A device and AI on it. `own` is what its own model says, or undefined when it has none. `reply` is what the network
 * answers. Everything the device was handed is kept in `device`.
 */
export async function phone({ setup, own, reply = { status: 200, text: ANSWER }, win = dom() } = {}) {
  const keychain = new Map();
  const sent = [];
  const asked = [];
  const device = {
    keychain,
    sent,
    asked,
    keys: {
      has: async (name) => keychain.has(name),
      get: async (name) => keychain.get(name) ?? null,
      set: async (name, key) => void keychain.set(name, key),
      forget: async (name) => void keychain.delete(name),
    },
    request: async (r) => {
      sent.push(r);
      return typeof reply === 'function' ? reply(r) : reply;
    },
    onDevice: own === undefined ? 'device-not-eligible' : 'available',
    ask: async (instructions, prompt) => {
      asked.push({ instructions, prompt });
      return own;
    },
  };
  if (setup) win.localStorage.setItem('thoughtknot.ai.setup', JSON.stringify(setup));
  const ports = appAiPorts(device, win.localStorage);
  const ai = await AppAi.start(ports, settingsFrom({}));
  return { ai, device, ports, win };
}

/** Waits until `ok` is true, or fails after a second. */
export async function until(ok) {
  for (let i = 0; i < 100; i++) {
    if (ok()) return;
    await new Promise((t) => setTimeout(t, 10));
  }
  throw new Error('waited a second for something that did not come');
}
