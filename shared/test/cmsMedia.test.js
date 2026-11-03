import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCmsMedia, cmsMediaCaption, cmsMediaType, isCmsMediaThumbnail } from '../src/site/cmsMedia.js';
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

test('buildCmsMedia: image in its size, the OSD link with player; the caption without the link', () => {
  const plain = buildCmsMedia(file(), { width: '400px', height: 'auto' }, { urls, caption: 'A map' });
  assert.equal(plain, '<img src="http://h/?db=db&amp;file=k1" alt="A map" width="400" loading="lazy" /><figcaption>A map</figcaption>');
  const linked = buildCmsMedia(file(), { player: true }, { urls, caption: 'A & B' });
  assert.match(linked, /^<a href="http:\/\/h\/hclient\/widgets\/viewers\/openSeadragonViewer\.php\?db=db&amp;id=k1" target="_blank" rel="noreferrer noopener"><img src="http:\/\/h\/\?db=db&amp;file=k1"/);
  assert.match(linked, /<figcaption>A &amp; B <a href="[^"]+openSeadragonViewer[^"]+" target="_blank" rel="noreferrer noopener">Open in OSD viewer<\/a><\/figcaption>$/);
  assert.equal(cmsMediaCaption(linked), 'A & B', 'the caption of the HTML, without the link');
  const french = buildCmsMedia(file(), { player: true }, { urls, caption: 'Carte', language: 'fre' });
  assert.match(french, />Ouvrir dans OSD<\/a>/, 'link labels in the language');
  assert.match(buildCmsMedia(file(), { width: '100px' }, { urls }), /^<img src="http:\/\/h\/\?db=db&amp;thumb=k1" alt="a\.jpg" width="100"/, 'small: the thumbnail; alt = the file name');
});

test('buildCmsMedia: video and audio players; thumbnail + player without a script; services; viewers', () => {
  assert.equal(buildCmsMedia(file({ ext: 'mp4' }), { width: '640px', height: '360px' }, { urls }),
    '<video controls="" preload="metadata" src="http://h/?db=db&amp;file=k1" width="640" height="360"></video>');
  assert.equal(buildCmsMedia(file({ ext: 'mp3' }), {}, { urls }), '<audio controls="" preload="metadata" src="http://h/?db=db&amp;file=k1"></audio>');
  const switched = buildCmsMedia(file({ ext: 'mp4' }), { width: '150px', player: true }, { urls });
  assert.match(switched, /^<details class="h-site-media-play"><summary><img src="http:\/\/h\/\?db=db&amp;thumb=k1"[^>]*\/><\/summary><video controls="" preload="none" src="[^"]+"><\/video><\/details>$/);
  assert.match(buildCmsMedia(file({ ext: 'mp4' }), { width: '150px' }, { urls }), /^<img [^>]*thumb=k1/, 'without player: the thumbnail only');
  const youtube = file({ ext: '', url: 'https://youtu.be/abcdefg' });
  assert.match(buildCmsMedia(youtube, { width: '480px', height: '270px' }, { urls }),
    /^<iframe src="https:\/\/www\.youtube\.com\/embed\/abcdefg" width="480" height="270" title="a\.jpg" loading="lazy" allow="autoplay; fullscreen" allowfullscreen=""><\/iframe>$/);
  assert.match(buildCmsMedia(youtube, { width: '120px', player: true }, { urls }), /<summary>.*<\/summary><iframe src="https:\/\/www\.youtube\.com\/embed\/abcdefg\?autoplay=1"/);
  assert.match(buildCmsMedia(file({ ext: 'json', source: 'iiif' }), { player: true }, { urls }), /miradorViewer\.php\?db=db&amp;manifest=k1.*Open in Mirador/,
    'a registered manifest: manifest=');
  assert.match(buildCmsMedia(file({ ext: '', source: 'iiif_image', url: 'https://iiif.org/image/1/info.json' }), { player: true }, { urls }),
    /miradorViewer\.php\?db=db&amp;id=k1/, 'an IIIF image: id=');
  // the player opened from the thumbnail: the player size; a service 480 × 270 when auto
  assert.match(buildCmsMedia(file({ ext: 'mp4' }), { width: '150px', player: true, playerWidth: '800px' }, { urls }),
    /<video controls="" preload="none" src="[^"]+" width="800"><\/video>/);
  assert.match(buildCmsMedia(youtube, { width: '120px', player: true }, { urls }), /autoplay=1" width="480" height="270"/);
  assert.match(buildCmsMedia(youtube, { width: '120px', player: true, playerWidth: '640px', playerHeight: '360px' }, { urls }),
    /autoplay=1" width="640" height="360"/);
  assert.match(buildCmsMedia(file({ ext: 'nxz' }), { player: true }, { urls }), /3dhopViewer\.php\?db=db&amp;file=k1.*Open 3D viewer/);
  assert.match(buildCmsMedia(file({ ext: 'glb' }), { player: true }, { urls }), /hclient\/widgets\/viewers\/3dViewer\.php/);
  assert.match(buildCmsMedia(file({ ext: 'pdf' }), { width: '300px', player: true }, { urls }),
    /^<a href="http:\/\/h\/\?db=db&amp;file=k1" target="_blank" rel="noreferrer noopener"><img src="[^"]*thumb=k1" alt="a\.pdf|a\.jpg"/);
  assert.equal(buildCmsMedia(file({ ext: 'docx', name: 'a.docx' }), {}, { urls }), '', 'not media: nothing');
});

test('CmsRecordDocument: a media element, its settings in the configuration, copy / paste, remove', () => {
  const doc = new CmsRecordDocument({ parts: { content: '' }, config: '' });
  const id = doc.insertElement('content', 'media');
  const item = doc.tree('content')[0];
  assert.equal(item.kind, 'media');
  assert.equal(item.configured, false, 'no file yet');
  const { mediaId, settings } = doc.media(id);
  assert.deepEqual(settings, { file: '', width: 'auto', height: 'auto', player: false, playerWidth: 'auto', playerHeight: 'auto' });
  const html = buildCmsMedia(file(), { player: true }, { urls, caption: 'Map' });
  assert.equal(doc.setMedia(id, { settings: { file: 'k1', player: true }, html, translations: { fre: '<img src="x" alt="" />' } }), true);
  let saved = doc.serialize();
  assert.equal(saved.parts.content, `<figure data-h-node="${id}" data-h-media="${mediaId}" data-h-text="">${html}</figure>`);
  assert.deepEqual(JSON.parse(saved.configuration).media,
    { [mediaId]: { file: 'k1', width: 'auto', height: 'auto', player: true, playerWidth: 'auto', playerHeight: 'auto' } });
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
