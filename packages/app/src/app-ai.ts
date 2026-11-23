// AI on the phone app (editor spec ES§19, app_ai_host). The app's AI plug-in (src-tauri/ai) holds a model's key in the
// device's Keychain, sends a request the person said yes to, and asks the phone's own model. Here its commands become
// the page's AI ports, put on the window before the page starts. Only a device whose plug-in says it hosts AI gets them:
// any other, or one whose plug-in cannot be asked, gets none, and the page offers no AI.
import { appAiPorts } from '../../claude-code/page/app-ai-ports.ts';
import type { AppAiPorts } from '../../claude-code/page/app-ai-host.ts';
import type { Invoke } from './tauri-files.ts';

const ai = (command: string) => `plugin:ai|${command}`;

/** The page's AI ports over the plug-in's commands, or none where this device does not host AI. */
export async function tauriAiPorts(invoke: Invoke, storage: Storage): Promise<AppAiPorts | undefined> {
  const here = (await invoke(ai('ai_here')).catch(() => null)) as { host?: boolean; onDevice?: string } | null;
  if (!here?.host) return undefined;
  return appAiPorts(
    {
      keys: {
        has: async (name) => (await invoke(ai('ai_key_has'), { name })) === true,
        get: async (name) => ((await invoke(ai('ai_key_get'), { name })) as string | null) ?? null,
        set: async (name, key) => void (await invoke(ai('ai_key_set'), { name, key })),
        forget: async (name) => void (await invoke(ai('ai_key_forget'), { name })),
      },
      request: async (r) => (await invoke(ai('ai_request'), { request: r })) as { status: number; text: string },
      onDevice: here.onDevice ?? 'none',
      ask: async (instructions, prompt) => String(await invoke(ai('ai_on_device_ask'), { instructions, prompt })),
    },
    storage,
  );
}
