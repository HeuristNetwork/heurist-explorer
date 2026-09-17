import { HFieldSelectionEditor } from './HFieldSelectionEditor.js';

/** Direct/linked date and year field selector used by Timeline Query Source profile. */
export class HTimeFieldSelector extends HFieldSelectionEditor {
  constructor(options = {}) {
    super({ ...options, title: 'Time fields', selectableTypes: ['date', 'year'], hideUnselectable: true, allowReorder: false, showSort: false });
  }
}
