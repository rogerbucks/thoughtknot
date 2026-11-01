// A platform's own permissions come first (editor spec §40, platform_security_first). Some work content lives on a
// platform with permissions of its own, such as SharePoint list items. There, a person may do what the platform allows
// AND what the setting's policy allows. The policy is laid on top and only ever narrows.
// - An item the person cannot read on the platform is never handed on: a connector is given only `visibleItems`.
// - Edit needs the platform's edit and, where the policy names editors, the person among them. Edit needs read too.
// - Review is something the policy adds: an edit to a path it names waits for a review. That only narrows.
// - A join of two graphs needs both readable and, where the policy names joins, both named.
import type { Policy } from './setting.ts';

/** SharePoint's permission levels, weakest first. Limited Access opens nothing by itself. */
export const SHAREPOINT_LEVELS = [
  'Limited Access',
  'View Only',
  'Read',
  'Contribute',
  'Edit',
  'Design',
  'Full Control',
];

/** What one level gives on the platform. */
const READS = new Set(['View Only', 'Read', 'Contribute', 'Edit', 'Design', 'Full Control']);
const EDITS = new Set(['Contribute', 'Edit', 'Design', 'Full Control']);

/** One item on the platform: its id, its path, and its role assignments, each a principal and a level. */
export interface PlatformItem {
  id: string;
  path: string;
  roles: readonly { principal: string; level: string }[];
}

/** What a person may do with an item. */
export interface Rights {
  read: boolean;
  edit: boolean;
  review: boolean;
}

/** What the platform alone gives `principals` (a person and the groups they are in) on `item`. */
export function platformRights(item: PlatformItem, principals: readonly string[]): Rights {
  const mine = item.roles.filter((r) => principals.includes(r.principal)).map((r) => r.level);
  const read = mine.some((l) => READS.has(l));
  return { read, edit: read && mine.some((l) => EDITS.has(l)), review: false };
}

const within = (path: string, at: string) => path === at || path.startsWith(at.endsWith('/') ? at : `${at}/`);

/** What `principals` may do on `item`: the platform's rights with the policy laid on top. Never more than the platform's. */
export function rightsOn(item: PlatformItem, principals: readonly string[], policy: Policy): Rights {
  const platform = platformRights(item, principals);
  const editor = !policy.editors || policy.editors.some((e) => principals.includes(e));
  const edit = platform.edit && editor;
  return { read: platform.read, edit, review: edit && (policy.review ?? []).some((p) => within(item.path, p)) };
}

/** The items `principals` may read, in their order. Only these are ever handed to a connector. */
export function visibleItems<T extends PlatformItem>(items: readonly T[], principals: readonly string[]): T[] {
  return items.filter((i) => platformRights(i, principals).read);
}

/** Whether graphs `a` and `b` may be joined: both readable, and both allowed where the policy names joins. */
export function joinAllowed(policy: Policy, a: string, b: string, readable: (graph: string) => boolean): boolean {
  if (!readable(a) || !readable(b)) return false;
  return !policy.joins || (policy.joins.includes(a) && policy.joins.includes(b));
}
