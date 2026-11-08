// The words of the local MCP server, in UK English (editor spec §42, words_catalogue; §49, workstream Y2). Claude and the
// person read them in the chat: why a note or a call is refused, and what a tool did. cc-source-words.ts keeps them
// with the mod's other words.

/** The MCP server's words, by key, in UK English. */
export const MCP_SOURCE_WORDS = {
  'mcp.outside': 'Not read: {note} is not a note inside the folder this server was given.',
  'mcp.no-note': 'Not read: there is no note {note} in the folder this server was given.',
  'mcp.asked': 'The question is in front of the person. Their answer comes back in the conversation.',
  'mcp.no-tool': 'This server has no tool {name}.',
  'mcp.not-the-page': 'Refused: only the page, with the key it was given, answers a question or keeps a presentation.',
} as const;
