/**
 * @file HEmailForm.js
 * @brief Email form of a v4 website (plan 27h, port of the legacy emailForm widget).
 *
 * The server writes the form (EmailFormHtml::render: name, email, message, a captcha question, Send; display
 * `inline` or `button` = a button that opens the form in a dialog); render() activates it, or writes the same
 * markup (without its noscript line) when the host is empty (the designer's draft). The captcha question is
 * asked when the visitor first uses the form (`GET {api}/external/email`, the answer is kept in the session);
 * Send posts the message (`POST {api}/external/email`). After an error a new question is asked. In the
 * designer nothing is sent.
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

import { HBaseWidget } from '../HBaseWidget.js';
import { $HR } from '../../ui/i18n/HResource.js';
import './HEmailForm.css';

/** A plain check of an e-mail address (the server checks it again). */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Displays of the form (instance setting `display`); the first is the default. */
export const EMAIL_FORM_DISPLAYS = Object.freeze(['inline', 'button']);

/**
 * Markup of the form, as EmailFormHtml::render writes it (words through $HR).
 *
 * @param {object} [settings] `display`, `label`, `labels` {lang: caption}.
 * @param {{site?: number, language?: string}} [options]
 * @returns {string} HTML.
 */
export function emailFormHtml(settings = {}, { site = 0, language = '' } = {}) {
  const word = (text) => escapeHtml($HR(text));
  const form = `<form class="h-site-email-form" data-site="${Number(site) || 0}" novalidate>`
    + `<label class="h-site-email-field"><span>${word('Your name')}</span>`
    + '<input type="text" name="name" required maxlength="100" autocomplete="name"></label>'
    + `<label class="h-site-email-field"><span>${word('Email address')}</span>`
    + '<input type="email" name="email" required maxlength="254" autocomplete="email"></label>'
    + `<label class="h-site-email-field"><span>${word('Message')}</span>`
    + '<textarea name="message" required maxlength="5000" rows="6"></textarea></label>'
    + `<label class="h-site-email-field h-site-email-captcha"><span>${word('Prove you are human:')}`
    + ' <span class="h-site-email-question"></span></span>'
    + '<input type="text" name="captcha" required maxlength="16" inputmode="numeric" autocomplete="off"></label>'
    + `<div class="h-site-email-actions"><button type="submit" class="h-site-email-send">${word('Send')}</button></div>`
    + '<p class="h-site-email-status" role="status" aria-live="polite"></p>'
    + '</form>';
  if (settings.display !== 'button') return form;
  const custom = String(settings.labels?.[String(language).toLowerCase()] ?? settings.label ?? '').trim();
  const caption = custom ? escapeHtml(custom) : word('Email us');
  return `<button type="button" class="h-site-email-open">${caption}</button>`
    + `<dialog class="h-site-email-dialog" aria-label="${caption}"><div class="h-site-email-dialog-head"><span>${caption}</span>`
    + `<button type="button" class="h-site-email-close" aria-label="${word('Close')}">&times;</button></div>${form}</dialog>`;
}

/** The email form of a website page. */
export class HEmailForm extends HBaseWidget {
  /**
   * Attach the form.
   *
   * @param {HTMLElement} container Host element.
   * @param {object} [options]
   * @param {string} [options.url] `{apiBaseUrl}/{db}/external/email`.
   * @param {object} [options.settings] Instance settings (display, label, labels).
   * @param {number} [options.site] Website (or standalone page) of the form, for an empty host.
   * @param {string} [options.language] Page language (3 letters), for the button caption.
   * @param {boolean} [options.design] The designer's preview: nothing is asked or sent.
   * @param {typeof fetch} [options.fetch] fetch (tests).
   * @returns {HEmailForm}
   */
  attach(container, options = {}) {
    super.attach(container, options);
    this._asked = false;
    return this;
  }

  /**
   * Render (or activate) the form.
   *
   * @returns {HEmailForm}
   */
  render() {
    if (!this.container.querySelector?.('.h-site-email-form')) {
      this.container.innerHTML = emailFormHtml(this.options.settings || {}, { site: this.options.site, language: this.options.language });
    }
    this.container.classList?.add('h-site-email');
    this.form = this.container.querySelector('.h-site-email-form');
    this.status = this.form.querySelector('.h-site-email-status');
    this.question = this.form.querySelector('.h-site-email-question');
    this.sendButton = this.form.querySelector('.h-site-email-send');
    const dialog = this.container.querySelector('.h-site-email-dialog');
    const open = this.container.querySelector('.h-site-email-open');
    if (dialog && open) {
      this.listen(open, 'click', () => {
        if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
        void this.ask();
      });
      const close = dialog.querySelector('.h-site-email-close');
      if (close) this.listen(close, 'click', () => (typeof dialog.close === 'function' ? dialog.close() : dialog.removeAttribute('open')));
    }
    if (this.options.design) {
      this.question.textContent = '4 + 7 + 1 =';
      this.sendButton.disabled = true;
      this.sendButton.title = $HR('The form sends messages on the website only');
    } else {
      this.listen(this.form, 'focusin', () => void this.ask());
      this.listen(this.form, 'submit', (event) => {
        event.preventDefault();
        void this.send();
      });
    }
    this.state = 'rendered';
    return this;
  }

  /**
   * Ask for a captcha question (once until it is used).
   *
   * @param {boolean} [again] A new question even when one is shown.
   * @returns {Promise<void>}
   */
  async ask(again = false) {
    if (this.options.design || (this._asked && !again)) return;
    this._asked = true;
    this._field('captcha').value = '';
    try {
      const answer = await this._request('GET');
      this.question.textContent = String(answer?.question ?? '');
    } catch (error) {
      this._asked = false;
      this._show(error.message, true);
    }
  }

  /**
   * Check the fields and send the message.
   *
   * @returns {Promise<boolean>} Whether it was sent.
   */
  async send() {
    const values = { name: this._field('name').value.trim(), email: this._field('email').value.trim(),
      message: this._field('message').value.trim(), captcha: this._field('captcha').value.replace(/\s+/g, '') };
    const missing = Object.keys(values).filter((name) => !values[name]);
    for (const name of Object.keys(values)) this._invalid(name, missing.includes(name));
    if (missing.length) {
      this._show($HR('Please fill in all fields'), true);
      return false;
    }
    if (!EMAIL.test(values.email)) {
      this._invalid('email', true);
      this._show($HR('Email does not appear to be valid'), true);
      return false;
    }
    this.sendButton.disabled = true;
    this._show($HR('Sending...'), false);
    try {
      await this._request('POST', { site: Number(this.form.getAttribute('data-site')) || 0, ...values, url: globalThis.location?.href || '' });
      for (const name of Object.keys(values)) this._field(name).value = '';
      this._asked = false;
      this.question.textContent = '';
      this._show($HR('Your message has been sent. Thank you!'), false);
      return true;
    } catch (error) {
      this._show(error.message, true);
      // the answer is used once: a new question (not after "too many messages")
      if (error.status !== 429) await this.ask(true);
      return false;
    } finally {
      this.sendButton.disabled = false;
    }
  }

  /** A request to the endpoint; an Error with `status` and the server's message when it fails. */
  async _request(method, body = null) {
    const send = this.options.fetch || globalThis.fetch;
    const response = await send(this.options.url, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const answer = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(answer?.message ? $HR(answer.message) : $HR('The message was not sent: please try again later'));
      error.status = response.status;
      throw error;
    }
    return answer;
  }

  /** An input of the form by its name. */
  _field(name) {
    return this.form.querySelector(`[name="${name}"]`);
  }

  /** Mark an input as invalid or not. */
  _invalid(name, invalid) {
    if (invalid) this._field(name).setAttribute('aria-invalid', 'true'); else this._field(name).removeAttribute('aria-invalid');
  }

  /** The status line: a message or an error. */
  _show(text, isError) {
    this.status.textContent = text || '';
    this.status.classList.toggle('is-error', Boolean(isError));
  }
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
