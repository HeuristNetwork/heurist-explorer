/**
 * @file insertFieldsDialog.js
 * @brief "Inserting fields in report" dialog of the template editor: one dialog
 *        for all marked fields. It shows the field to insert and the insert
 *        options; Insert field and Skip move to the next field, Insert all
 *        inserts the remaining ones, Cancel stops. It closes when every field
 *        is processed (port of the legacy reportEditor._insertFields loop).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-reports
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { $HR, HMsg } from '#shared/ui';

const DIALOG_ID = 'h-reports-insert-fields';

/** Insert options (legacy insert-popup2). */
export const INSERT_OPTIONS = [
  ['ifnull', 'Test if value exists (if...)'],
  ['insLineBreak', 'Include line break'],
  ['addCaption', 'Precede with field name'],
  ['addLoop', 'Loop for repeating/multiple values in field'],
  ['addRemark', 'Field name as comment'],
  ['addWrap', 'Wrapper e.g. <img> tags (always applied to media)']
];

/** Options a relationship does not have (legacy: no loop, line break or wrapper). */
const RELATIONSHIP_HIDDEN = ['insLineBreak', 'addLoop', 'addWrap'];

/**
 * Ask for the insert options of each field, one field after the other.
 *
 * @param {object} params
 * @param {Array<object>} params.items Fields to insert: `{label, remark, segments}`.
 * @param {object} params.options Initial insert options.
 * @param {function(object): boolean} params.isRepeatable Whether the field of an item repeats.
 * @param {function(object, object): void} params.onInsert Insert one item with options.
 * @param {function(Array<object>, object): void} params.onInsertAll Insert the remaining items with options.
 * @returns {Promise<object>} The last options used (unchanged when nothing was inserted).
 */
export function openInsertFieldsDialog({ items, options, isRepeatable, onInsert, onInsertAll }) {
  return new Promise((resolve) => {
    let index = 0;
    let current = { ...options };
    let settled = false;

    const form = document.createElement('form');
    form.className = 'h-reports-form h-reports-insert-form';
    const heading = document.createElement('div');
    heading.className = 'h-reports-form-row h-muted';
    const name = document.createElement('strong');
    form.append(heading);
    const boxes = new Map();
    const rows = new Map();
    for (const [option, label] of INSERT_OPTIONS) {
      const row = document.createElement('div');
      row.className = 'h-reports-form-row h-reports-form-checkbox';
      const wrap = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'h-checkbox';
      box.name = option;
      const caption = document.createElement('span');
      caption.className = 'h-reports-form-label';
      caption.textContent = $HR(label);
      wrap.append(box, caption);
      row.append(wrap);
      form.append(row);
      boxes.set(option, box);
      rows.set(option, row);
    }
    const note = document.createElement('div');
    note.className = 'h-reports-form-row h-muted';
    note.textContent = $HR('Insert all applies these settings to the remaining fields but does not change those already inserted.');
    form.append(note);

    /** Options of the shown field; a repeatable field always loops (not remembered). */
    const read = () => {
      const values = {};
      for (const [option, box] of boxes) values[option] = box.checked === true;
      values.addLoop = values.addLoop && !boxes.get('addLoop').disabled;
      return values;
    };

    /** Show the field at `index`, keeping the options chosen so far. */
    const show = () => {
      const item = items[index];
      const repeatable = isRepeatable(item);
      const relationship = item.segments[0]?.kind === 'relationship';
      heading.replaceChildren(`${$HR('Inserting')} (${index + 1}/${items.length}): `, name);
      name.textContent = item.remark || item.label;
      for (const [option, box] of boxes) {
        rows.get(option).hidden = relationship && RELATIONSHIP_HIDDEN.includes(option);
        box.checked = option === 'addLoop' ? repeatable || current.addLoop === true : current[option] === true;
        box.disabled = option === 'addLoop' && repeatable;
      }
      note.hidden = index === items.length - 1;
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      HMsg.closeMsgDlg(DIALOG_ID);
      resolve(current);
    };

    /** Move to the next field, or close after the last one. */
    const next = () => {
      index++;
      if (index >= items.length) finish();
      else show();
    };

    const insert = () => {
      current = { ...current, ...read() };
      onInsert(items[index], read());
      next();
    };

    const insertAll = () => {
      current = { ...current, ...read() };
      onInsertAll(items.slice(index), read());
      finish();
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      insert();
    });

    show();
    const dialog = HMsg.showMsgDlg(form, {
      dialogId: DIALOG_ID,
      title: 'Inserting fields in report',
      buttons: [
        { label: 'Insert field', class: 'h-btn h-btn-primary', onClick: insert },
        { label: 'Insert all', class: 'h-btn', onClick: insertAll },
        { label: 'Skip', class: 'h-btn', onClick: next },
        { label: 'Cancel', class: 'h-btn', onClick: finish }
      ]
    });
    dialog.addEventListener('close', finish, { once: true });
  });
}
