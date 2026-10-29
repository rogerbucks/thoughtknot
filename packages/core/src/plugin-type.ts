// The plug-in a diagram type or a layout is named under (editor spec §15, plugin_diagram_type_named). A layout a
// plug-in adds is named the same way (§68, layout_plugins). Host-free and pure.

/**
 * The plug-in a diagram type is named under, and the type's own word, or null when it is not one (§15,
 * plugin_diagram_type_named). A plug-in's type is its id, dotted lower-case words, then a dot and a word:
 * `acme.charts.sankey` is `sankey` of the plug-in `acme.charts`.
 */
export function pluginTypeOf(name: string): { plugin: string; word: string } | null {
  const at = name.lastIndexOf('.');
  const plugin = name.slice(0, at),
    own = name.slice(at + 1);
  return at > 0 && /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(plugin) && /^[a-z][a-z0-9-]*$/.test(own)
    ? { plugin, word: own }
    : null;
}
