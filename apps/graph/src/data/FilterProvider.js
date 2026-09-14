/**
 * @file FilterProvider.js
 * @brief Loads saved filters exposed as OpenAPI system entities.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
/** Provides normalized saved-filter definitions. */
export class FilterProvider {
  constructor({ apiClient, fields = [] }) {
    this.apiClient = apiClient;
    this.fields = fields;
  }

  /** List saved filters, optionally restricted by IDs and fields. */
  async list({ ids = null, fields = this.fields, signal } = {}) {
    const normalizedIds = normalizeIds(ids);
    const systemQuery = { t: "filter", filterType: "filter" };
    if (normalizedIds.length) systemQuery.ids = normalizedIds.join(",");
    const query = { q: JSON.stringify(systemQuery) };
    const requestedFields = normalizeFields(fields);
    if (requestedFields.length) query.fields = requestedFields.join(",");
    const payload = await this.apiClient.get("/sys", {
      query,
      signal,
    });
    const source = Array.isArray(payload)
      ? payload
      : payload?.items || payload?.filters || payload?.records || [];
    return source.map(normalizeFilter).filter(Boolean);
  }

  /** Load one saved filter by positive numeric ID. */
  async load(id, { signal } = {}) {
    const filterId = Number(id);
    if (!Number.isInteger(filterId) || filterId < 1)
      throw new TypeError("Filter id must be a positive integer");
    const value = await this.apiClient.get(`/sys/filter/${filterId}`, {
      signal,
    });
    return normalizeFilter(value);
  }
}

function normalizeFilter(value) {
  const id = Number(
    value?.id ?? value?.filter_ID ?? value?.svs_ID ?? value?.rec_ID,
  );
  if (!Number.isInteger(id) || id < 1) return null;
  const query = detailValue(value?.details, "query") ?? value?.query ?? null;
  const filterType =
    detailValue(value?.details, "filterType") ?? value?.filterType ?? null;
  return {
    id,
    title: String(value.title ?? value.rec_Title ?? `Filter ${id}`),
    query,
    filterType,
    raw: value,
  };
}

function detailValue(details, field) {
  const values = details?.[field];
  if (!Array.isArray(values) || !values.length) return null;
  return values[0]?.value ?? null;
}

function normalizeFields(value) {
  const fields = Array.isArray(value) ? value : String(value || "").split(",");
  return [
    ...new Set(fields.map((field) => String(field).trim()).filter(Boolean)),
  ];
}

function normalizeIds(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  const ids = values.map(Number);
  if (ids.some((id) => !Number.isInteger(id) || id < 1)) {
    throw new TypeError("Filter IDs must be positive integers");
  }
  return [...new Set(ids)];
}
