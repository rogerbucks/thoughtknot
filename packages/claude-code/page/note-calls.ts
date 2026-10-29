// The page's calls that follow and write the note (spec §26, cc_claude_proposes), apart from `server-calls.ts`, whose
// calls only read. The user's decision on a proposal is written here. It writes the whole note, against the version the
// page last had. It uses the page's own token, which is the only key that writes. The server compares the version under
// its lock and refuses a stale one (409), keeping what was sent as a draft. Claude's key reaches no route this file
// calls.
import { word } from '../../core/src/words.ts';
import { whyOf } from '../src/api-types.ts';
import type { FollowLine, StaleWrite, WriteReply } from '../src/api-types.ts';

export type { FollowLine };

/**
 * What a write came to: the note's new version, or why nothing was written. That is the server's status. For a stale
 * write (409), it is also the note as it now is. The server keeps what was sent as a draft.
 */
export type Written =
  | { ok: true; version: string }
  | { ok: false; why: string; status: number; theirs?: { text: string; version: string } };

/** The page's calls on one note, with `token` held in them. */
export function noteCalls(token: string, fetcher: typeof fetch) {
  const authorization = `Bearer ${token}`;
  return {
    /** Writes `text` as the note, if it is still `version`. */
    write: async (id: string, text: string, version: string): Promise<Written> => {
      const reply = await fetcher(`/api/notes/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { authorization, 'if-match': version, 'content-type': 'text/plain; charset=utf-8' },
        body: text,
      });
      if (reply.ok) return { ok: true, version: ((await reply.json()) as WriteReply).version };
      // every refusal is JSON with the server's why; a stale write (409) also holds the note as it now is
      const body = (await reply.json().catch(() => null)) as Partial<StaleWrite> | null;
      const theirs = reply.status === 409 && body?.text !== undefined && body.version !== undefined ? body : null;
      return {
        ok: false,
        status: reply.status,
        ...(theirs ? { theirs: { text: theirs.text as string, version: theirs.version as string } } : {}),
        why:
          reply.status === 409
            ? word('page.changed-while-deciding')
            : (whyOf(body) ?? word('page.write-refused', { status: reply.status })),
      };
    },
    /** Keeps what was typed as the note's draft, outside the vault; an empty text clears it. Resolves to whether it was kept. */
    keepDraft: async (id: string, text: string, version: string): Promise<boolean> => {
      const reply = await fetcher(`/api/notes/${encodeURIComponent(id)}/draft`, {
        method: 'PUT',
        headers: { authorization, 'if-match': version, 'content-type': 'text/plain; charset=utf-8' },
        body: text,
      });
      return reply.ok;
    },
    /** The change stream: the note now and each change after it, a line of JSON each, until either side ends it. */
    follow: async (id: string, onLine: (line: FollowLine) => void): Promise<void> => {
      const reply = await fetcher(`/api/notes/${encodeURIComponent(id)}/events`, { headers: { authorization } });
      if (!reply.ok || !reply.body) return;
      const reader = reply.body.getReader();
      const decoder = new TextDecoder();
      let held = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        held += decoder.decode(value, { stream: true });
        for (let end = held.indexOf('\n'); end >= 0; end = held.indexOf('\n')) {
          const line = held.slice(0, end);
          held = held.slice(end + 1);
          if (line.trim()) onLine(JSON.parse(line) as FollowLine);
        }
      }
    },
  };
}
