// The AI ports a phone app hands the page (editor spec ES§19, app_ai_host), made from what the device itself can do:
// its Keychain, its one way to send a request, and its own model where it has one. The setup and the record of sends
// are kept in the window's own storage, on this device only (app-ai-settings.ts, app-ai-record.ts).
import type { AiKeys, AppAiPorts } from './app-ai-host.ts';
import { onDeviceModel } from './app-ai-on-device.ts';
import type { AskOnDevice } from './app-ai-on-device.ts';
import { deviceSendLog } from './app-ai-record.ts';
import { deviceSetupStore } from './app-ai-settings.ts';

/** A request the device sends as given: a model's chat request, or Test's bodiless ask for its list of models. */
export interface DeviceRequest {
  url: string;
  method: 'POST' | 'GET';
  headers: Record<string, string>;
  body: string;
}

/** What the device itself can do for AI. */
export interface DeviceAi {
  keys: AiKeys;
  request(r: DeviceRequest): Promise<{ status: number; text: string }>;
  /** Whether the device's own model can be asked now: 'available', or why not. */
  onDevice: string;
  ask: AskOnDevice;
}

/** The page's ports, from what the device can do and the window's own storage. */
export function appAiPorts(device: DeviceAi, storage: Pick<Storage, 'getItem' | 'setItem'>): AppAiPorts {
  return {
    setup: deviceSetupStore(storage),
    keys: device.keys,
    transport: (r) => device.request(r),
    probe: (url, headers) => device.request({ url, method: 'GET', headers, body: '' }),
    record: deviceSendLog(storage),
    onDevice: (ceiling) => Promise.resolve(device.onDevice === 'available' ? onDeviceModel(device.ask, ceiling) : null),
  };
}
