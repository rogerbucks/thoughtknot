// The names the core's entry exports for filters and queries saved by name (editor spec ES§25 and ES§75). Kept apart from
// index-late.ts so each file stays short.
export { namedFilterRemoved, namedFiltersOf, type NamedFilterSave, type NamedFilters } from './filter-named.ts';
// queries saved by name, opened, asked again and kept on the device (ES§75)
export { type SavedQueries, type SavedQuery, type SavedQuerySave } from './filter-manage.ts';
export { savedQueryRemove, savedQueryRenamed, savedQueryWritten } from './filter-manage-note.ts';
export { queryCache, type DeviceStore } from './filter-cache.ts';
export { queryFitless } from './filter-fuzzy.ts';
