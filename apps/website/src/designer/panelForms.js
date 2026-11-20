/**
 * @file panelForms.js
 * @brief Forms of the CMS designer in a popup or in the element panel (plan 27n §6): the same form either waits for OK in
 *        a popup, or is shown in the Configuration tab of the panel, where each valid change is applied after a short
 *        pause. The fields of a form are in the sections Source, Presentation, Caption, Behaviour (HEditForm groups); the
 *        designer adds its own fields (Reveal into Presentation, the section Identification).
 *
 *   // in a widget form: one function for both places
 *   return showEditForm({ title, form, values, ... }, (values) => settingsOf(values), { inline, sections: {...} });
 *   // inline = {host, onResult(result), register(cleanup), common?: {fields, values, onChange, validate}}
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HMsg } from '#shared/ui';
import { HEditForm } from '#shared/widgets/edit-form/HEditForm.js';
import { openEditFormDialog } from '#shared/widgets/edit-form/editFormDialog.js';
import { formDialog } from './designerDialogs.js';
import { advancedShown, advancedSwitch } from './designerPanel.js';

/** Sections of a configuration (plan 27n §6), in this order; labels of the HEditForm groups. */
export const FORM_SECTIONS = Object.freeze([
  ['source', 'Source'], ['presentation', 'Presentation'], ['caption', 'Caption'], ['behaviour', 'Behaviour'],
  ['identification', 'Identification']
]);

/** Pause after the last change of an inline form before it is applied (ms). */
export const APPLY_DELAY = 400;

/**
 * The fields of one group in the sections of a configuration: the fields named in `sections` go to their section, the
 * others to Presentation; empty sections are left out.
 *
 * @param {Array<object>} children HEditForm fields.
 * @param {{source?: string[], caption?: string[], behaviour?: string[], identification?: string[], when?: object}} sections
 *        Field names; `when`: `showWhen` of a section by its id (Caption of the email form only for a button).
 * @param {{presentation?: Array<object>, identification?: Array<object>}} [extra] Fields of the designer added at the end of
 *        their section.
 * @param {{presentationSlot?: boolean}} [options] A slot at the end of Presentation (Reveal of the designer, review §21).
 * @returns {Array<object>} HEditForm groups (`type: 'group'`: a fieldset with its legend).
 */
export function sectionGroups(children, sections = {}, extra = {}, { presentationSlot = false } = {}) {
  const sectionOf = (name) => FORM_SECTIONS.find(([id]) => id !== 'presentation' && (sections[id] || []).includes(name))?.[0] || 'presentation';
  return FORM_SECTIONS.map(([id, label]) => ({
    id,
    type: 'group',
    label,
    ...(sections.when?.[id] ? { showWhen: sections.when[id] } : {}),
    ...(id === 'presentation' && presentationSlot ? { slot: PRESENTATION_SLOT } : {}),
    children: [...children.filter((field) => sectionOf(field.name) === id), ...(extra[id] || [])]
  })).filter((group) => group.children.length || group.slot);
}

/**
 * A field of a designer form without `req` is a basic one (review 27n §21): HEditForm counts a field without `req` as
 * optional, which the simple form would hide; only the fields marked `req: 'optional'` are advanced settings.
 */
function basicField(field) {
  return field && !field.req && field.required !== true ? { ...field, req: 'recommended' } : field;
}

/** The slot of the designer's Presentation block in an HEditForm configuration. */
const PRESENTATION_SLOT = 'h-cms-presentation';

/**
 * Show an HEditForm of the designer: a popup (OK / Cancel or own buttons) or, with `inline`, in a host of the element
 * panel: after each change and a pause, a valid form gives `map(values)` to `inline.onResult` (own buttons: `onAction`
 * of the first one runs first). `common` fields of the designer (names starting with `__`) are applied at once by
 * `common.onChange`, not by `map`; `common.presentationNode` goes to the end of Presentation. Fields with
 * `req: 'optional'` are advanced settings (review 27n §21): shown with `inline.advanced` (and `inline.onAdvanced`) or,
 * in a popup, with the choice of the panel (advancedShown).
 *
 * @param {object} options openEditFormDialog options (`form` with one group, or groups).
 * @param {(values: object) => (object|null|Promise<object|null>)} map The result of the values; null: nothing to apply.
 * @param {{inline?: object|null, sections?: object|null}} [place]
 * @returns {Promise<object|null>|HEditForm} The popup: the result (null: cancelled); inline: the form.
 */
export function showEditForm(options, map, { inline = null, sections = null } = {}) {
  const common = inline?.common || null;
  const groups = (options.form?.groups || []).map((group) => ({ ...group, children: (group.children || []).map(basicField) }));
  const children = groups.flatMap((group) => group.children);
  const node = common?.presentationNode || null;
  const extra = Object.fromEntries(Object.entries(common?.fields || {}).map(([id, list]) => [id, (list || []).map(basicField)]));
  const form = sections || common
    ? { ...options.form, groups: sectionGroups(children, sections || {}, extra, { presentationSlot: Boolean(node) }) }
    : { ...options.form, groups };
  if (!inline) {
    // a popup (a new element): compact inputs and its own switch of the advanced settings (review 27n §23.4)
    const offered = form.groups.some((group) => group.req === 'optional' || (group.children || []).some((field) => field.req === 'optional'));
    const onReady = (edit) => {
      edit.container?.classList?.add('h-cms-compact');
      if (offered) edit.container?.insertBefore?.(advancedSwitch((shown) => edit.setShowOptional(shown)), edit.container.firstChild || null);
      return options.onReady?.(edit);
    };
    return openEditFormDialog({ ...options, form, showOptional: advancedShown(), keepOptional: true, onReady })
      .then((result) => (result ? map(result) : null));
  }
  const { title, okLabel, cancelLabel, className, buttons, onAction, validate, onChange, values, ...formOptions } = options;
  let timer = null;
  let turn = 0;
  const own = (values) => Object.fromEntries(Object.entries(values).filter(([name]) => !name.startsWith('__')));
  const schedule = () => {
    globalThis.clearTimeout(timer);
    timer = globalThis.setTimeout(() => void run(), APPLY_DELAY);
  };
  const run = async () => {
    const current = ++turn;
    if (edit.validate().length) return;
    const values = own(edit.getValues());
    try {
      if (onAction && Array.isArray(buttons) && buttons.length && !(await onAction(buttons[0].id, values, edit))) return;
      const result = await map(onAction ? { action: buttons?.[0]?.id || 'ok', values } : values);
      if (result && current === turn) inline.onResult(result);
    } catch (error) {
      HMsg.showMsgErr?.(error?.message || String(error));
    }
  };
  const edit = new HEditForm().attach(inline.host, {
    ...formOptions,
    form,
    // advanced settings hidden keep their values (review 27n §21)
    showOptional: inline.advanced === true,
    keepOptional: true,
    values: { ...(values || {}), ...(common?.values || {}) },
    validate: (current, instance) => {
      const issues = [...(validate?.(own(current), instance) || []), ...(common?.validate?.(current) || [])];
      return issues.length ? issues : null;
    },
    onChange: (instance, change) => {
      void onChange?.(instance, change);
      if (String(change.name).startsWith('__')) {
        common?.onChange?.(change.name, change.value, instance);
        return;
      }
      schedule();
    }
  });
  // a control of the form outside HEditForm (the caption rows of media) tells its changes here
  edit.panelChanged = () => schedule();
  edit.render();
  // the Reveal block of the designer after the fields of Presentation
  const slot = node ? edit.getSlot(PRESENTATION_SLOT) : null;
  if (slot) {
    slot.append(node);
    slot.parentElement?.append(slot);
  }
  // a form without advanced settings does not follow the panel button (it is hidden then, plan 27n1 §6)
  const hasOptional = form.groups.some((group) => group.req === 'optional' || (group.children || []).some((field) => field.req === 'optional'));
  if (hasOptional) inline.onAdvanced?.((shown) => edit.setShowOptional(shown));
  inline.register?.(async () => {
    globalThis.clearTimeout(timer);
    await edit.destroy();
  });
  return edit;
}

/**
 * Show a form made of elements (formDialog): a popup with OK / Cancel, or with `inline` in a host of the element panel:
 * after an `input` / `change` in it (or `h-input-change`) and a pause, a non-null `read()` goes to `inline.onResult`. A
 * form whose content changes without such an event dispatches `change` on its element.
 *
 * @param {HTMLElement} content
 * @param {string} title
 * @param {() => (object|null|Promise<object|null>)} read The result; null: not valid (the form shows why).
 * @param {{inline?: object|null, className?: string, cleanup?: Function|null}} [options]
 * @returns {Promise<object|null>|HTMLElement} The popup: the result; inline: the content.
 */
export function showDomForm(content, title, read, { inline = null, className = '', cleanup = null } = {}) {
  if (!inline) {
    // the advanced settings (class h-cms-advanced-only) as chosen in the element panel (review 27n §21), with a switch
    // of its own; compact inputs (§23.4)
    content.classList.toggle('is-simple', !advancedShown());
    content.classList.add('h-cms-compact');
    if (content.querySelector('.h-cms-advanced-only')) {
      content.insertBefore(advancedSwitch((shown) => content.classList.toggle('is-simple', !shown)), content.firstChild || null);
    }
    const answer = formDialog(content, title, 'OK', read, null, className);
    return cleanup ? Promise.resolve(answer).finally(cleanup) : answer;
  }
  if (content.tagName === 'FORM') content.addEventListener('submit', (event) => event.preventDefault());
  let timer = null;
  let turn = 0;
  const run = async () => {
    const current = ++turn;
    try {
      const result = await read();
      if (result && current === turn) inline.onResult(result);
    } catch (error) {
      HMsg.showMsgErr?.(error?.message || String(error));
    }
  };
  const schedule = () => {
    globalThis.clearTimeout(timer);
    timer = globalThis.setTimeout(() => void run(), APPLY_DELAY);
  };
  for (const type of ['input', 'change', 'h-input-change']) content.addEventListener(type, schedule);
  inline.host.append(content);
  inline.register?.(async () => {
    globalThis.clearTimeout(timer);
    await cleanup?.();
  });
  return content;
}

/**
 * Tell an inline DOM form that its content changed (a row added, removed or moved): it is applied after the pause.
 *
 * @param {HTMLElement} content
 */
export function formChanged(content) {
  content?.dispatchEvent?.(new Event('change', { bubbles: true }));
}

/**
 * The title of a section of a form made of elements (Source, Presentation ...), as the legends of the HEditForm groups.
 *
 * @param {string} label Already translated.
 * @returns {HTMLElement}
 */
export function sectionTitle(label) {
  const title = document.createElement('div');
  title.className = 'h-cms-dom-section-title';
  title.textContent = label;
  return title;
}
