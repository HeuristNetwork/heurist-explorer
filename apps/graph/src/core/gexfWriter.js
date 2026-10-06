/**
 * @file gexfWriter.js
 * @brief GEXF 1.2 (Gephi) text of the graph shown in the Graph module.
 *
 * Same attribute layout as the server export (srv/Records/Export/Writer/GexfExportWriter.php,
 * plan 13) and the legacy ExportRecordsGEPHI:
 *   node attributes  0 name, 1 image, 2 rectype, 3 count, 4 url
 *   edge attributes  0 relation-id, 1 relation-name, 2 relation-image, 3 relation-count,
 *                    4 relation-start, 5 relation-end
 * One edge per source-target pair; relation-id is the relationship type term id, else
 * the pointer field id.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/**
 * GEXF document of records and edges.
 *
 * @param {object} graph Graph content.
 * @param {Array<{id:number,recordTypeId:?number,title:string}>} graph.records Nodes.
 * @param {Array<{from:number,to:number,fieldId:?number,relationshipId:?number}>} graph.edges Edges.
 * @param {object} [options] Names and links.
 * @param {Map<number,string>} [options.fields] Pointer field names by id.
 * @param {Map<number,string>} [options.relationTypes] Relationship type labels by term id.
 * @param {string} [options.baseUrl] Heurist base URL (record and icon links).
 * @param {string} [options.database] Database name.
 * @param {string} [options.description] Description in the GEXF meta.
 * @param {Date} [options.date] Date of the export (tests).
 * @returns {string} GEXF XML.
 */
export function buildGexf(graph, options = {}) {
  const records = Array.isArray(graph?.records) ? graph.records : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const fields = options.fields instanceof Map ? options.fields : new Map();
  const relationTypes = options.relationTypes instanceof Map ? options.relationTypes : new Map();
  const base = String(options.baseUrl || '').replace(/\/+$/, '');
  const db = encodeURIComponent(options.database || '');
  const recordUrl = (id) => (base ? `${base}/?db=${db}&recID=${id}` : '');
  const iconUrl = (rty) => (base && rty ? `${base}/?db=${db}&icon=${rty}` : '');
  const date = (options.date || new Date()).toISOString().slice(0, 10);

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gexf xmlns="http://www.gexf.net/1.2draft" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
      + 'xsi:schemaLocation="http://www.gexf.net/1.2draft http://www.gexf.net/1.2draft/gexf.xsd" version="1.2">',
    `<meta lastmodifieddate="${date}"><creator>HeuristNetwork.org</creator>`
      + `<description>${escapeXml(options.description || `Visualisation export ${options.database || ''}`.trim())}</description></meta>`,
    '<graph mode="static" defaultedgetype="directed">',
    '<attributes class="node"><attribute id="0" title="name" type="string"/><attribute id="1" title="image" type="string"/>'
      + '<attribute id="2" title="rectype" type="string"/><attribute id="3" title="count" type="float"/>'
      + '<attribute id="4" title="url" type="string"/></attributes>',
    '<attributes class="edge"><attribute id="0" title="relation-id" type="float"/>'
      + '<attribute id="1" title="relation-name" type="string"/><attribute id="2" title="relation-image" type="string"/>'
      + '<attribute id="3" title="relation-count" type="float"/><attribute id="4" title="relation-start" type="string"/>'
      + '<attribute id="5" title="relation-end" type="string"/></attributes>',
    '<nodes>'
  ];

  const ids = new Set();
  for (const record of records) {
    const id = Number(record.id);
    if (!(id > 0) || ids.has(id)) continue;
    ids.add(id);
    const name = escapeXml(record.title || '');
    const rty = Number(record.recordTypeId) || '';
    lines.push(`<node id="${id}" label="${name}"><attvalues><attvalue for="0" value="${name}"/>`
      + `<attvalue for="1" value="${escapeXml(iconUrl(rty))}"/><attvalue for="2" value="${rty}"/>`
      + `<attvalue for="3" value="0"/><attvalue for="4" value="${escapeXml(recordUrl(id))}"/></attvalues></node>`);
  }
  lines.push('</nodes>', '<edges>');

  const pairs = new Set();
  let count = 0;
  for (const edge of edges) {
    const from = Number(edge.from);
    const to = Number(edge.to);
    const pair = `${from}:${to}`;
    if (!ids.has(from) || !ids.has(to) || pairs.has(pair)) continue;
    pairs.add(pair);
    const relationType = Number(edge.relationshipId) || 0;
    const fieldId = Number(edge.fieldId) || 0;
    const relationId = relationType || fieldId;
    const relationName = relationType
      ? relationTypes.get(relationType) || `Relationship ${relationType}`
      : fieldId ? fields.get(fieldId) || `Field ${fieldId}` : 'Floating relationship';
    const name = escapeXml(relationName);
    count += 1;
    lines.push(`<edge id="${count}" source="${from}" target="${to}" weight="1" label="${name}"><attvalues>`
      + `<attvalue for="0" value="${relationId}"/><attvalue for="1" value="${name}"/>`
      + '<attvalue for="3" value="1"/></attvalues></edge>');
  }
  lines.push('</edges>', '</graph>', '</gexf>');
  return lines.join('\n');
}

/** Escape text for XML attributes and content (control characters removed). */
export function escapeXml(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
