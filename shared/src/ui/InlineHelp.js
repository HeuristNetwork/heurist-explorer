/**
 * InlineHelp.js - Full-viewport inline user manual viewer
 *
 * Loads `{moduleName}UserManual{Lang}.htm` from the module's own public/
 * directory into an iframe. Each consuming module supplies its own manual
 * files; this component only knows the naming convention and overlay chrome.
 *
 * @project     Heurist academic knowledge management system
 * @package     client-core.ui
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */
import { HMsg } from './HMsg.js';
import { $HR, getActiveLanguage, getAssetBaseUrl } from './i18n/HResource.js';

let helpDialogSeq = 0;

export class InlineHelp {
  /**
   * @param {{parent?:Element, moduleName:string, fileBase?:string, baseUrl?:string}} options
   *   `fileBase` overrides the `{moduleName}UserManual` file-name prefix for
   *   manuals that don't follow that convention (e.g. topic-specific help
   *   pages shared across modules). `baseUrl` overrides where the manual is
   *   fetched from; omit it to use this document's own asset base (the normal
   *   case). A host opening another module's manual on its behalf - e.g.
   *   heurist-explorer hosting heurist-map's help - must pass that module's
   *   own asset base explicitly, since it lives in a different bundle.
   */
  constructor({ parent = null, moduleName, fileBase = null, baseUrl = null } = {}) {
    if (!moduleName) throw new Error('InlineHelp requires a moduleName');
    this.moduleName = moduleName;
    this.fileBase = fileBase || `${moduleName}UserManual`;
    this.baseUrl = baseUrl;
    this.parent = parent;
    this.dialogId = `dialog-inline-help-${++helpDialogSeq}`;
    this.dlg = null;
  }

  open() {
    const dlg = HMsg.getMsgDlg(this.dialogId);
    (this.parent || document.body).append(dlg);
    dlg.classList.add('h-dialog-fullscreen');

    const title = dlg.querySelector('.h-dialog-title');
    title.textContent = $HR('Help');
    dlg.querySelector('.h-dialog-footer').hidden = true;

    const body = dlg.querySelector('.h-dialog-body');
    body.classList.add('h-dialog-body-flush');
    body.replaceChildren();

    const frame = document.createElement('iframe');
    frame.className = 'h-dialog-iframe';
    frame.src = this.manualUrl();
    frame.title = $HR('Help');
    body.append(frame);

    this.dlg = dlg;
    dlg.showModal();
  }

  close() {
    this.dlg?.close();
  }

  manualUrl() {
    const language = getActiveLanguage();
    const suffix = language.charAt(0).toUpperCase() + language.slice(1);
    const base = String(this.baseUrl ?? getAssetBaseUrl() ?? '').replace(/\/+$/, '');
    return `${base}/${this.fileBase}${suffix}.htm`;
  }
}
