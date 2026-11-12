// The names the core's entry exports for tables of data (editor spec §63, CN2; §52, E1). A CSV file is read through
// its connector and the mapping written beside it. Kept apart from index.ts so each file stays short.
export { tableConnector, tableStatements } from './csv-connector.ts';
export { kindOf as tableKindOf, mappingOf, mappingPlace, mappingText, proposeMapping } from './csv-mapping.ts';
export type { ColumnMap, ColumnRole, TableMapping } from './csv-mapping.ts';
export { CSV_LIMITS, readCsv } from './csv-read.ts';
export type { CsvLimits, CsvRefusal, CsvTable } from './csv-read.ts';
export { tableMeasures } from './csv-measures.ts';
export { dataSetTables } from './data-set-tables.ts';
export { dataSetsOf } from './data-set-reference.ts';
export { keptOf, keptWords, linkEdit, snapshotEdit, snapshotPlace } from './data-set-kept.ts';
export type { KeptEdit, KeptSet } from './data-set-kept.ts';
export { pickedLinks, pickedThings } from './db-import.ts';
export { databasePlace, workbookPlace } from './sources.ts';
export { workbookSheets, workbookTable, WORKBOOK_LIMITS } from './xlsx-read.ts';
export type { WorkbookRefusal } from './xlsx-read.ts';
export { columnsOf, sqliteEntries, sqliteTable, SQLITE_LIMITS } from './sqlite-read.ts';
export type { SqliteEntry, SqliteRefusal, SqliteTable, SqliteValue } from './sqlite-read.ts';
export * from './index-board.ts';
// a graph composed out into a document, and an HTML file read safely (editor spec §67, DF1)
export { COMPOSE_EXPORTS, composedExport, type ComposedExport } from './export-data.ts';
export { COMPOSE_FORMATS, composeOut, isComposeFormat, type ComposeFormat, type Composed } from './compose-out.ts';
export { htmlAsText, htmlToGql, readHtml, type HtmlRead } from './html-read.ts';
// an outside data set, fetched only when asked, from the sources picked (editor spec §52, data_set_access)
export { fetchDataSet, placeProblem, type DataSetAccess, type Fetched, type HostFetch } from './data-set-access.ts';
