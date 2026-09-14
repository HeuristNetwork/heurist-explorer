import { HMsg, $HR } from '#shared/ui';
import { showTimelineMessage } from './timelineMessages.js';

/** Edit the display settings supported by the timeline engine. */
export class TimelineConfigurationDialog {
  constructor({ api }) { this.api = api; }
  open() {
    if (this.dialog) return this;
    const dialog = document.createElement('dialog');
    dialog.className = 'h-dialog';
    dialog.setAttribute('aria-label', $HR('Timeline options'));
    const header = document.createElement('header');
    header.className = 'h-dialog-header';
    const title = document.createElement('h2');
    title.className = 'h-dialog-title';
    title.textContent = $HR('Timeline options');
    const close = this.button('×', () => this.cancel(), 'h-dialog-close');
    close.setAttribute('aria-label', $HR('Close'));
    header.append(title, close);
    const form = document.createElement('form');
    const body = document.createElement('div');
    body.className = 'h-dialog-body h-stack';
    body.style.gap = 'var(--h-gap)';
    this.fields = new Map();
    const options = this.api.getState().options;
    for (const [name, caption, choices] of [
      ['labelMode', 'Labels', [['full', 'Full'], ['truncate', 'Truncate'], ['hidden', 'Hidden']]],
      ['labelPosition', 'Label position', [['bar', 'Within bar'], ['above', 'Above bar']]],
      ['orientation', 'Time axis', [['both', 'Top and bottom'], ['top', 'Top'], ['bottom', 'Bottom']]]
    ]) {
      const row = document.createElement('label');
      row.className = 'h-inline';
      const label = document.createElement('span'); label.textContent = $HR(caption);
      const control = document.createElement('select'); control.className = 'h-select'; control.name = name;
      for (const [value, text] of choices) {
        const option = document.createElement('option'); option.value = value; option.textContent = $HR(text); control.append(option);
      }
      control.value = options[name];
      this.fields.set(name, control); row.append(label, control); body.append(row);
    }
    const row = document.createElement('label'); row.className = 'h-inline';
    const stack = document.createElement('input'); stack.type = 'checkbox'; stack.className = 'h-checkbox'; stack.checked = options.stack !== false;
    const label = document.createElement('span'); label.textContent = $HR('Stack overlapping items');
    this.fields.set('stack', stack); row.append(stack, label); body.append(row);
    const footer = document.createElement('footer'); footer.className = 'h-dialog-footer';
    this.saveButton = this.button('Apply', () => {}, 'h-btn h-btn-primary'); this.saveButton.type = 'submit';
    footer.append(this.button('Cancel', () => this.cancel()), this.saveButton);
    form.append(body, footer); dialog.append(header, form);
    form.addEventListener('submit', event => { event.preventDefault(); void this.save(); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); this.cancel(); });
    this.dialog = dialog;
    this.initialState = JSON.stringify(this.getValue());
    document.body.append(dialog); dialog.showModal();
    return this;
  }
  button(text, handler, classes = 'h-btn') {
    const button = document.createElement('button'); button.type = 'button'; button.className = classes;
    button.textContent = $HR(text); button.addEventListener('click', handler); return button;
  }
  getValue() { return Object.fromEntries([...this.fields].map(([name, control]) => [name, control.type === 'checkbox' ? control.checked : control.value])); }
  async save() {
    if (this.saving) return false;
    this.saving = true;
    this.saveButton.disabled = true;
    try { await this.api.applyOptions(this.getValue()); this.close(); return true; }
    catch (error) { showTimelineMessage(error, { error: true, title: 'Timeline configuration error' }); return false; }
    finally { this.saving = false; this.saveButton.disabled = false; }
  }
  cancel() {
    if (this.saving) return false;
    if (JSON.stringify(this.getValue()) !== this.initialState) {
      if (this.discardDialog?.open) return false;
      this.discardDialog = HMsg.showMsgDlg('Discard changes to timeline configuration?', {
        title: 'Discard changes', dialogId: 'heurist-timeline-discard-changes', buttons: [
          { label: 'Keep editing', class: 'h-btn', onClick: () => this.discardDialog.close() },
          { label: 'Discard changes', class: 'h-btn h-btn-danger', onClick: () => this.close() }
        ]
      });
      return false;
    }
    this.close(); return true;
  }
  close() {
    this.discardDialog?.close(); this.dialog?.close(); this.dialog?.remove(); this.dialog = null;
  }
}
