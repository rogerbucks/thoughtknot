// The names the core's entry exports for tables of data (editor spec §63, CN2; §52, E1). A CSV file is read through
// its connector and the mapping written beside it. Kept apart from index.ts so each file stays short.
export { tableConnector, tableStatements } from './csv-connector.ts';
export { kindOf as tableKindOf, mappingOf, mappingPlace, mappingText, proposeMapping } from './csv-mapping.ts';
export type { ColumnMap, ColumnRole, TableMapping } from './csv-mapping.ts';
export { CSV_LIMITS, readCsv } from './csv-read.ts';
export type { CsvLimits, CsvRefusal, CsvTable } from './csv-read.ts';
export { tableMeasures } from './csv-measures.ts';
