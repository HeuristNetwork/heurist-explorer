/**
 * @file HTinyMceEditor.js
 * @brief The HTML editor (TinyMCE 8, GPL) of a blocktext value (plan 25), loaded on first use
 *        (a lazy chunk). Options ported from the legacy record editor (editing_input.js):
 *        no menu bar, status bar and resize, lists / links / tables / images, relative URLs
 *        against the Heurist base URL (stored as legacy, `./?db=X&file=KEY`), raw entities.
 *        Buttons Media (a registered file), Caption (of an image) and Record (a link to a
 *        record) use the host's services. Not ported: fonts, sizes, colours, alignment - the
 *        server removes inline CSS (stored text policy), they would be lost on save.
 *
 *   const editor = await createTinyMceEditor(host, { value, baseUrl, onChange, insertMedia, insertRecordLink });
 *   editor.getValue(); editor.destroy();
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

import { editorValue } from './richTextEditors.js';
import { $HR } from '../../ui/i18n/HResource.js';

/** TinyMCE with its model, theme, icons, skins and plugins (loaded once). */
let loading = null;

/** @returns {Promise<object>} The tinymce global. */
function loadTinyMce() {
  loading ??= (async () => {
    // the core first: the other modules register themselves on the tinymce global
    const { default: tinymce } = await import('tinymce');
    await Promise.all([
      import('tinymce/models/dom'),
      import('tinymce/themes/silver'),
      import('tinymce/icons/default'),
      import('tinymce/skins/ui/oxide/skin.js'),
      import('tinymce/skins/ui/oxide/content.js'),
      import('tinymce/skins/content/default/content.js'),
      import('tinymce/plugins/advlist'),
      import('tinymce/plugins/autolink'),
      import('tinymce/plugins/lists'),
      import('tinymce/plugins/link'),
      import('tinymce/plugins/image'),
      import('tinymce/plugins/table'),
      import('tinymce/plugins/code'),
      import('tinymce/plugins/fullscreen'),
      import('tinymce/plugins/searchreplace'),
      import('tinymce/plugins/visualblocks'),
      import('tinymce/plugins/autoresize'),
      import('tinymce/plugins/help'),
      import('tinymce/plugins/help/js/i18n/keynav/en.js')
    ]);
    return tinymce;
  })();
  return loading;
}

/**
 * Create the editor in a host element.
 *
 * @param {HTMLElement} host Element the editor is put in.
 * @param {object} options
 * @param {string} [options.value] HTML to edit.
 * @param {string} [options.baseUrl] Heurist base URL: relative URLs (`./?db=…`) are resolved against it
 *        and URLs below it are stored relative (as legacy tinymceURLConverter).
 * @param {(value: string) => void} [options.onChange] Called with the new value.
 * @param {() => Promise<string|null>} [options.insertMedia] Host: HTML of a registered file (Media button).
 * @param {(text: string) => Promise<string|null>} [options.insertRecordLink] Host: HTML of a link to a
 *        record, with the selected text (Record button).
 * @returns {Promise<{getValue: () => string, focus: () => void, destroy: () => void}>}
 */
export async function createTinyMceEditor(host, { value = '', baseUrl = '', onChange = null, insertMedia = null, insertRecordLink = null } = {}) {
  const tinymce = await loadTinyMce();
  const target = document.createElement('textarea');
  target.value = String(value ?? '');
  host.append(target);
  const base = normalizeBase(baseUrl);
  const [editor] = await tinymce.init({
    target,
    license_key: 'gpl',
    // the skins and content CSS were imported as modules (bundled)
    skin_url: 'default',
    content_css: 'default',
    content_style: 'img, video, iframe { max-width: 100%; height: auto; } figure { margin: 6px 0; }',
    menubar: false,
    branding: false,
    promotion: false,
    elementpath: false,
    statusbar: true,
    resize: 'both',
    plugins: 'advlist autolink lists link image table code fullscreen searchreplace visualblocks autoresize help',
    toolbar: 'blocks | bold italic underline strikethrough superscript subscript | heuristMedia heuristCaption heuristRecord link'
      + ' | bullist numlist outdent indent | table hr removeformat | fullscreen code help',
    toolbar_mode: 'wrap',
    min_height: 220,
    max_height: 640,
    autoresize_bottom_margin: 15,
    // URLs as legacy: relative to the Heurist base URL
    relative_urls: true,
    remove_script_host: false,
    convert_urls: true,
    ...(base ? { document_base_url: base } : {}),
    urlconverter_callback: (url) => (base && String(url).startsWith(base) ? `./${String(url).slice(base.length)}` : url),
    entity_encoding: 'raw',
    image_caption: true,
    paste_data_images: false,
    setup: (instance) => setup(instance, { insertMedia, insertRecordLink })
  });
  const changed = () => onChange?.(editorValue(editor.getContent()));
  editor.on('change input undo redo SetContent', changed);
  return {
    getValue: () => editorValue(editor.getContent()),
    focus: () => editor.focus(),
    destroy: () => {
      editor.remove();
      target.remove();
    }
  };
}

/** The Heurist buttons and the paste rule of the legacy editor. */
function setup(editor, { insertMedia, insertRecordLink }) {
  editor.ui.registry.addButton('heuristMedia', {
    icon: 'image',
    tooltip: $HR('Media: a registered file'),
    onAction: async () => {
      const html = await insertMedia?.();
      if (html) editor.insertContent(html);
    }
  });
  editor.ui.registry.addButton('heuristCaption', {
    icon: 'comment',
    tooltip: $HR('Caption of the image'),
    onAction: () => addCaption(editor)
  });
  editor.ui.registry.addButton('heuristRecord', {
    icon: 'bookmark',
    tooltip: $HR('Link to a record'),
    onAction: async () => {
      const text = editor.selection.getContent({ format: 'text' });
      const html = await insertRecordLink?.(text);
      if (html) editor.insertContent(html);
    }
  });
  // images are files of the database: inserted with Media, not pasted (as legacy)
  editor.on('paste', (event) => {
    const files = [...(event.clipboardData?.files || [])];
    if (!files.some((file) => String(file.type).startsWith('image/'))) return;
    event.preventDefault();
    editor.notificationManager.open({ text: $HR('Please use the Media button in the toolbar to insert images'), type: 'warning', timeout: 5000 });
  });
}

/** A caption for the selected image: the image in a figure with a figcaption. */
function addCaption(editor) {
  const node = editor.selection.getNode();
  const image = node?.nodeName === 'IMG' ? node : node?.querySelector?.('img');
  if (!image) {
    editor.notificationManager.open({ text: $HR('Select an image first'), type: 'info', timeout: 3000 });
    return;
  }
  const figure = editor.dom.getParent(image, 'figure');
  if (figure?.querySelector('figcaption')) {
    editor.selection.select(figure.querySelector('figcaption'), true);
    return;
  }
  editor.selection.select(image);
  editor.selection.setContent(`<figure>${image.outerHTML}<figcaption>${$HR('Caption')}</figcaption></figure>`);
}

/** Base URL with one trailing slash, or ''. */
function normalizeBase(baseUrl) {
  const value = String(baseUrl ?? '').trim();
  if (!value) return '';
  return value.endsWith('/') ? value : `${value}/`;
}
