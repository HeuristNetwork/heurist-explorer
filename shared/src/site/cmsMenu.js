/**
 * @file cmsMenu.js
 * @brief Settings of the website menu and the action menu: presentation, item style, orientation (plan 27k §1-2).
 *
 * The rules of HMenu without its CSS: the designer forms import them without pulling HMenu.css into a chunk of its own
 * (the page links only heurist-website-main.css). Server mirror: PageRenderer::menuLook / menuClass.
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

/**
 * Presentations of a menu (plan 27f §6, 27k §1): `menu` is the website menu; `row` a row of items, `links` / `buttons`
 * (stored before plan 27k) a row with that style; `expand` the items behind a button, `dropdown` (stored before the
 * review 2026-11-16) the same opened by a click, a column below a button with its name; `grow` icons that show their
 * name on hover (review 2026-11-16).
 */
export const MENU_PRESENTATIONS = Object.freeze(['menu', 'row', 'links', 'buttons', 'icons', 'dropdown', 'expand', 'grow']);

/** How the list behind the button opens (review 2026-11-16): on hover (and a click) or on a click only. */
export const MENU_OPEN_MODES = Object.freeze(['hover', 'click']);

/** Widths of the line of the underline style (review 2026-11-16); not given = the default 2px. */
export const MENU_LINE_WIDTHS = Object.freeze(['1px', '2px', '3px', '4px', '6px']);

/**
 * A colour of a menu setting (lineColor, overlay colours): hex, a name, rgb() or hsl() (CMS_LAYOUT_COLOR), or a colour of
 * the website `var(--h-color-...)` (review 2026-11-16).
 */
export const MENU_COLOR = /^(?:#[0-9a-f]{3,8}|[a-z]{3,20}|(?:rgb|hsl)a?\([0-9\s.,%deg/]+\)|var\(--h-color-[a-z-]{1,30}\))$/i;

/** Styles of the items of a menu (plan 27k §1); `plain` (the default) writes no class. */
export const MENU_STYLES = Object.freeze(['plain', 'links', 'underline', 'pills', 'buttons', 'outline']);

/** The button of an expanding action menu without its own icon (plan 27k §2). */
export const MENU_EXPAND_ICON = 'fa-solid fa-share-nodes';

/** Style classes of Font Awesome (one of them chooses the font of the icon). */
const FA_STYLES = /(?:^|\s)(?:fa|fas|far|fab|fal|fat|fad|fa-(?:solid|regular|brands|light|thin|duotone|sharp|sharp-solid|sharp-regular))(?=\s|$)/;

/**
 * Font Awesome classes of an icon setting (PageRenderer::faClass): letters, digits, dashes and spaces with a `fa-` class;
 * `fa-solid` is added when no style is given (review 2026-11-16: `fa-star` = `fa-solid fa-star`). '' when not an icon.
 *
 * @param {string} icon
 * @returns {string}
 */
export function faIcon(icon) {
  const text = String(icon ?? '').trim().replace(/\s+/g, ' ');
  if (!/^[a-z0-9 -]{1,80}$/.test(text) || !text.includes('fa-')) return '';
  return FA_STYLES.test(text) ? text : `fa-solid ${text}`;
}

/** Classes of the presentations (the others write none); `expand` is not `h-site-menu-expand`, the tree buttons. */
const PRESENTATION_CLASSES = Object.freeze({ icons: 'h-site-menu-icons', expand: 'h-site-menu-expanding', grow: 'h-site-menu-grow' });

/**
 * Presentation, style and orientation of a menu from its settings (PageRenderer::menuLook): a stored `links` / `buttons`
 * presentation is a row with that style; a stored `dropdown` (review 2026-11-16) the list behind a button opened by a
 * click, a column, the name on the button. `open` (expand): hover | click; `buttonText` (expand): the name on the button.
 *
 * @param {object} settings
 * @returns {{presentation: string, style: string, orientation: string, open: string, buttonText: boolean}}
 */
export function menuLook(settings = {}) {
  let presentation = MENU_PRESENTATIONS.includes(settings.presentation) ? settings.presentation : 'menu';
  let style = MENU_STYLES.includes(settings.style) ? settings.style : 'plain';
  let orientation = ['vertical', 'auto'].includes(settings.orientation) ? settings.orientation : 'horizontal';
  let open = MENU_OPEN_MODES.includes(settings.open) ? settings.open : 'hover';
  let buttonText = settings.buttonText === true;
  if (presentation === 'links' || presentation === 'buttons') {
    if (!MENU_STYLES.includes(settings.style)) style = presentation;
    presentation = 'row';
  } else if (presentation === 'dropdown') {
    presentation = 'expand';
    if (!MENU_OPEN_MODES.includes(settings.open)) open = 'click';
    if (!settings.orientation) orientation = 'vertical';
    if (settings.buttonText !== false) buttonText = true;
  }
  return { presentation, style, orientation, open, buttonText };
}

/**
 * The inline style of a menu (PageRenderer::menuStyle, review 2026-11-16): CSS variables of its settings, the width and
 * colour of the line of the underline style (`lineWidth`, `lineColor`) and the colours of the full-screen website menu
 * (`overlayBg`, `overlayText`); values that are not allowed are left out.
 *
 * @param {object} settings
 * @returns {string} e.g. `--h-site-menu-line-width:3px;` ('' without any).
 */
export function menuStyle(settings = {}) {
  const colour = (value) => (typeof value === 'string' && MENU_COLOR.test(value.trim()) ? value.trim() : '');
  const values = {
    '--h-site-menu-line-width': MENU_LINE_WIDTHS.includes(settings.lineWidth) ? settings.lineWidth : '',
    '--h-site-menu-line-color': colour(settings.lineColor),
    '--h-site-menu-overlay-bg': colour(settings.overlayBg),
    '--h-site-menu-overlay-text': colour(settings.overlayText)
  };
  return Object.entries(values).filter(([, value]) => value).map(([name, value]) => `${name}:${value};`).join('');
}

/** Animations of the full-screen website menu (plan 27k §5); `down` (the default) writes no class. */
export const MENU_ANIMATIONS = Object.freeze(['down', 'right', 'fade']);

/**
 * Classes of a menu (PageRenderer::menuClass): orientation, presentation, style, h-site-menu-open-click (expand opened
 * by a click only); the website menu (plan 27k §5): `collapse: 'fullscreen'` (h-site-menu-fullscreen, its `animation`
 * h-site-menu-anim-right | -fade) and `alwaysCollapsed` (h-site-menu-always-collapsed: the menu button on every screen).
 *
 * @param {object} settings
 * @returns {string}
 */
export function menuClass(settings = {}) {
  const { presentation, style, orientation, open } = menuLook(settings);
  const site = presentation === 'menu';
  const fullscreen = site && settings.collapse === 'fullscreen';
  const animation = MENU_ANIMATIONS.includes(settings.animation) ? settings.animation : MENU_ANIMATIONS[0];
  return ['h-site-menu', orientation !== 'horizontal' ? `h-site-menu-${orientation}` : '', PRESENTATION_CLASSES[presentation] || '',
    style !== 'plain' ? `h-site-menu-style-${style}` : '', presentation === 'expand' && open === 'click' ? 'h-site-menu-open-click' : '',
    fullscreen ? 'h-site-menu-fullscreen' : '', fullscreen && animation !== MENU_ANIMATIONS[0] ? `h-site-menu-anim-${animation}` : '',
    site && settings.alwaysCollapsed === true ? 'h-site-menu-always-collapsed' : ''].filter(Boolean).join(' ');
}

/**
 * The path of the current page in a menu tree (plan 27k §6, PageRenderer::menuPath): its parents and the page itself;
 * empty when the page is not in the tree.
 *
 * @param {Array<object>} tree Items with `current` and `children`.
 * @returns {Array<object>}
 */
export function menuPath(tree = []) {
  for (const item of tree) {
    if (item.current) return [item];
    const path = menuPath(item.children || []);
    if (path.length) return [item, ...path];
  }
  return [];
}

/**
 * The section menu (plan 27k §6, `scope: 'section'`; PageRenderer::sectionTree): the current page and its sub pages, or
 * for a page without sub pages its parent and the sub pages of the parent; the first entry has no sub entries. The home
 * page, a page of the first level without sub pages and a page not in the menu (review 2026-11-16): the pages of the
 * first level without their sub pages (with Show Home the home page first). Record pages are left out.
 *
 * @param {Array<object>} tree
 * @returns {Array<object>}
 */
export function sectionTree(tree = []) {
  const withoutRecords = (items) => (items || []).filter((item) => !item.record)
    .map((item) => ({ ...item, children: withoutRecords(item.children) }));
  const path = menuPath(tree);
  const last = path.at(-1);
  const children = last && !last.record ? withoutRecords(last.children) : [];
  const root = children.length ? last : path.at(-2);
  if (!root) return withoutRecords(tree).map((item) => ({ ...item, children: [] }));
  return [{ ...root, children: [] }, ...withoutRecords(root.children)];
}
