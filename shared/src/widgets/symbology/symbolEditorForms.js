/**
 * @file symbolEditorForms.js
 * @brief HEditForm definitions (plan 14a JSON) of the map symbol editor, one per
 *        mode: symbol, range, gradient, draw (plan 17 §3). Each group has a `slot`
 *        where HSymbolEditor draws its preview.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

const YES_NO = [{ id: true, label: 'Yes' }, { id: false, label: 'No' }];
const NUMBER_WIDTH = '7em';
const OPACITY = { type: 'float', minValue: 0, maxValue: 1, step: 0.1, width: NUMBER_WIDTH };
const OPACITY_HELP = 'Value from 0 (transparent) to 1 (opaque)';

/** Symbols, Outline, Area fill (symbol and range modes). */
const SYMBOL_GROUPS = [
  {
    id: 'symbols', type: 'group', label: 'Symbols', slot: 'preview-point', children: [
      {
        name: 'iconType', type: 'enum', label: 'Icon source', mode: 'radio', help: 'Type and source of the icon',
        terms: [
          { id: 'url', label: 'Image' }, { id: 'iconfont', label: 'Icon font' },
          { id: 'circle', label: 'Circle' }, { id: 'rectype', label: 'Record type icon' }
        ]
      },
      { name: 'iconUrl', type: 'url', label: 'Icon URL', showWhen: { iconType: 'url' } },
      {
        name: 'iconFont', type: 'freetext', label: 'Icon', showWhen: { iconType: 'iconfont' },
        help: 'Name of an icon of Font Awesome (e.g. fa-house) or of the jQuery UI icon font (e.g. location)'
      },
      { name: 'iconSize', type: 'integer', label: 'Icon size', minValue: 0, width: NUMBER_WIDTH, help: 'Icon size in pixels' }
    ]
  },
  {
    id: 'outline', type: 'group', label: 'Outline', slot: 'preview-line', children: [
      { name: 'stroke', type: 'enum', label: 'Stroke', mode: 'radio', terms: YES_NO, help: 'Draw the outline of points, lines and areas' },
      { name: 'color', type: 'color', label: 'Stroke color' },
      { name: 'weight', type: 'float', label: 'Stroke width', minValue: 0, step: 1, width: NUMBER_WIDTH, help: 'Stroke width in pixels' },
      { name: 'dashArray', type: 'freetext', label: 'Dash array', help: 'Stroke dash pattern, e.g. 5, 5 (SVG stroke-dasharray)' },
      { name: 'opacity', label: 'Stroke opacity', ...OPACITY, help: OPACITY_HELP }
    ]
  },
  {
    id: 'fill', type: 'group', label: 'Area fill', slot: 'preview-polygon', children: [
      { name: 'fill', type: 'enum', label: 'Fill', mode: 'radio', terms: YES_NO, help: 'Fill areas and circles with colour' },
      { name: 'fillColor', type: 'color', label: 'Fill color', help: 'Defaults to the stroke color' },
      { name: 'fillOpacity', label: 'Fill opacity', ...OPACITY, help: OPACITY_HELP }
    ]
  }
];

/** From/to pairs in two columns (gradient mode). */
const GRADIENT_GROUPS = [
  {
    id: 'gradient', type: 'group', label: 'Gradient', slot: 'preview-gradient', columns: 2, children: [
      { name: 'strokeColor1', type: 'color', label: 'Stroke color from' },
      { name: 'strokeColor2', type: 'color', label: 'to' },
      { name: 'strokeOpacity1', label: 'Stroke opacity from', ...OPACITY },
      { name: 'strokeOpacity2', label: 'to', ...OPACITY },
      { name: 'fillColor1', type: 'color', label: 'Fill color from' },
      { name: 'fillColor2', type: 'color', label: 'to' },
      { name: 'fillOpacity1', label: 'Fill opacity from', ...OPACITY },
      { name: 'fillOpacity2', label: 'to', ...OPACITY },
      { name: 'iconSize1', type: 'integer', label: 'Icon size from', minValue: 0, width: NUMBER_WIDTH },
      { name: 'iconSize2', type: 'integer', label: 'to', minValue: 0, width: NUMBER_WIDTH }
    ]
  }
];

/** Drawing style of the Map module (draw mode). */
const DRAW_GROUPS = [
  {
    id: 'draw', type: 'group', label: 'Drawing style', slot: 'preview-shapes', children: [
      { name: 'color', type: 'color', label: 'Stroke color' },
      { name: 'weight', type: 'integer', label: 'Stroke width', minValue: 0, width: NUMBER_WIDTH, help: 'Stroke width in pixels' },
      { name: 'opacity', label: 'Stroke opacity', ...OPACITY, help: OPACITY_HELP },
      { name: 'fillColor', type: 'color', label: 'Fill color', help: 'Defaults to the stroke color' },
      { name: 'fillOpacity', label: 'Fill opacity', ...OPACITY, help: OPACITY_HELP }
    ]
  }
];

/** The legend caption of a thematic range (range mode, above the symbol groups). */
const CAPTION_GROUP = {
  id: 'caption', type: 'group', label: null, children: [{ name: 'legendLabel', type: 'freetext', label: 'Legend caption' }]
};

/** Fields whose Yes/No value is a boolean. */
export const BOOLEAN_FIELDS = Object.freeze(['stroke', 'fill']);

/**
 * The form of a symbol editor mode.
 *
 * @param {'symbol'|'range'|'gradient'|'draw'} mode Editor mode.
 * @returns {object} HEditForm JSON (a fresh copy).
 */
export function symbolEditorForm(mode) {
  const groups = mode === 'gradient' ? GRADIENT_GROUPS
    : mode === 'draw' ? DRAW_GROUPS
      : mode === 'range' ? [CAPTION_GROUP, ...SYMBOL_GROUPS] : SYMBOL_GROUPS;
  return structuredClone({ format: 'heurist-edit-form/1', groups });
}
