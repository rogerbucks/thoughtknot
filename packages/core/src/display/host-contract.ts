// The one contract every host of the display layer is held to (editor spec §41, host_contract_published; §43,
// hosts_pass_contract). It is what `DisplayHost` promises, as checks any host runs against its own adapter code. That holds
// for Obsidian's, the browser page's, the standalone app's and VS Code's alike. The checks need no test framework. Each
// one throws when the host breaks the promise, so a host's tests run them with whatever runner it has. A host lets the
// checks see what it showed through a probe, as only it knows where its notices and menus go.
import type { FoundLink } from '@thoughtknot/core';
import { readNote, settingsFrom, storageContract } from '@thoughtknot/core';
import type { DisplayHost, Host, MenuEntry } from './host.ts';

/**
 * Each version of the host interface, with a digest of how `public-api.json` declares it then. The digest is the first
 * 16 hex characters of the SHA-256 of its `./display/host` entry, as JSON. A change to `DisplayHost` changes the
 * digest. Then test/lib-public-api.test.js fails until a new version is added here (risk API-3).
 */
export const HOST_CONTRACT_VERSIONS: readonly (readonly [version: number, digest: string])[] = [
  [3, 'efae3cb1b2853709'],
  [4, 'd1cb2bc16a374f29'],
  [5, 'c866c45ac5687bd0'],
  [6, '95a256edc7b311b7'],
];

/** The version of the host interface these checks hold a host to: the last one recorded above. */
export const HOST_CONTRACT_VERSION: number = HOST_CONTRACT_VERSIONS.at(-1)?.[0] ?? 0;

/** A menu row as the person sees it: its title, and whether it is ticked or a warning. */
export type MenuRowSeen = { title: string; checked?: boolean; warning?: boolean } | 'separator';

/** What a host lets the checks see of what it showed. */
export interface HostProbe {
  /** The document the host draws in. */
  doc: Document;
  /** A new element of that document, empty and on the page, for an icon to be drawn into. */
  element: () => HTMLElement;
  /** The messages its notices have shown, in order, as the person reads them. */
  notices: () => string[];
  /** Whether the notice of `message` can still be read after `ms` milliseconds, on a clock run that far. */
  stillShownAfter: (message: string, ms: number) => boolean;
  /** The rows of the last menu it showed, in order, or null when it has shown none. */
  lastMenu: () => MenuRowSeen[] | null;
  /** Chooses the row of the last menu titled `title`, as the person would. */
  choose: (title: string) => void;
}

/** A host for one check: a fresh adapter, and its probe. */
export interface HostUnderTest {
  host: DisplayHost;
  probe: HostProbe;
}

/** One check of the contract: what it holds a host to, and the run that throws when the host breaks it. */
export interface ContractCheck {
  name: string;
  run: () => void | Promise<void>;
}

/** Fails a check with what was wanted and what the host did. */
function fail(name: string, wanted: string, got: unknown): never {
  throw new Error(`${name}: wanted ${wanted}, got ${JSON.stringify(got)}`);
}

const ROWS: MenuEntry[] = [
  { title: 'Fit', icon: 'maximize', onClick: () => {} },
  'separator',
  { title: 'Left to right', icon: 'arrow-right', checked: true, onClick: () => {} },
  { title: 'Remove', icon: 'trash', warning: true, onClick: () => {} },
];

/** The rows the person should see for `entries`. */
const seen = (entries: MenuEntry[]): MenuRowSeen[] =>
  entries.map((e) =>
    e === 'separator'
      ? e
      : { title: e.title, ...(e.checked !== undefined && { checked: e.checked }), ...(e.warning && { warning: true }) },
  );

/** Every check of the contract, each run on a fresh host from `make`. */
export function hostContract(make: () => HostUnderTest): ContractCheck[] {
  return [
    {
      name: 'an icon is drawn into its element, once, whether the host knows its name or not',
      run: () => {
        const { host, probe } = make();
        const el = probe.element();
        host.icon(el, 'zoom-in');
        const once = el.childNodes.length;
        host.icon(el, 'zoom-in');
        if (el.childNodes.length !== once)
          fail('icon', `${once} child nodes after drawing again`, el.childNodes.length);
        host.icon(el, 'no-such-icon-anywhere');
      },
    },
    {
      name: 'the phone test is a true or false, asked each time',
      run: () => {
        const { host } = make();
        for (let i = 0; i < 2; i++) {
          const phone: unknown = host.isPhone();
          if (typeof phone !== 'boolean') fail('isPhone', 'a boolean', phone);
        }
      },
    },
    {
      name: 'a notice shows its message as text, as given, markup and all',
      run: () => {
        const { host, probe } = make();
        const message = 'Saved <b>A & B</b>';
        host.notice(message);
        const shown = probe.notices();
        if (shown[shown.length - 1] !== message) fail('notice', JSON.stringify(message), shown);
      },
    },
    {
      name: 'a notice of more than 80 characters is still shown after 10 seconds, and a short one is gone by a minute',
      run: () => {
        const { host, probe } = make();
        const long = 'This is a long notice that takes a slow reader more than a moment to read. It must not vanish.';
        host.notice(long);
        if (!probe.stillShownAfter(long, 10_000)) fail('notice', 'a long notice shown after 10 s', 'gone');
        const short = 'Saved.';
        host.notice(short);
        if (probe.stillShownAfter(short, 60_000)) fail('notice', 'a short notice gone by 60 s', 'still shown');
      },
    },
    {
      name: 'a menu shows its rows in order, with their lines, ticks and warnings',
      run: () => {
        const { host, probe } = make();
        host.menu(ROWS, { x: 10, y: 20 }, probe.doc);
        const want = seen(ROWS);
        const got = probe.lastMenu();
        if (JSON.stringify(got) !== JSON.stringify(want)) fail('menu', JSON.stringify(want), got);
      },
    },
    {
      name: 'choosing a menu row runs its action once, and no other row’s',
      run: () => {
        const { host, probe } = make();
        const ran: string[] = [];
        const rows: MenuEntry[] = ['Fit', 'Remove'].map((title) => ({
          title,
          icon: 'circle-dot',
          onClick: () => ran.push(title),
        }));
        host.menu(rows, { x: 0, y: 0 }, probe.doc);
        probe.choose('Remove');
        if (ran.join() !== 'Remove') fail('menu', '["Remove"]', ran);
      },
    },
    {
      name: 'the style policy is said as true or false, or left unsaid',
      run: () => {
        const { host } = make();
        if (host.noInlineStyle !== undefined && typeof host.noInlineStyle !== 'boolean')
          fail('noInlineStyle', 'a boolean or nothing', host.noInlineStyle);
      },
    },
    {
      name: 'the language is a language tag, or left unsaid',
      run: () => {
        const { host } = make();
        if (host.language === undefined) return;
        const tag: unknown = host.language();
        let known = false;
        try {
          known = typeof tag === 'string' && Intl.getCanonicalLocales(tag).length === 1;
        } catch {
          known = false;
        }
        if (!known) fail('language', 'a language tag such as en-GB', tag);
      },
    },
    {
      name: 'the direction is ltr or rtl, or left unsaid',
      run: () => {
        const { host } = make();
        if (host.direction === undefined) return;
        const way: unknown = host.direction();
        if (way !== 'ltr' && way !== 'rtl') fail('direction', 'ltr or rtl', way);
      },
    },
  ];
}

/** What a whole host lets the checks see: what its display showed, the links it opened, and a way to keep a secret. */
export interface ServicesProbe extends HostProbe {
  /** The target of each link the host opened, in order. */
  opened: () => string[];
  /**
   * Keeps `secret` under `name`, as the person would in the host's own secret storage. Not set: the host keeps no
   * secret, and every name reads null.
   */
  keepSecret?: (name: string, secret: string) => void;
}

/** What a host serves of the interface: all of it unless it says otherwise. */
export interface HostServes {
  /** False where the host follows no links of a card's note yet, such as the browser editor's page. */
  links?: false;
}

/** A whole host for one check: a fresh one, and its probe. */
export interface ServicesUnderTest {
  host: Host;
  probe: ServicesProbe;
}

/** A link to a note, as the link scan finds `[[target]]`. */
const linkTo = (target: string): FoundLink => {
  const written = `[[${target}]]`;
  return {
    written,
    start: 0,
    end: written.length,
    target,
    targetAt: { start: 2, end: 2 + target.length },
    label: target,
    embed: false,
    kind: 'note',
    opens: target,
    markdown: false,
  };
};

/**
 * Every check of the whole host interface, each run on a fresh host from `make`: the display's, then its links,
 * settings, secrets and notes. The notes are held to the storage contract (storage-contract.ts).
 */
export function hostServicesContract(make: () => ServicesUnderTest, serves: HostServes = {}): ContractCheck[] {
  const display = hostContract(() => {
    const { host, probe } = make();
    return { host: host.display, probe };
  });
  const notes = storageContract(() => make().host.files).map((check) => ({ ...check, name: `notes: ${check.name}` }));
  return [
    ...display,
    ...settingsChecks(make),
    {
      name: 'a secret is read by its name, and a name the host holds nothing for reads null',
      run: async () => {
        const { host, probe } = make();
        const none: unknown = await host.secrets.get('no-such-secret-anywhere');
        if (none !== null) fail('secrets', 'null', none);
        if (!probe.keepSecret) return;
        probe.keepSecret('ai-key', 'sk-test-0001');
        const kept: unknown = await host.secrets.get('ai-key');
        if (kept !== 'sk-test-0001') fail('secrets', '"sk-test-0001"', kept);
      },
    },
    ...(serves.links === false ? [] : linkChecks(make)),
    ...notes,
    ...draftChecks(make),
    ...layoutChecks(make),
  ];
}

/** The settings' checks: saved and loaded back, or, read only, loaded and a save refused. */
function settingsChecks(make: () => ServicesUnderTest): ContractCheck[] {
  return [
    {
      name: 'settings saved are loaded back as they were saved, and a second save replaces the first',
      run: async () => {
        const { host } = make();
        if (host.settings.readOnly) return;
        for (const value of [settingsFrom({}), settingsFrom({ aiMatrixNote: 'Matrix.md', direction: 'LR' })]) {
          await host.settings.save(value);
          const back = JSON.stringify(settingsFrom(await host.settings.load()));
          if (back !== JSON.stringify(value)) fail('settings', JSON.stringify(value), back);
        }
      },
    },
    {
      name: 'settings that are only read here are loaded, and a save is refused, saying why',
      run: async () => {
        const { host } = make();
        if (!host.settings.readOnly) return;
        const now: unknown = await host.settings.load();
        if (!now || typeof now !== 'object') fail('settings', 'the settings loaded', now);
        const why = await host.settings.save(now).then(
          () => null,
          (e: unknown) => (e instanceof Error ? e.message : String(e)),
        );
        if (!why) fail('settings', 'a save refused, saying why', why);
      },
    },
  ];
}

/** The drafts' checks: each kept by its key, read back, replaced, and cleared alone. */
function draftChecks(make: () => ServicesUnderTest): ContractCheck[] {
  const mine = 'Plans/Today.md#g',
    theirs = 'Plans/Today.md#other';
  return [
    {
      name: 'drafts: a draft kept is read back by its key, and a key with none reads null',
      run: async () => {
        const { host } = make();
        const none: unknown = await host.drafts.read(mine);
        if (none !== null) fail('drafts', 'null', none);
        await host.drafts.keep(mine, '(a:Thing)');
        const kept: unknown = await host.drafts.read(mine);
        if (kept !== '(a:Thing)') fail('drafts', '"(a:Thing)"', kept);
      },
    },
    {
      name: 'drafts: keeping again replaces the draft, and clearing one key leaves another',
      run: async () => {
        const { host } = make();
        await host.drafts.keep(mine, 'first');
        await host.drafts.keep(mine, 'second');
        await host.drafts.keep(theirs, 'theirs');
        const got = [await host.drafts.read(mine), await host.drafts.read(theirs)];
        if (JSON.stringify(got) !== '["second","theirs"]') fail('drafts', '["second","theirs"]', got);
        await host.drafts.clear(mine);
        const after = [await host.drafts.read(mine), await host.drafts.read(theirs)];
        if (JSON.stringify(after) !== '[null,"theirs"]') fail('drafts', '[null,"theirs"]', after);
      },
    },
  ];
}

/** A drawing of `things` things, read from a block as any host reads one. */
function drawingOf(things: number) {
  const block = ['// graph: g', ...Array.from({ length: things }, (_, i) => `(t${i}:Thing {name: 'T${i}'}),`)].join(
    '\n',
  );
  const drawing = readNote([block.replace(/,$/, '')]).graphs.get('g');
  if (!drawing) throw new Error('layout: the contract’s own block gave no drawing');
  return drawing;
}

/** The layouts' checks: a small drawing is laid out as an SVG; a newer drawing for one owner supersedes the older. */
function layoutChecks(make: () => ServicesUnderTest): ContractCheck[] {
  return [
    {
      name: 'layouts: a small drawing is laid out as an SVG picture',
      run: async () => {
        const { host } = make();
        const laid = await host.layout.draw(drawingOf(3));
        if (!laid || !('svg' in laid) || !laid.svg.includes('<svg')) fail('layout', 'an SVG picture', laid);
      },
    },
    {
      name: 'layouts: a newer drawing for the same owner answers the older with null, or both are laid out',
      run: async () => {
        const { host } = make();
        const owner = {};
        const [older, newer] = await Promise.all([
          host.layout.draw(drawingOf(2), owner),
          host.layout.draw(drawingOf(4), owner),
        ]);
        if (!newer || !('svg' in newer)) fail('layout', 'the newer drawing laid out', newer);
        if (older !== null && !('svg' in older)) fail('layout', 'the older null or laid out', older);
      },
    },
  ];
}

/** The links' checks: found from the card's note, created, and opened once. */
function linkChecks(make: () => ServicesUnderTest): ContractCheck[] {
  return [
    {
      name: 'a card’s links are found from its note, and a note a link creates is found after',
      run: async () => {
        const { host } = make();
        const links = host.links('Plans/Today.md', 'g');
        if (links.path !== 'Plans/Today.md') fail('links', 'the path of the card’s note', links.path);
        const before: unknown = links.found('A new idea');
        if (typeof before !== 'boolean') fail('links', 'found as true or false', before);
        if ((await links.create('A new idea')) && !links.found('A new idea'))
          fail('links', 'the note it created found', false);
      },
    },
    {
      name: 'opening a link opens what it names, once',
      run: () => {
        const { host, probe } = make();
        host.links('Plans/Today.md', 'g').open(linkTo('Budget'));
        if (JSON.stringify(probe.opened()) !== '["Budget"]') fail('links', '["Budget"]', probe.opened());
      },
    },
  ];
}
