import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCmsGalleryItem, buildCmsMedia, cmsMediaAction, cmsMediaCaption, cmsMediaType, cmsMediaView, isCmsMediaThumbnail } from '../src/site/cmsMedia.js';
import { fileMediaUrls } from '../src/recordview/fileMediaItem.js';
import { CmsRecordDocument } from '../src/site/cmsEdit.js';
import { checkCmsDocument } from '../src/site/cmsDocument.js';

const urls = fileMediaUrls('http://h/', 'db');
const file = (values) => ({ key: 'k1', name: 'a.jpg', ext: 'jpg', ...values });

test('cmsMediaType: images, players, services, IIIF, 3D, PDF; other files are not media', () => {
  assert.equal(cmsMediaType(file()), 'image');
  assert.equal(cmsMediaType(file({ ext: 'mp4' })), 'video');
  assert.equal(cmsMediaType(file({ ext: 'mp3' })), 'audio');
  assert.equal(cmsMediaType(file({ ext: '', url: 'https://www.youtube.com/watch?v=abcdefg' })), 'service');
  assert.equal(cmsMediaType(file({ ext: 'json', source: 'iiif' })), 'iiif');
  assert.equal(cmsMediaType(file({ ext: '', url: 'https://iiif.org/image/1/info.json' })), 'iiif');
  assert.equal(cmsMediaType(file({ ext: 'glb' })), '3d');
  assert.equal(cmsMediaType(file({ ext: 'nxz' })), '3dhop');
  assert.equal(cmsMediaType(file({ ext: 'pdf' })), 'pdf');
  assert.equal(cmsMediaType(file({ ext: 'docx', name: 'a.docx' })), null);
  assert.equal(cmsMediaType(file({ ext: '', name: 'photo.PNG' })), 'image', 'the extension of the name');
});

test('isCmsMediaThumbnail: both under 200 px, or one under 200 px and the other auto', () => {
  assert.equal(isCmsMediaThumbnail({ width: '150px', height: '120px' }), true);
  assert.equal(isCmsMediaThumbnail({ width: '150px', height: 'auto' }), true);
  assert.equal(isCmsMediaThumbnail({ width: 'auto', height: '199px' }), true);
  assert.equal(isCmsMediaThumbnail({ width: 'auto', height: 'auto' }), false, 'both auto: the full size');
  assert.equal(isCmsMediaThumbnail({ width: '150px', height: '300px' }), false);
  assert.equal(isCmsMediaThumbnail({ width: '50%', height: 'auto' }), false);
});

test('buildCmsMedia: image in its size, the OSD link in view mode; the caption without the link', () => {
  const plain = buildCmsMedia(file(), { width: '400px', height: 'auto' }, { urls, caption: 'A map' });
  assert.equal(plain, '<img src="http://h/?db=db&amp;file=k1" alt="A map" width="400" loading="lazy" /><figcaption>A map</figcaption>');
  const linked = buildCmsMedia(file(), { view: true }, { urls, caption: 'A & B' });
  assert.match(linked, /^<img src="http:\/\/h\/\?db=db&amp;file=k1"/, 'no link around the media');
  assert.match(linked, /<figcaption>A &amp; B <a href="[^"]+openSeadragonViewer[^"]+" target="_blank" rel="noreferrer noopener">Open in OSD viewer<\/a><\/figcaption>$/);
  assert.equal(cmsMediaCaption(linked), 'A & B', 'the caption of the HTML, without the link');
  const french = buildCmsMedia(file(), { view: true }, { urls, caption: 'Carte', language: 'fre' });
  assert.match(french, />Ouvrir dans OSD<\/a>/, 'link labels in the language');
  assert.match(buildCmsMedia(file(), { width: '100px' }, { urls }), /^<img src="http:\/\/h\/\?db=db&amp;thumb=k1" alt="a\.jpg" width="100"/, 'small: the thumbnail; alt = the file name');
});

test('buildCmsMedia: the action alone decides: inline players without it, no player and no details in view mode', () => {
  assert.equal(buildCmsMedia(file({ ext: 'mp4' }), { width: '640px', height: '360px' }, { urls }),
    '<video controls="" preload="metadata" src="http://h/?db=db&amp;file=k1" width="640" height="360"></video>');
  assert.equal(buildCmsMedia(file({ ext: 'mp3' }), {}, { urls }), '<audio controls="" preload="metadata" src="http://h/?db=db&amp;file=k1"></audio>');
  assert.match(buildCmsMedia(file({ ext: 'mp4' }), { width: '150px' }, { urls }), /^<img [^>]*thumb=k1/, 'without the action: the thumbnail only');
  const youtube = file({ ext: '', url: 'https://youtu.be/abcdefg' });
  assert.match(buildCmsMedia(youtube, { width: '480px', height: '270px' }, { urls }),
    /^<iframe src="https:\/\/www\.youtube\.com\/embed\/abcdefg" width="480" height="270" title="a\.jpg" loading="lazy" allow="autoplay; fullscreen" allowfullscreen=""><\/iframe>$/);
  for (const media of [file({ ext: 'mp4' }), file({ ext: 'mp3' }), youtube]) {
    const html = buildCmsMedia(media, { view: true }, { urls });
    assert.match(html, /^<img [^>]*thumb=k1/);
    assert.doesNotMatch(html, /<details|<iframe|<video|<audio/);
  }
  assert.match(buildCmsMedia(file({ ext: 'json', source: 'iiif' }), { view: true }, { urls }), /miradorViewer\.php\?db=db&amp;manifest=k1.*Open in Mirador/,
    'a registered manifest: manifest=');
  assert.match(buildCmsMedia(file({ ext: '', source: 'iiif_image', url: 'https://iiif.org/image/1/info.json' }), { view: true }, { urls }),
    /miradorViewer\.php\?db=db&amp;id=k1/, 'an IIIF image: id=');
  assert.match(buildCmsMedia(file({ ext: 'nxz' }), { view: true }, { urls }), /3dhopViewer\.php\?db=db&amp;file=k1.*Open 3D viewer/);
  assert.match(buildCmsMedia(file({ ext: 'glb' }), { view: true }, { urls }), /hclient\/widgets\/viewers\/3dViewer\.php/);
  assert.match(buildCmsMedia(file({ ext: 'pdf' }), { width: '300px', view: true }, { urls }), /^<img src="[^"]*thumb=k1".*>Open PDF<\/a>/);
  assert.equal(buildCmsMedia(file({ ext: 'docx', name: 'a.docx' }), {}, { urls }), '', 'not media: nothing');
});

test('a change of a translation is a change of the document: the saved state keeps the old value', () => {
  const content = '<figure data-h-node="a" data-h-media="m1" data-h-text=""><img src="x" alt="" /></figure>';
  const config = JSON.stringify({ schema: 'heurist-cms/4', instances: {}, styles: {}, media: { m1: { file: 'k1' } } });
  const doc = new CmsRecordDocument({ parts: { content }, config, translations: { fre: { a: 'old' } } });
  const saved = doc.serialize();
  doc.setMedia('a', { settings: { file: 'k1' }, html: '<img src="y" alt="" />', translations: { fre: 'new' } });
  assert.deepEqual(saved.translations, { fre: { a: 'old' } });
  assert.deepEqual(doc.serialize().translations, { fre: { a: 'new' } });
});

test('cmsMediaAction: an element saved with player opens as Player / Viewer', () => {
  assert.equal(cmsMediaAction({ player: true }), 'viewer');
  assert.equal(cmsMediaAction({ action: 'viewer' }), 'viewer');
  assert.equal(cmsMediaAction({ player: false }), 'none');
  assert.equal(cmsMediaAction({}), 'none');
});

test('a single media element carries the view on its node; without the action the attributes go', () => {
  const doc = new CmsRecordDocument({ parts: { content: '' }, config: '' });
  const id = doc.insertElement('content', 'media');
  const view = cmsMediaView(file(), urls);
  doc.setMedia(id, { settings: { file: 'k1', action: 'viewer' }, html: buildCmsMedia(file(), { view: true }, { urls }), view });
  const saved = doc.serialize().parts.content;
  assert.match(saved, /^<figure data-h-node="[^"]+" data-h-media="[^"]+" data-h-text="" data-h-view="image" data-h-full="http:\/\/h\/\?db=db&amp;file=k1">/);
  doc.setMedia(id, { settings: { file: 'k1' }, html: buildCmsMedia(file(), {}, { urls }) });
  assert.doesNotMatch(doc.serialize().parts.content, /data-h-view|data-h-full/);
});

test('CmsRecordDocument: a media element, its settings in the configuration, copy / paste, remove', () => {
  const doc = new CmsRecordDocument({ parts: { content: '' }, config: '' });
  const id = doc.insertElement('content', 'media');
  const item = doc.tree('content')[0];
  assert.equal(item.kind, 'media');
  assert.equal(item.configured, false, 'no file yet');
  const { mediaId, settings } = doc.media(id);
  assert.deepEqual(settings, { file: '', width: 'auto', height: 'auto', action: 'none', mode: 'files', record: 0 });
  const html = buildCmsMedia(file(), { view: false }, { urls, caption: 'Map' });
  assert.equal(doc.setMedia(id, { settings: { file: 'k1', action: 'viewer', record: 7 }, html, translations: { fre: '<img src="x" alt="" />' } }), true);
  let saved = doc.serialize();
  assert.equal(saved.parts.content, `<figure data-h-node="${id}" data-h-media="${mediaId}" data-h-text="">${html}</figure>`);
  assert.deepEqual(JSON.parse(saved.configuration).media,
    { [mediaId]: { file: 'k1', width: 'auto', height: 'auto', action: 'viewer', mode: 'files', record: 7 } });
  assert.deepEqual(saved.translations, { fre: { [id]: '<img src="x" alt="" />' } });
  assert.equal(doc.tree('content')[0].configured, true);
  assert.match(doc.tree('content')[0].label, /^media: Map/);
  assert.deepEqual(checkCmsDocument(JSON.parse(saved.configuration), [saved.parts.content], saved.translations), [], 'a valid page');
  // copy all and structure: the file and settings go with it
  const clip = doc.copy(id, 'structure');
  const pasted = doc.paste(clip, 'content', { id: null, position: 'inside' });
  const copy = doc.media(pasted);
  assert.notEqual(copy.mediaId, mediaId, 'a new media id');
  assert.equal(copy.settings.file, 'k1');
  assert.equal(copy.html, html, 'the static HTML, also in structure mode');
  doc.remove(id);
  saved = doc.serialize();
  assert.deepEqual(Object.keys(JSON.parse(saved.configuration).media), [copy.mediaId], 'the removed element forgets its media');
  assert.deepEqual(saved.translations, { fre: { [pasted]: '<img src="x" alt="" />' } }, 'the copy keeps its translation');
  doc.remove(pasted);
  assert.equal(JSON.parse(doc.serialize().configuration).media, undefined, 'no media left: no media map');
});

test('gallery: a figure; view mode has no player and no link around the media, the view is in data attributes', () => {
  const plain = buildCmsGalleryItem(file(), { width: 'auto', height: 'auto' }, { urls });
  assert.match(plain, /^<figure class="h-site-card" data-h-media=""><img /);
  const video = buildCmsGalleryItem(file({ ext: 'mp4', name: 'a.mp4' }), { view: true }, { urls });
  assert.match(video, /data-h-view="video" data-h-full="[^"]+"/);
  assert.doesNotMatch(video, /<video|<details/);
  const image = buildCmsGalleryItem(file(), { view: true }, { urls });
  assert.match(image, /data-h-view="image"/);
  assert.doesNotMatch(image, /<figure[^>]*><a /, 'the image itself is not a link');
  assert.match(image, /<figcaption><a [^>]*>Open in OSD viewer<\/a><\/figcaption>/);
  assert.equal(buildCmsGalleryItem(file({ ext: 'docx', name: 'a.docx' }), { view: true }, { urls }), '');
});

test('cmsMediaType: audio registered with another file type (mp2) or with a name in .mp3', () => {
  assert.equal(cmsMediaType(file({ ext: 'mp2', name: '02.Big Beautiful.mp3' })), 'audio');
  assert.equal(cmsMediaType(file({ ext: 'unknown', name: 'a.mp3' })), 'audio');
});

test('cmsMediaView: the file, the player with autoplay, or the viewer', () => {
  assert.equal(cmsMediaView(file(), urls).url, urls.file('k1'));
  const service = cmsMediaView(file({ ext: '', url: 'https://www.youtube.com/watch?v=abcdefg' }), urls);
  assert.deepEqual(service, { type: 'service', url: 'https://www.youtube.com/embed/abcdefg?autoplay=1' });
  assert.equal(cmsMediaView(file({ ext: 'glb' }), urls).url, urls.viewer3d('k1', '3d'));
  assert.equal(cmsMediaView(file({ ext: 'nxz' }), urls).type, '3dhop');
  assert.equal(cmsMediaView(file({ ext: 'pdf' }), urls).url, urls.file('k1'));
  assert.equal(cmsMediaView(file({ ext: 'docx', name: 'a.docx' }), urls), null);
});
