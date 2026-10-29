// A corporate setting (editor spec §40, corporate_personal_split): the sanctioned patterns of one workplace, as plain
// data the owner keeps. It is the whole corporate layer. The engine, profiles and keys stay in the personal layer.
// - What it redacts, and the label AI-made content carries: the export rules of §38 (export-boundary.ts in the core).
// - Its AI rule: what happens to a thing an AI helped make, when it crosses. Label it, remove it, or hold the crossing
//   until a person says yes. Label is the default (boundary_contract).
// - Its policy on top of the platform's own permissions (platform.ts): who may edit, what needs review, which graphs
//   may be joined. The policy only ever narrows.
import type { CorporateSetting, Redaction } from '@thoughtknot/core';

/** What a setting does with AI-made content as it crosses: labelled, left out, or held for a person to allow. */
export const AI_RULES = ['label', 'remove', 'hold'] as const;
/** One AI rule. */
export type AiRule = (typeof AI_RULES)[number];

/** The AI rule a setting has when it names none. */
export const DEFAULT_AI_RULE: AiRule = 'label';

/** The label AI-made content carries when a setting names none. */
export const DEFAULT_AI_LABEL = 'AI-assisted';

/** A setting's own policy, on top of the platform's permissions. Each part can only take access away. */
export interface Policy {
  /** Who may edit, by principal. None: whoever the platform lets edit. */
  editors?: readonly string[];
  /** Paths whose edits wait for a review. */
  review?: readonly string[];
  /** The graphs that may be joined with each other. None: any the platform lets the person read. */
  joins?: readonly string[];
}

/** One workplace's setting: its name, the export rules, its AI rule and its policy. */
export interface Setting extends CorporateSetting {
  name: string;
  ai: AiRule;
  policy: Policy;
}

/** Why a setting could not be read, in a code a host turns into words. */
export type SettingProblem = { code: 'not-an-object' | 'no-name' | 'bad-ai-rule' | 'bad-redaction'; at?: string };

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const texts = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every(isText) ? v : undefined);

/** A setting read from its JSON, with the defaults filled in, or the first thing wrong with it. */
export function readSetting(json: unknown): { ok: true; setting: Setting } | { ok: false; problem: SettingProblem } {
  if (!json || typeof json !== 'object' || Array.isArray(json))
    return { ok: false, problem: { code: 'not-an-object' } };
  const o = json as Record<string, unknown>;
  if (!isText(o['name'])) return { ok: false, problem: { code: 'no-name' } };
  const ai = o['ai'] ?? DEFAULT_AI_RULE;
  if (!(AI_RULES as readonly unknown[]).includes(ai)) return { ok: false, problem: { code: 'bad-ai-rule' } };
  const redact: Redaction[] = [];
  for (const [i, r] of (Array.isArray(o['redact']) ? o['redact'] : []).entries()) {
    const one = r as Record<string, unknown>;
    const kept = Object.fromEntries(['tag', 'label', 'key'].filter((k) => isText(one?.[k])).map((k) => [k, one[k]]));
    if (!Object.keys(kept).length) return { ok: false, problem: { code: 'bad-redaction', at: String(i) } };
    redact.push(kept);
  }
  const p = (o['policy'] ?? {}) as Record<string, unknown>;
  const policy: Policy = {};
  for (const k of ['editors', 'review', 'joins'] as const) {
    const list = texts(p[k]);
    if (list) policy[k] = list;
  }
  return {
    ok: true,
    setting: {
      name: o['name'],
      redact,
      aiLabel: isText(o['aiLabel']) ? o['aiLabel'] : DEFAULT_AI_LABEL,
      ai: ai as AiRule,
      policy,
    },
  };
}
