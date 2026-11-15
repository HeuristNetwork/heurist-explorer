/**
 * @file cmsPageTemplates.js
 * @brief Page templates of a website (plan 27i §9, rework 2026-11-13): Cover, Landing, About, Features, Team, Discover,
 *        Contact and Publications are built as ordinary elements of a page from the elements ticked in the Add page
 *        form and a few options. Every element gets a first value, so the page has no empty places: the title,
 *        subtitle, logo and summary of the website, placeholder images and random banners of the website bundle
 *        (`assets/cms`), starter texts. Groups are CSS grids; the page itself is the root group (its own style,
 *        `styles.page`), the banners are background images of a group or of the page.
 *
 *   const doc = new CmsRecordDocument({ parts: { content: '' }, config: {...} });
 *   const { configure } = buildTemplatePage(doc, 'cover', 'Welcome', {
 *     values: { elements: ['title', 'logo', 'enter'] },
 *     site: { title: 'My project', homeId: 12 },
 *     mediaHtml: (file, settings) => buildCmsMedia(file, settings, { urls }),
 *     placeholderHtml: (name, settings) => buildCmsPlaceholder(name, settings, baseUrl),
 *     assetUrl: (name) => cmsAssetUrl(baseUrl, name), language: 'eng'
 *   });
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

/** Templates built from the Add page form (plan 27i §9). */
export const CMS_TEMPLATE_PAGES = Object.freeze(['cover', 'landing', 'about', 'features', 'team', 'discover', 'contact', 'publications']);

/** Smarty report of a team member card (template Team, plan 27e). */
export const CMS_TEAM_TEMPLATE = 'Team_member.tpl';

/** Topics of the About page, in their order. */
export const CMS_ABOUT_TOPICS = Object.freeze(['origins', 'description', 'aims', 'sources', 'acknowledgements', 'heurist']);

/** The elements of each template that the Add page form offers (all ticked at first; About: its topics). */
export const CMS_TEMPLATE_ELEMENTS = Object.freeze({
  cover: Object.freeze(['title', 'subtitle', 'logo', 'text', 'enter', 'background']),
  landing: Object.freeze(['banner', 'image', 'text', 'slideshow', 'buttons', 'features', 'news']),
  about: CMS_ABOUT_TOPICS,
  features: Object.freeze([]),
  team: Object.freeze(['text']),
  discover: Object.freeze(['text']),
  contact: Object.freeze(['address', 'contact', 'email', 'follow']),
  publications: Object.freeze(['text'])
});

/** Number of features of the Features page and of team members of a static Team page. */
export const CMS_FEATURES_MIN = 2;
export const CMS_FEATURES_MAX = 6;

/** Placeholder images of the website bundle (CMS_ASSET_NAME). */
export const CMS_PLACEHOLDERS = Object.freeze({
  logo: 'cms/placeholder_logo.png',
  small: 'cms/150x150.png',
  image: 'cms/600x400.png'
});

/** Banner images of the website bundle (`public/assets/cms/banners` of the website app; a test checks the folder). */
export const CMS_BANNERS = Object.freeze([
  '172-536x354.jpg', '552-536x354.jpg', '705-536x354.jpg', '875-536x354.jpg', '991-536x354.jpg'
].map((name) => `cms/banners/${name}`));

/**
 * Banners of CMS_BANNERS in a random order (no repeats while there are enough).
 *
 * @param {number} count
 * @param {() => number} [random] Math.random (tests give their own).
 * @returns {string[]} Asset names.
 */
export function pickBanners(count, random = Math.random) {
  const list = [...CMS_BANNERS];
  const result = [];
  for (let index = 0; index < count; index += 1) {
    if (!list.length) list.push(...CMS_BANNERS);
    result.push(list.splice(Math.floor(random() * list.length) % list.length, 1)[0]);
  }
  return result;
}

/** Starter texts by the first language of the website (other languages: English). */
const TEXTS = Object.freeze({
  eng: {
    enter: 'Enter site',
    about: 'About',
    explore: 'Explore',
    discover: 'Search and explore the records of the database',
    address: '<h3>Address</h3><p>Street<br>City</p>',
    contact: '<h3>Contact</h3><p>Email<br>Phone</p>',
    follow: 'Follow us',
    write: 'Write to us',
    features: 'Features',
    feature: 'Feature',
    featureText: 'A short description of this feature.',
    more: 'More',
    member: 'Name',
    role: 'Role in the project',
    memberText: 'A short description of this person.',
    team: '<h1>Project Team</h1><p>Dedicated to quality of research data</p>',
    news: 'News',
    publications: 'The publications of the project.',
    welcome: 'Welcome to the website of the project.',
    title: 'Title of the website',
    topics: {
      origins: ['Origins of the project', 'How the project started and how it developed.'],
      description: ['About the project', 'What the project is about: its subject, period and places.'],
      aims: ['Aims and methodology', 'The questions of the project and how it answers them.'],
      sources: ['Sources of data', 'Where the data come from: archives, publications, field work.'],
      acknowledgements: ['Acknowledgements', 'People and institutions who supported the project.'],
      heurist: ['Heurist', 'This website and its database are made with Heurist, a free knowledge management system for research'
        + ' in the humanities: <a href="https://heuristnetwork.org" target="_blank" rel="noopener">heuristnetwork.org</a>.']
    }
  },
  fre: {
    enter: 'Entrer',
    about: 'À propos',
    explore: 'Explorer',
    discover: 'Recherchez et explorez les enregistrements de la base de données',
    address: '<h3>Adresse</h3><p>Rue<br>Ville</p>',
    contact: '<h3>Contact</h3><p>Courriel<br>Téléphone</p>',
    follow: 'Suivez-nous',
    write: 'Écrivez-nous',
    features: 'Points forts',
    feature: 'Point fort',
    featureText: 'Une courte description de ce point fort.',
    more: 'En savoir plus',
    member: 'Nom',
    role: 'Rôle dans le projet',
    memberText: 'Une courte description de cette personne.',
    team: '<h1>L\'équipe du projet</h1><p>Au service de la qualité des données de recherche</p>',
    news: 'Actualités',
    publications: 'Les publications du projet.',
    welcome: 'Bienvenue sur le site du projet.',
    title: 'Titre du site',
    topics: {
      origins: ['Origines du projet', 'Comment le projet a commencé et comment il s\'est développé.'],
      description: ['Le projet', 'Le sujet du projet, sa période et ses lieux.'],
      aims: ['Objectifs et méthodologie', 'Les questions du projet et la manière d\'y répondre.'],
      sources: ['Sources des données', 'L\'origine des données : archives, publications, terrain.'],
      acknowledgements: ['Remerciements', 'Les personnes et institutions qui ont soutenu le projet.'],
      heurist: ['Heurist', 'Ce site et sa base de données sont réalisés avec Heurist, un système libre de gestion des connaissances'
        + ' pour la recherche en sciences humaines : <a href="https://heuristnetwork.org" target="_blank" rel="noopener">heuristnetwork.org</a>.']
    }
  }
});

/** The starter texts of a language (3 letters). */
export function cmsTemplateTexts(language = 'eng') {
  const code = String(language || '').toLowerCase();
  return TEXTS[code === 'fra' ? 'fre' : code] || TEXTS.eng;
}

/** Grid styles. */
const GAP = '1rem';

/** A one-column grid; `center`: its content in the middle. */
function stack(center = false) {
  return { display: 'grid', gap: GAP, ...(center ? { 'justify-items': 'center', 'align-content': 'center' } : {}) };
}

/** A grid of N equal columns, one column on narrow screens. */
function columns(count, gap = '24px') {
  return { display: 'grid', 'grid-template-columns': `repeat(${count}, minmax(0, 1fr))`, gap,
    narrow: { 'grid-template-columns': '1fr' } };
}

/** A background image (an asset of the bundle) over the whole element. */
function backgroundImage(url) {
  return { 'background-image': `url(${url})`, 'background-size': 'cover', 'background-position': 'center',
    'background-repeat': 'no-repeat' };
}

/** Light text over an image. */
const LIGHT_TEXT = Object.freeze({ color: '#ffffff', 'text-shadow': '0 1px 3px rgba(0, 0, 0, 0.8)' });

/**
 * Build a template page into an empty record document.
 *
 * @param {object} doc CmsRecordDocument with an empty `content` part.
 * @param {string} template One of CMS_TEMPLATE_PAGES.
 * @param {string} title Page title (the first heading).
 * @param {object} [options]
 * @param {object} [options.values] Values of the Add page form: `elements` (ticked elements of CMS_TEMPLATE_ELEMENTS),
 *        `count` and `orientation` (`list` | `columns`) of Features and a static Team, `fromDatabase`, `records` and
 *        `cardTemplate` of Team.
 * @param {{title?: string, subtitle?: string, summary?: string, logo?: object|null, homeId?: number}} [options.site]
 *        Values of the website: `summary` plain text, `logo` the file (CmsDesigner._mediaFile), `homeId` its record.
 * @param {(file: object, settings: object) => string} [options.mediaHtml] HTML of a media element (buildCmsMedia).
 * @param {(name: string, settings: object) => string} [options.placeholderHtml] HTML of a placeholder media element
 *        (buildCmsPlaceholder).
 * @param {(names: string[]) => object} [options.galleryHtml] HTML of a gallery of placeholder images by language.
 * @param {(name: string) => string} [options.assetUrl] URL of an image of the bundle (cmsAssetUrl).
 * @param {string} [options.language] First language of the website (starter texts).
 * @param {() => number} [options.random] Math.random (banners).
 * @returns {{configure: string[]}} Nodes whose configuration opens after the page is added (Generated Report).
 */
export function buildTemplatePage(doc, template, title, {
  values = {}, site = {}, mediaHtml = null, placeholderHtml = null, galleryHtml = null, assetUrl = (name) => name,
  language = 'eng', random = Math.random
} = {}) {
  if (!CMS_TEMPLATE_PAGES.includes(template)) throw new Error(`Unknown template "${template}"`);
  const texts = cmsTemplateTexts(language);
  const build = new TemplateBuilder(doc, { mediaHtml, placeholderHtml, galleryHtml });
  const offered = CMS_TEMPLATE_ELEMENTS[template];
  // no list given: all elements of the template
  const ticked = Array.isArray(values.elements) ? new Set(values.elements) : new Set(offered);
  const has = (element) => ticked.has(element);
  const heading = escapeHtml(title || '');
  const siteTitle = text(site.title) || texts.title;
  const summary = paragraphs(site.summary) || `<p>${escapeHtml(texts.welcome)}</p>`;
  const configure = [];
  const logo = (parent, settings) => (site.logo ? build.media(parent, site.logo, settings) : null)
    || build.placeholder(parent, CMS_PLACEHOLDERS.logo, settings);
  switch (template) {
    case 'cover': {
      // the page is the group: over the whole window, its content in the middle, a random banner behind it
      const style = { ...stack(true), 'min-height': '100vh', padding: '2rem', 'text-align': 'center' };
      if (has('background')) Object.assign(style, backgroundImage(assetUrl(pickBanners(1, random)[0])), LIGHT_TEXT);
      doc.setPageStyle(style);
      // the logo of the website in its usual size (review 2026-11-15, was 200px)
      if (has('logo')) logo(null, { height: '80px' });
      const subtitle = text(site.subtitle);
      const heads = `${has('title') ? `<h1>${escapeHtml(siteTitle)}</h1>` : ''}${has('subtitle') && subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}`;
      if (heads) build.text(null, heads);
      if (has('text')) build.text(null, summary);
      if (has('enter')) {
        build.widget(null, 'actionmenu', { presentation: 'buttons',
          items: [{ label: texts.enter, action: 'page', target: Number(site.homeId) || null }] });
      }
      break;
    }
    case 'landing': {
      const [banner, ...slides] = pickBanners(4, random);
      // the title of the page when neither the banner nor the introduction shows one
      if (!has('banner') && !has('text')) build.text(null, `<h1>${heading}</h1>`);
      if (has('banner')) {
        const band = build.group(null, { ...stack(), 'align-content': 'end', 'min-height': '300px', padding: '2rem',
          ...backgroundImage(assetUrl(banner)), ...LIGHT_TEXT });
        build.text(band, `<h1>${escapeHtml(siteTitle)}</h1>`);
      }
      const left = has('image') || has('text');
      const top = left || has('slideshow')
        ? build.group(null, { ...(left && has('slideshow') ? columns(2) : stack()), 'align-items': 'center', padding: '2rem' })
        : null;
      if (left) {
        const column = has('slideshow') ? build.group(top, stack()) : top;
        if (has('image')) logo(column, { height: '150px' });
        if (has('text')) build.text(column, `${has('banner') ? '' : `<h1>${heading}</h1>`}${summary}`);
      }
      if (has('slideshow')) build.gallery(top, slides.slice(0, 3));
      if (has('buttons')) {
        const row = build.group(null, { ...stack(true), padding: '1rem' });
        build.widget(row, 'actionmenu', { presentation: 'buttons', items: [
          { label: texts.about, action: 'page', target: null }, { label: texts.explore, action: 'page', target: null }] });
      }
      if (has('features')) {
        const section = build.group(null, { ...stack(), padding: '2rem' });
        build.text(section, `<h2>${escapeHtml(texts.features)}</h2>`);
        // three feature cards as the Features page (review 2026-11-14), each with More to a page
        addCards(build, { count: 3 }, () => [`<h3>${escapeHtml(texts.feature)}</h3>`, `<p>${escapeHtml(texts.featureText)}</p>`], (card) => {
          build.widget(card, 'actionmenu', { presentation: 'links', items: [{ label: texts.more, action: 'page', target: null }] });
        }, section);
      }
      if (has('news')) {
        const section = build.group(null, { ...stack(), padding: '2rem' });
        build.text(section, `<h2>${escapeHtml(texts.news)}</h2>`);
        build.cards(section);
      }
      break;
    }
    case 'about': {
      build.text(null, `<h1>${heading}</h1>`);
      CMS_ABOUT_TOPICS.filter(has).forEach((topic, index) => {
        const [caption, starter] = texts.topics[topic];
        const section = build.group(null, {
          ...columns(2), 'align-items': 'center', padding: '2rem',
          // the sections take the surface colour and the image side in turn
          ...(index % 2 ? { 'background-color': 'var(--h-color-surface)' } : {})
        });
        if (index % 2) build.placeholder(section, CMS_PLACEHOLDERS.image, {});
        build.text(section, `<h2>${escapeHtml(caption)}</h2><p>${starter}</p>`);
        if (!(index % 2)) build.placeholder(section, CMS_PLACEHOLDERS.image, {});
      });
      break;
    }
    case 'features': {
      build.text(null, `<h1>${heading}</h1>`);
      // each card links to a page with the action menu More (its page is chosen in the page tree)
      addCards(build, values, () => [`<h3>${escapeHtml(texts.feature)}</h3>`, `<p>${escapeHtml(texts.featureText)}</p>`], (card) => {
        build.widget(card, 'actionmenu', { presentation: 'links', items: [{ label: texts.more, action: 'page', target: null }] });
      });
      break;
    }
    case 'team': {
      if (has('text')) build.text(null, texts.team);
      if (values.fromDatabase === true) {
        // the Smarty report of a team member makes a card of each record (plan 27e); a list or columns
        const grid = build.group(null, values.orientation === 'list' ? stack()
          : { display: 'grid', 'grid-template-columns': 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' });
        const ids = [values.records].flat().map(Number).filter((id) => id > 0);
        build.widget(grid, 'cards', { mode: 'manual', query: ids.length ? [{ ids: ids.join(',') }, { sortby: 'set' }] : null,
          template: values.cardTemplate || CMS_TEAM_TEMPLATE, presentation: 'list', action: 'none' });
      } else {
        addCards(build, values, () => [`<h3>${escapeHtml(texts.member)}</h3>`,
          `<p><em>${escapeHtml(texts.role)}</em></p><p>${escapeHtml(texts.memberText)}</p>`]);
      }
      break;
    }
    case 'discover': {
      build.text(null, `<h1>${heading}</h1>${has('text') ? `<p>${escapeHtml(texts.discover)}</p>` : ''}`);
      const explorer = build.element(null, 'explorer');
      doc.setNodeStyle(explorer, { ...doc.nodeStyle(explorer), height: '80vh' });
      break;
    }
    case 'contact': {
      // the content centred, not wider than 1024 px (review 2026-11-15)
      doc.setPageStyle({ ...doc.pageStyle(), 'max-width': '1024px', margin: '0 auto' });
      build.text(null, `<h1>${heading}</h1>`);
      const details = has('address') || has('contact');
      // two columns only when both sides have something
      const parent = details && has('email') ? build.group(null, columns(2)) : null;
      if (details) {
        const left = build.group(parent, stack());
        if (has('address')) build.text(left, texts.address);
        if (has('contact')) build.text(left, texts.contact);
      }
      if (has('email')) {
        const right = build.group(parent, stack());
        build.text(right, `<h2>${escapeHtml(texts.write)}</h2>`);
        build.widget(right, 'email', {});
      }
      if (has('follow')) {
        const follow = build.group(null, { ...stack(true), padding: '1rem' });
        build.text(follow, `<p><strong>${escapeHtml(texts.follow)}</strong></p>`);
        // one network at first: Email (the address is set in the page tree)
        build.widget(follow, 'actionmenu', { preset: 'social', presentation: 'icons',
          items: [{ label: 'Email', icon: 'fa-solid fa-envelope', iconOnly: true, action: 'url', target: 'mailto:', newTab: false }] });
      }
      break;
    }
    case 'publications': {
      build.text(null, `<h1>${heading}</h1>${has('text') ? `<p>${escapeHtml(texts.publications)}</p>` : ''}`);
      configure.push(build.element(null, 'report'));
      break;
    }
    default:
      break;
  }
  return { configure };
}

/**
 * The cards of Features and of a static Team: N groups (caption, placeholder image, text) on the surface colour, in
 * three columns or one under another.
 *
 * @param {TemplateBuilder} build
 * @param {{count?: number|string, orientation?: string}} values
 * @param {() => [string, string]} content Caption (a heading) and text of a card.
 * @param {(card: string) => void} [extra] Adds elements at the end of a card (Features: More).
 * @param {string|null} [parent] The group of the cards (Landing: its Features section); null: the page.
 */
function addCards(build, values, content, extra = null, parent = null) {
  const count = Math.min(CMS_FEATURES_MAX, Math.max(CMS_FEATURES_MIN, Number(values.count) || 3));
  const grid = build.group(parent, values.orientation === 'list' ? stack() : columns(3, '16px'));
  for (let index = 0; index < count; index += 1) {
    const [caption, body] = content(index);
    const card = build.group(grid, { ...stack(), padding: '1rem', 'background-color': 'var(--h-color-surface)' });
    // the caption of the group: its first element, a heading
    build.text(card, caption);
    build.placeholder(card, CMS_PLACEHOLDERS.small, { width: '150px', height: '150px' });
    build.text(card, body);
    extra?.(card);
  }
}

/** Inserts elements into the `content` part of a record document. */
class TemplateBuilder {
  constructor(doc, { mediaHtml, placeholderHtml, galleryHtml }) {
    this.doc = doc;
    this.mediaHtml = mediaHtml;
    this.placeholderHtml = placeholderHtml;
    this.galleryHtml = galleryHtml;
  }

  /** An element at the end of a group (null: of the page). */
  element(parent, element) {
    return this.doc.insertElement('content', element, parent ? { id: parent, position: 'inside' } : undefined);
  }

  /** A group with its own style. */
  group(parent, style = {}) {
    const node = this.element(parent, 'group');
    if (Object.keys(style).length) this.doc.setNodeStyle(node, { ...this.doc.nodeStyle(node), ...style });
    return node;
  }

  /** A text element. */
  text(parent, html) {
    const node = this.element(parent, 'text');
    this.doc.setText(node, html);
    return node;
  }

  /** A media element of a file; null without the file or its HTML. */
  media(parent, file, settings) {
    if (!file?.key || typeof this.mediaHtml !== 'function') return null;
    const saved = { mode: 'files', record: Number(file.id) || 0, ...settings, file: file.key };
    const html = this.mediaHtml(file, saved);
    if (!html) return null;
    const node = this.element(parent, 'media');
    this.doc.setMedia(node, { settings: saved, html });
    return node;
  }

  /** A media element with a placeholder image of the bundle (`settings.placeholder`) until a file is chosen. */
  placeholder(parent, name, settings) {
    if (typeof this.placeholderHtml !== 'function') return null;
    const saved = { mode: 'files', record: 0, file: '', ...settings, placeholder: name };
    const node = this.element(parent, 'media');
    this.doc.setMedia(node, { settings: saved, html: this.placeholderHtml(name, saved) });
    return node;
  }

  /** A widget with its settings. */
  widget(parent, element, settings) {
    const node = this.element(parent, element);
    const instanceId = this.doc.find(node).node.attrs.find(([name]) => name === 'data-h-instance')[1];
    this.doc.setInstance(instanceId, { settings });
    return node;
  }

  /** Record cards without records (chosen in the page tree). */
  cards(parent) {
    return this.widget(parent, 'cards', { mode: 'manual', query: null, template: null, presentation: 'list', action: 'none' });
  }

  /** A media gallery as a slideshow of placeholder images (files are chosen in the page tree). */
  gallery(parent, names) {
    const settings = {
      mode: 'files', ids: [], caption: false, width: 'auto', height: 'auto',
      presentation: 'slider', action: 'none', slider: { duration: 4000, fade: 500, navigation: true, fit: 'width' }
    };
    const html = typeof this.galleryHtml === 'function' ? this.galleryHtml(names) : null;
    return this.widget(parent, 'gallery', html ? { ...settings, html } : settings);
  }
}

/** A form value as trimmed text. */
function text(value) {
  return String(value ?? '').trim();
}

/** Plain text as paragraphs (empty lines) with line breaks. */
function paragraphs(value) {
  const plain = text(value);
  if (!plain) return '';
  return plain.split(/\n\s*\n/).map((block) => `<p>${escapeHtml(block.trim()).replace(/\n/g, '<br>')}</p>`).join('');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
