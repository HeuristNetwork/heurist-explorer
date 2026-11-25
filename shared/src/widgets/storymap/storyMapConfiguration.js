/**
 * @file storyMapConfiguration.js
 * @brief Configuration entry of the story map for its publication from Explorer (plan 29 shape, 27q3 §12 review
 *        2026-11-25): the story map and *Publish to*. The page gets the website element Story map with the story topic
 *        chosen in Show for and its own map: `{preset, topic, ownMap: true}` (siteStoryMap.js).
 *
 * Lists of the form (`termsSource`): `storyMapPresets` (the story maps).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

const form = Object.freeze({
  format: 'heurist-edit-form/1',
  groups: [
    {
      id: 'source',
      label: 'Story map',
      children: [
        { name: 'preset', type: 'enum', label: 'Story map', mode: 'select', max: 1, req: 'required', termsSource: 'storyMapPresets',
          help: 'Public story maps can be seen by visitors' }
      ]
    }
  ]
});

/** @returns {object} Settings of a new publication. */
function defaults() {
  return { preset: null };
}

/**
 * Settings of the website element from any input.
 *
 * @param {object} value
 * @returns {{preset: number|null, topic?: number, ownMap?: boolean}}
 */
function normalize(value) {
  const input = value && typeof value === 'object' ? value : {};
  const one = (item) => Number([item].flat()[0]);
  const preset = one(input.preset);
  const topic = one(input.topic);
  return {
    preset: preset > 0 ? preset : null,
    ...(topic > 0 ? { topic } : {}),
    ...(input.ownMap === true ? { ownMap: true } : {})
  };
}

/** @returns {object} The stored settings. */
function serialize(settings) {
  return normalize(settings);
}

/**
 * The page: the story map, the story topic of Explorer (`publication.topic`) and its own map and timeline.
 *
 * @param {{settings?: object, values?: object, publication?: {presetId?: number, topic?: number}|null}} options
 * @returns {{settings: object, state: null}}
 */
function preparePublication({ settings, values = null, publication = null }) {
  const value = normalize({ ...(settings || {}), ...(values || {}) });
  // the topic belongs to the story map it was chosen for: another story map in the form starts without one
  const same = !Number(publication?.presetId) || Number(publication.presetId) === value.preset;
  const topic = same ? Number(publication?.topic) || 0 : 0;
  return {
    settings: { preset: value.preset, ...(topic > 0 ? { topic } : {}), ownMap: true },
    state: null
  };
}

/** The configuration of the story map publication: form JSON, defaults, normalizer, serializer, publication. */
export const storyMapConfiguration = Object.freeze({
  type: 'storymap',
  form,
  defaults,
  normalize,
  serialize,
  preparePublication
});
