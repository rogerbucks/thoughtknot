// The tables a graph's data sets show (editor spec §67, format_content_node). Each `DataSet` thing's table is read
// from its place by the host, as a CSV. Kept apart from table-source.ts so the drawing never imports the CSV reader.
import type { Graph } from '@thoughtknot/graph-spec';
import { readCsv } from './csv-read.ts';
import { dataSetsOf } from './data-set-reference.ts';
import type { NodeTable } from './table-node.ts';

/**
 * The tables of a graph's data sets, by thing id, each read by `read` from its place. A place that cannot be read, or
 * is no table, shows none: its box keeps its name, and the problem is the source's to say.
 */
export async function dataSetTables(
  graph: Graph | undefined,
  read: (place: string) => Promise<string | null>,
): Promise<[string, NodeTable][]> {
  const refs = graph ? dataSetsOf(graph) : [];
  const read1 = async (id: string, place: string): Promise<[string, NodeTable][]> => {
    const text = await read(place);
    const table = text === null ? null : readCsv(place, text);
    return table && 'header' in table ? [[id, { header: table.header, rows: table.rows }]] : [];
  };
  return (await Promise.all(refs.map((r) => read1(r.id, r.place)))).flat();
}
