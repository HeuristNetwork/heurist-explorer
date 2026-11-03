/**
 * @file designerCatalog.js
 * @brief Catalogs of the CMS designer (plan 27c §19): page templates of *Add page* and elements of *Add element*,
 *        with their descriptions and wireframe previews (inline SVG).
 *
 * An entry: `{value, label, description (HTML), preview, available, pending}`. Entries that are not available yet
 * are shown grey and can not be added; `pending` templates can be added but give a blank page for now. A preview is a list of shapes in a 120 x 80 box:
 *   ['h', x, y, w, h]          heading bar        ['t', x, y, w, h]   text lines
 *   ['i', x, y, w, h]          image              ['b', x, y, w, h]   frame (group, card)
 *   ['m', x, y, w, h, label]   module or widget   ['f', x, y, w, h]   filled bar (button, tab, field)
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

/** Page templates of *Add page*; for now every template creates a blank page (templates come in a later phase). */
export const PAGE_TEMPLATES = Object.freeze([{
  label: '',
  items: [
    {
      value: 'blank', label: 'Blank', available: true, defaultTitle: '',
      description: 'A simple page with one text element: a heading with the page title and a paragraph.'
        + '<p>Add other elements to it in the editor.</p>',
      preview: [['h', 10, 8, 60, 7], ['t', 10, 22, 100, 40]]
    },
    {
      value: 'cover', label: 'Cover', available: true, pending: true, defaultTitle: 'Welcome',
      description: 'A full-screen background image with the project logo, title, a short description and a'
        + ' <i>Get started</i> button. The header and footer of the website are hidden on this page.',
      preview: [['i', 1, 1, 118, 78], ['i', 50, 14, 20, 16], ['h', 30, 36, 60, 7], ['t', 30, 46, 60, 12], ['f', 48, 62, 24, 8]]
    },
    {
      value: 'landing', label: 'Landing', available: true, pending: true, defaultTitle: 'Welcome',
      description: 'A welcome page: project logo and title, a short description of the project with one or two buttons'
        + ' (for example <i>Explore the data</i> and <i>About</i>) and an image beside them.<p>Usually the home page of the website.</p>',
      preview: [['i', 10, 8, 18, 18], ['h', 32, 13, 50, 7], ['t', 10, 32, 55, 26], ['f', 10, 64, 22, 7], ['f', 36, 64, 22, 7], ['i', 72, 30, 38, 40]]
    },
    {
      value: 'about', label: 'About', available: true, pending: true, defaultTitle: 'About',
      description: 'Describes your project in several sections, each with a heading, text and an image: aims, history,'
        + ' sources, methods, funding and partners.',
      preview: [['h', 10, 6, 50, 7], ['i', 10, 18, 30, 24], ['h', 46, 18, 40, 5], ['t', 46, 26, 64, 16],
        ['h', 10, 48, 40, 5], ['t', 10, 56, 64, 16], ['i', 80, 48, 30, 24]]
    },
    {
      value: 'features', label: 'Features', available: true, pending: true, defaultTitle: 'Features',
      description: 'The main features or parts of the project as cards, each with an image, a short description and a'
        + ' link to a page of the website.',
      preview: [['h', 10, 6, 40, 7], ['b', 8, 20, 32, 54], ['i', 11, 23, 26, 18], ['t', 11, 44, 26, 26],
        ['b', 44, 20, 32, 54], ['i', 47, 23, 26, 18], ['t', 47, 44, 26, 26],
        ['b', 80, 20, 32, 54], ['i', 83, 23, 26, 18], ['t', 83, 44, 26, 26]]
    },
    {
      value: 'team', label: 'Team', available: true, pending: true, defaultTitle: 'Team',
      description: 'Presents the project team: a card for each person with a photo, name, role and a short biography'
        + ' or a link to more information.',
      preview: [['h', 10, 6, 40, 7], ['b', 10, 20, 46, 26], ['i', 13, 23, 14, 20], ['t', 30, 24, 23, 18],
        ['b', 64, 20, 46, 26], ['i', 67, 23, 14, 20], ['t', 84, 24, 23, 18],
        ['b', 10, 50, 46, 26], ['i', 13, 53, 14, 20], ['t', 30, 54, 23, 18],
        ['b', 64, 50, 46, 26], ['i', 67, 53, 14, 20], ['t', 84, 54, 23, 18]]
    },
    {
      value: 'discover', label: 'Discover', available: true, pending: true, defaultTitle: 'Discover',
      description: 'A discovery page that combines search filters with presentation modules: data (list or table), map,'
        + ' timeline, graph, custom report and crosstabs.<p>The modules show the same records: a selection in one of them'
        + ' is shown in the others.</p>',
      preview: [['m', 8, 6, 26, 68, 'Filter'], ['m', 38, 6, 74, 40, 'Map'], ['m', 38, 50, 36, 24, 'Data'], ['m', 76, 50, 36, 24, 'Timeline']]
    },
    {
      value: 'blog', label: 'Blog', available: true, pending: true, defaultTitle: 'News',
      description: 'A blog or news page with dated posts, the newest first, to keep visitors informed about the latest'
        + ' work, events and publications of your project.',
      preview: [['h', 10, 6, 40, 7], ['i', 10, 18, 22, 16], ['h', 36, 18, 50, 4], ['t', 36, 25, 74, 9],
        ['i', 10, 40, 22, 16], ['h', 36, 40, 50, 4], ['t', 36, 47, 74, 9], ['i', 10, 62, 22, 14], ['h', 36, 62, 50, 4], ['t', 36, 69, 74, 7]]
    },
    {
      value: 'contact', label: 'Contact', available: true, pending: true, defaultTitle: 'Contact',
      description: 'A contact page: contact details of the project and an email form which visitors use to send a'
        + ' message (the email address is not shown on the page).',
      preview: [['h', 10, 6, 40, 7], ['t', 10, 20, 40, 30], ['f', 60, 20, 50, 7], ['f', 60, 31, 50, 7], ['f', 60, 42, 50, 20], ['f', 88, 66, 22, 7]]
    },
    {
      value: 'record', label: 'Record page', available: true, pending: true, defaultTitle: 'Record',
      description: 'The full view of one record of the database (record view), for example a person, place or'
        + ' document. Other pages, menus and reports link to it with the record id.',
      preview: [['h', 10, 6, 60, 7], ['m', 8, 18, 104, 56, 'Record view']]
    },
    {
      value: 'publications', label: 'Publications', available: true, pending: true, defaultTitle: 'Publications',
      description: 'A bibliography: the publications of the project or the references of the database as a list made by'
        + ' a custom report, grouped by year or type.',
      preview: [['h', 10, 6, 50, 7], ['h', 10, 18, 20, 4], ['t', 10, 24, 100, 16], ['h', 10, 46, 20, 4], ['t', 10, 52, 100, 22]]
    }
  ]
}]);

/** Elements of *Add element* (values of CMS_ELEMENTS where available) in three groups. */
export const ELEMENT_GROUPS = Object.freeze([
  {
    label: 'Content and layout',
    items: [
      {
        value: 'text', label: 'Text', available: true, title: 'heading',
        description: 'The simple text box contains WYSIWYG text which can be edited with the embedded TinyMCE text editor.'
          + ' This allows for headings, font styles, quotes, hyperlinks, etc.<p>Embedded media referenced by the database'
          + ' (whether local to the database or a remote reference) will be rendered in place in the page.</p><p>The simple'
          + ' text box may occupy the whole width of the page or be placed within a group or other element to be scaled'
          + ' in width and/or sit next to other elements.</p>',
        preview: [['h', 10, 10, 60, 7], ['t', 10, 24, 100, 46]]
      },
      {
        value: 'media', label: 'Media', available: true,
        description: 'An image, a video or audio player, or a YouTube, Vimeo or SoundCloud player with a caption, from a'
          + ' registered file of the database. IIIF, 3D files and PDF are shown as their thumbnail with a link to their'
          + ' viewer.<p>A small size (under 200 px) shows the thumbnail: a click on it can open the full view or the'
          + ' player.</p>',
        preview: [['i', 20, 8, 80, 50], ['t', 30, 64, 60, 8]]
      },
      {
        value: 'group', label: 'Group', available: true, title: 'caption',
        description: 'A group is normally used to keep several other elements together so that they can be displayed and'
          + ' scaled across the page, for example a search on the left, results in the middle and a map on the right.'
          + '<p>Groups will normally be defined as flex so that they can adjust widths or heights proportionally according'
          + ' to the width and height of the screen or container.</p><p>Without groups, all the elements are displayed'
          + ' one above the other.</p>',
        preview: [['b', 8, 8, 104, 64], ['b', 14, 14, 44, 52], ['b', 62, 14, 44, 52]]
      },
      {
        value: 'columns2', label: 'Text in two columns', available: true, title: 'caption',
        description: 'A group with two side-by-side columns containing editable text. On narrow screens the columns are'
          + ' shown one above the other.',
        preview: [['t', 8, 10, 50, 60], ['t', 62, 10, 50, 60]]
      },
      {
        value: 'columns3', label: 'Text in three columns', available: true, title: 'caption',
        description: 'A group with three side-by-side columns containing editable text. On narrow screens the columns are'
          + ' shown one above the other.',
        preview: [['t', 8, 10, 32, 60], ['t', 44, 10, 32, 60], ['t', 80, 10, 32, 60]]
      },
      {
        value: 'accordion', label: 'Accordion', available: true,
        description: 'Organises content into collapsible sections, allowing one or more sections to be opened as required.'
          + '<p>Each section has a label and takes any other elements.</p>',
        preview: [['f', 8, 8, 104, 8], ['t', 12, 20, 96, 22], ['f', 8, 46, 104, 8], ['f', 8, 58, 104, 8]]
      },
      {
        value: 'tabs', label: 'Tabs', available: true,
        description: 'Organises content into separate tabbed sections, with one section displayed at a time.'
          + '<p>Each tab has a label and takes any other elements.</p>',
        preview: [['f', 8, 8, 26, 8], ['f', 36, 8, 26, 8], ['f', 64, 8, 26, 8], ['b', 8, 16, 104, 56], ['t', 14, 24, 92, 40]]
      }
    ]
  },
  {
    label: 'Modules',
    items: [
      {
        value: 'explorer', label: 'Explorer', available: true,
        description: 'A combination of all presentation modules (data, map, timeline, graph, record view ...) in a flexible'
          + ' and configurable cardinal layout, or a column layout on narrow (mobile) screens, with search filters.',
        preview: [['m', 8, 6, 26, 68, 'Filter'], ['m', 38, 6, 42, 68, 'Data'], ['m', 84, 6, 28, 33, 'Map'], ['m', 84, 41, 28, 33, 'Record']]
      },
      {
        value: 'data', label: 'Data', available: true,
        description: 'The records as a list or a table, with sorting, paging and selection; a click opens the record.',
        preview: [['f', 8, 8, 104, 7], ['t', 8, 20, 104, 52]]
      },
      {
        value: 'map', label: 'Map', available: true,
        description: 'Records with spatial data on a map, with base maps, map documents, layers and thematic maps.',
        preview: [['m', 8, 8, 104, 64, 'Map']]
      },
      {
        value: 'timeline', label: 'Timeline', available: true,
        description: 'Records with dates and date ranges on a timeline that can be zoomed and moved.',
        preview: [['f', 12, 20, 40, 6], ['f', 30, 32, 60, 6], ['f', 62, 44, 34, 6], ['f', 20, 56, 20, 6], ['b', 8, 66, 104, 6]]
      },
      {
        value: 'graph', label: 'Graph', available: true,
        description: 'Records as nodes of a network graph, with their links and relationships as edges; nodes can be'
          + ' expanded to their linked records.',
        preview: [['m', 8, 8, 104, 64, 'Graph']]
      },
      {
        value: 'recordview', label: 'Record view', available: true,
        description: 'The full view of one record: its fields, media and linked records. It shows the record selected in'
          + ' other modules, or a fixed record.',
        preview: [['h', 10, 8, 60, 7], ['i', 10, 20, 30, 24], ['t', 46, 20, 64, 50], ['t', 10, 50, 30, 20]]
      },
      {
        value: 'crosstabs', label: 'Crosstabs',
        description: 'A cross tabulation of the records by the values of two or more fields, with counts, sums or averages'
          + ' and charts.',
        preview: [['f', 8, 8, 104, 7], ['b', 8, 18, 104, 54], ['t', 12, 22, 96, 46]]
      },
      {
        value: 'storymap', label: 'Story map',
        description: 'Presents an ordered sequence of records as a narrated story linked to places on a map (and dates on a'
          + ' timeline).',
        preview: [['t', 8, 8, 36, 64], ['m', 48, 8, 64, 64, 'Map']]
      }
    ]
  },
  {
    label: 'Widgets',
    items: [
      {
        value: 'menu', label: 'Menu', available: true,
        description: 'Provides a navigation menu containing links to the pages of the website.',
        preview: [['f', 8, 10, 104, 9], ['t', 8, 28, 104, 40]]
      },
      {
        value: 'report', label: 'Custom report',
        description: 'Loads and shows a generated custom report: the report of the current records or of a selected'
          + ' record, or a file generated by a report schedule.',
        preview: [['h', 10, 8, 50, 6], ['t', 10, 20, 100, 52]]
      },
      {
        value: 'actionmenu', label: 'Action menu',
        description: 'A list of actions presented as buttons, a navigation bar or a tree that allows to'
          + '<ul><li>go to a page,</li><li>open the information of a record,</li><li>run a saved filter,</li>'
          + '<li>add a new record.</li></ul>',
        preview: [['f', 8, 10, 30, 9], ['f', 44, 10, 30, 9], ['f', 80, 10, 30, 9], ['t', 8, 28, 104, 40]]
      },
      {
        value: 'gallery', label: 'Media viewer / gallery',
        description: 'Displays images and other media of the records as a viewer or a thumbnail gallery.',
        preview: [['i', 8, 8, 32, 30], ['i', 44, 8, 32, 30], ['i', 80, 8, 32, 30], ['i', 8, 42, 32, 30], ['i', 44, 42, 32, 30], ['i', 80, 42, 32, 30]]
      },
      {
        value: 'badges', label: 'Badges',
        description: 'A row of logos with links: the participant and sponsor bodies of the project, or social media'
          + ' and other resources of the project.',
        preview: [['i', 6, 28, 22, 22], ['i', 34, 28, 22, 22], ['i', 62, 28, 22, 22], ['i', 90, 28, 22, 22]]
      },
      {
        value: 'language', label: 'Language switcher',
        description: 'Switches the website to another of its languages (multilingual websites); the visitor stays on'
          + ' the same page.',
        preview: [['f', 70, 10, 12, 8], ['f', 84, 10, 12, 8], ['f', 98, 10, 12, 8], ['t', 8, 28, 104, 40]]
      },
      {
        value: 'email', label: 'Email form',
        description: 'A form which visitors use to send an email to the website owner (the address is not shown).',
        preview: [['f', 10, 10, 100, 8], ['f', 10, 22, 100, 8], ['f', 10, 34, 100, 26], ['f', 82, 64, 28, 8]]
      }
    ]
  }
]);

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Wireframe preview of a catalog entry.
 *
 * @param {Array<Array>} shapes See the file header.
 * @returns {SVGElement}
 */
export function previewSvg(shapes = []) {
  const svg = node('svg', { viewBox: '0 0 120 80', class: 'h-cms-pv', 'aria-hidden': 'true' });
  svg.append(node('rect', { x: 1, y: 1, width: 118, height: 78, rx: 3, class: 'h-cms-pv-page' }));
  for (const [kind, x, y, w, h, label] of shapes) {
    if (kind === 't') {
      for (let line = y + 2; line < y + h; line += 6) {
        const width = line + 6 >= y + h ? w * 0.6 : w;
        svg.append(node('rect', { x, y: line, width, height: 2.5, rx: 1, class: 'h-cms-pv-line' }));
      }
    } else if (kind === 'i') {
      svg.append(node('rect', { x, y, width: w, height: h, class: 'h-cms-pv-image' }));
      svg.append(node('path', { d: `M${x} ${y + h}L${x + w * 0.4} ${y + h * 0.45}L${x + w * 0.65} ${y + h * 0.75}L${x + w * 0.8} ${y + h * 0.6}L${x + w} ${y + h}Z`, class: 'h-cms-pv-hill' }));
    } else if (kind === 'b') {
      svg.append(node('rect', { x, y, width: w, height: h, rx: 2, class: 'h-cms-pv-frame' }));
    } else if (kind === 'm') {
      svg.append(node('rect', { x, y, width: w, height: h, rx: 2, class: 'h-cms-pv-module' }));
      // font size in units of the 120 x 80 box
      const text = node('text', { x: x + w / 2, y: y + h / 2 + 2.5, 'font-size': 7, class: 'h-cms-pv-label' });
      text.textContent = label || '';
      svg.append(text);
    } else {
      svg.append(node('rect', { x, y, width: w, height: h, rx: 1.5, class: kind === 'h' ? 'h-cms-pv-heading' : 'h-cms-pv-bar' }));
    }
  }
  return svg;
}

function node(tag, attrs) {
  const element = document.createElementNS ? document.createElementNS(SVG, tag) : document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, String(value));
  return element;
}
