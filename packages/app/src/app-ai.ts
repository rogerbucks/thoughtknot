// AI on the phone app (editor spec ES§19, app_ai_host). The app's AI plug-in (src-tauri/ai) holds a model's key in the
// device's Keychain, sends a request the person said yes to, and asks the phone's own model. Here its commands become
// the AI ports, and the AI becomes the page's host parts: its group of the More view and the board's way to ask
// (host-parts.ts on the page). The page holds none of it (cc_claude_only). Only a device whose plug-in says it hosts
// AI gets them: any other, or one whose plug-in cannot be asked, gets none, and the page offers no AI.
import type { HostParts, HostPartsAsk } from '../../claude-code/page/host-parts.ts';
import { AppAi, aiPortsOf } from './app-ai-host.ts';
import type { AppAiPorts } from './app-ai-host.ts';
import { appAiPorts } from './app-ai-ports.ts';
import { boardAskOf } from './app-ai-send-sheet.ts';
import { aiSection } from './app-ai-settings.ts';
import type { Invoke } from './tauri-files.ts';

const ai = (command: string) => `plugin:ai|${command}`;

/** The page's AI ports over the plug-in's commands, or none where this device does not host AI. */
export async function tauriAiPorts(invoke: Invoke, storage: Storage): Promise<AppAiPorts | undefined> {
  // a command that throws at once is a refusal like any other
  const call = async (command: string, args?: Record<string, unknown>) => invoke(ai(command), args);
  const here = (await call('ai_here').catch(() => null)) as { host?: boolean; onDevice?: string } | null;
  if (!here?.host) return undefined;
  return appAiPorts(
    {
      keys: {
        has: async (name) => (await call('ai_key_has', { name })) === true,
        get: async (name) => ((await call('ai_key_get', { name })) as string | null) ?? null,
        set: async (name, key) => void (await call('ai_key_set', { name, key })),
        forget: async (name) => void (await call('ai_key_forget', { name })),
      },
      request: async (r) => (await call('ai_request', { request: r })) as { status: number; text: string },
      onDevice: here.onDevice ?? 'none',
      ask: async (instructions, prompt) => String(await call('ai_on_device_ask', { instructions, prompt })),
    },
    storage,
  );
}

/**
 * The page's host parts for AI on this window: the AI group of the More view, and the board's Ask AI box while AI is
 * on. None where the window has no AI ports.
 */
export async function aiHostParts(win: Window, ask: HostPartsAsk): Promise<HostParts> {
  const ports = await aiPortsOf(win);
  if (!ports) return {};
  const ai = await AppAi.start(ports, ask.settings);
  return {
    // a change there offers the board's AI box, or takes it away
    section: aiSection(ask.doc, ai, ask.changed),
    askOf: (on, got) => boardAskOf(ask.doc, ai, ask.note, on, got, ask.say),
  };
}
