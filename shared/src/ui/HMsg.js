/**
 * @file HMsg.js
 * @brief Framework-independent message and modal dialog utilities using native <dialog>.
 * @package heurist-client-core
 */
import { $HR } from './i18n/index.js';

export class HMsg {
  static coverall = null;
  static coverallKeep = false;
  static _flashTimers = new Map();

  static getMsgDlg(dialogId = 'dialog-common-messages') {
    const id = String(dialogId || 'dialog-common-messages').replace(/^#/, '');
    let dlg = document.getElementById(id);
    if (dlg && dlg instanceof HTMLDialogElement) return dlg;
    if (dlg) dlg.remove();

    dlg = document.createElement('dialog');
    dlg.id = id;
    dlg.className = 'h-dialog';
    dlg.innerHTML = `
      <header class="h-dialog-header">
        <h2 class="h-dialog-title">Message</h2>
        <button type="button" class="h-dialog-close" data-role="close" aria-label="Close">×</button>
      </header>
      <div class="h-dialog-body"></div>
      <footer class="h-dialog-footer"></footer>`;
    dlg.querySelector('[data-role="close"]')?.addEventListener('click', () => dlg.close());
    dlg.addEventListener('cancel', (event) => {
      if (dlg.dataset.preventClose === 'true') event.preventDefault();
    });
    dlg.addEventListener('click', (event) => {
      if (dlg.dataset.preventClose === 'true') return;
      const rect = dlg.getBoundingClientRect();
      const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      if (outside) dlg.close();
    });
    document.body.appendChild(dlg);
    return dlg;
  }

  static showMsgDlg(message, options = {}) {
    const dlg = HMsg.getMsgDlg(options.dialogId);
    if (dlg.open) dlg.close();

    const header = dlg.querySelector('.h-dialog-header');
    const title = dlg.querySelector('.h-dialog-title');
    const closeBtn = dlg.querySelector('[data-role="close"]');
    const body = dlg.querySelector('.h-dialog-body');
    const footer = dlg.querySelector('.h-dialog-footer');

    dlg.dataset.preventClose = options.preventClose ? 'true' : 'false';
    header.hidden = options.hideHeader === true;
    footer.hidden = options.hideFooter === true;
    closeBtn.hidden = options.preventClose === true;
    title.textContent = $HR(options.title ?? 'Generic_Title');
    body.replaceChildren();
    footer.replaceChildren();
    dlg.classList.remove('h-dialog-danger');

    if (message instanceof HTMLElement) body.appendChild(message);
    else {
      const span = document.createElement('span');
      // Preserve HST behaviour: resource strings may contain simple HTML.
      span.innerHTML = $HR(message);
      body.appendChild(span);
    }

    if (!options.hideFooter) HMsg.renderButtons(footer, options.buttons, options.context ?? null, dlg);
    if (options.bgBodyClass) HMsg.definePalette(body, options.bgBodyClass);
    else HMsg.definePalette(body, '');
    if (options.bgTitleClass) HMsg.definePalette(header, options.bgTitleClass);
    else HMsg.definePalette(header, '');

    if (options.position?.of) HMsg.positionModal(dlg, options.position);
    else {
      dlg.style.margin = '';
      dlg.style.left = '';
      dlg.style.top = '';
      dlg.style.position = '';
    }

    dlg.showModal();
    return dlg;
  }

  static closeMsgDlg(dialogId) {
    const dlg = HMsg.getMsgDlg(dialogId);
    if (dlg.open) dlg.close();
  }

  static renderButtons(container, buttons, context, dlg = null) {
    if (!container || !buttons) return;
    let list;
    if (typeof buttons === 'function') {
      list = [
        { label: 'Yes', class: 'h-btn h-btn-primary', onClick: () => buttons.call(context) },
        { label: 'No', class: 'h-btn', onClick: () => dlg?.close() },
      ];
    } else if (Array.isArray(buttons)) {
      list = buttons;
    } else {
      list = Object.entries(buttons).map(([label, onClick]) => ({ label, onClick }));
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'h-dialog-buttons';
    const start = document.createElement('div');
    start.className = 'h-dialog-buttons-start';
    let hasStart = false;

    for (const config of list) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = $HR(config.label || 'OK');
      button.className = HMsg._normalizeButtonClass(config.class);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        config.onClick?.call(context, context);
      });
      if (config.position === 'start') {
        hasStart = true;
        start.appendChild(button);
      } else wrapper.appendChild(button);
    }
    if (hasStart) wrapper.prepend(start);
    container.appendChild(wrapper);
  }

  static _normalizeButtonClass(value) {
    const text = String(value || '').trim();
    if (!text) return 'h-btn h-btn-primary';
    // Compatibility for old HST button declarations during migration.
    if (text.includes('btn-primary')) return 'h-btn h-btn-primary';
    if (text.includes('btn-danger')) return 'h-btn h-btn-danger';
    if (text.includes('btn-secondary') || text === 'btn') return 'h-btn';
    return text.startsWith('h-') || text.includes(' h-') ? text : `h-btn ${text}`;
  }

  static showMsgFlash(message, options = {}) {
    const opts = {
      ...options,
      hideHeader: options.hideHeader !== false,
      hideFooter: options.hideFooter !== false,
      preventClose: options.preventClose !== false,
    };
    const dlg = HMsg.showMsgDlg(message, opts);
    const id = dlg.id;
    clearTimeout(HMsg._flashTimers.get(id));
    HMsg._flashTimers.set(id, setTimeout(() => {
      if (dlg.open) dlg.close();
      HMsg._flashTimers.delete(id);
    }, Number(options.showDelay) || 2000));
    return dlg;
  }

  static showMsgErr(message, options = {}) {
    const text = String(message ?? '').trim();
    const opts = { ...options, title: options.title ?? 'Error_Title' };
    opts.buttons = {
      [$HR('OK')]: () => HMsg.closeMsgDlg(opts.dialogId),
    };
    const dlg = HMsg.showMsgDlg(!text || text.toLowerCase() === 'error' ? 'Error_Empty_Message' : message, opts);
    dlg.classList.add('h-dialog-danger');
    return dlg;
  }

  static showMsgDlgUrl(contentURL, options = {}) {
    return window.open(contentURL, options.windowName ?? '_blank');
  }

  static bringCoverallToFront(ele, styles, message) {
    if (!HMsg.coverall) {
      HMsg.coverall = document.createElement('div');
      HMsg.coverall.className = 'h-coverall';
      HMsg.coverall.innerHTML = '<div class="h-coverall-message"></div>';
    } else {
      HMsg.coverall.remove();
    }
    HMsg.coverall.querySelector('.h-coverall-message').textContent = message ?? `${$HR('Loading Content')}...`;
    (ele ?? document.body).appendChild(HMsg.coverall);
    Object.assign(HMsg.coverall.style, styles || {});
    HMsg.coverall.style.display = 'block';
  }

  static sendCoverallToBack(forceClose = false) {
    if (forceClose) HMsg.coverallKeep = false;
    if (!HMsg.coverallKeep && HMsg.coverall) HMsg.coverall.style.display = 'none';
  }

  static closeMsgFlash(dialogId = 'dialog-common-messages') {
    const id = String(dialogId).replace(/^#/, '');
    clearTimeout(HMsg._flashTimers.get(id));
    HMsg._flashTimers.delete(id);
    const dlg = document.getElementById(id);
    if (dlg?.open) dlg.close();
  }

  static positionModal(dlg, position) {
    const anchor = position?.of;
    if (!(anchor instanceof Element)) return;
    const anchorRect = anchor.getBoundingClientRect();
    dlg.style.position = 'fixed';
    dlg.style.margin = '0';
    // showModal is required before the dialog size is reliable.
    requestAnimationFrame(() => {
      const dlgRect = dlg.getBoundingClientRect();
      const [atX = 'center', atY = 'center'] = String(position.at ?? 'center center').split(/\s+/);
      const [myX = 'center', myY = 'center'] = String(position.my ?? 'center center').split(/\s+/);
      const point = (kind, start, size) => kind === 'right' || kind === 'bottom' ? start + size : kind === 'center' ? start + size / 2 : start;
      const own = (kind, size) => kind === 'right' || kind === 'bottom' ? size : kind === 'center' ? size / 2 : 0;
      const left = point(atX, anchorRect.left, anchorRect.width) - own(myX, dlgRect.width);
      const top = point(atY, anchorRect.top, anchorRect.height) - own(myY, dlgRect.height);
      dlg.style.left = `${Math.max(8, Math.min(left, innerWidth - dlgRect.width - 8))}px`;
      dlg.style.top = `${Math.max(8, Math.min(top, innerHeight - dlgRect.height - 8))}px`;
    });
  }

  static definePalette(ele, classNames) {
    if (!ele) return;
    const previous = ele.dataset.palette;
    if (previous) ele.classList.remove(...previous.split(/\s+/).filter(Boolean));
    const next = String(classNames || '').trim();
    if (next) {
      ele.dataset.palette = next;
      ele.classList.add(...next.split(/\s+/));
    } else delete ele.dataset.palette;
  }
}
