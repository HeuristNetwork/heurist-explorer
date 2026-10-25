-- defFileExtToMimetype (plan 20 §10.11, 2026-10-23): the extensions that may be uploaded and their
-- MIME types, in step with the MIME type vocabulary (20-mime-vocabulary.sql). Every database has its
-- own copy: run on each database (and change the install SQL of new databases the same way).
-- Removed: outdated types, scripts and executables. Fixed: wrong descriptions and MIME types.
-- Existing MIME types of kept extensions do not change (legacy code checks application/x-zip-compressed).

START TRANSACTION;

-- 1. outdated types, scripts, executables
-- registered files keep their extension (foreign key fk_ulf_MimeExt): these stay, listed here
SELECT ulf_MimeExt AS kept_extension, COUNT(*) AS files FROM recUploadedFiles WHERE ulf_MimeExt IN ('ashx', 'bcpio', 'cda', 'class', 'cpio', 'cpt', 'csh', 'dcr', 'dir', 'dll', 'dmg', 'dms', 'dvi', 'dxr', 'etx', 'exe', 'flv', 'gra', 'gram', 'grxml', 'hqx', 'ice', 'ief', 'jar', 'kar', 'lha', 'lnk', 'lzh', 'm3u', 'm4u', 'man', 'me', 'mesh', 'movie', 'ms', 'msh', 'mxu', 'oda', 'pbm', 'pgm', 'pgn', 'pl', 'pnm', 'ppm', 'ra', 'ram', 'ras', 'rgb', 'rm', 'rtx', 'sh', 'shar', 'shs', 'silo', 'sit', 'skd', 'skm', 'skt', 'smi', 'smil', 'so', 'spl', 'src', 'sv4cpio', 'sv4crc', 'swf', 't', 'tcl', 'texi', 'texinfo', 'tr', 'ustar', 'vcd', 'vob', 'vxml', 'wbmp', 'wbxml', 'wml', 'wmlc', 'wmls', 'wmlsc', 'xbm', 'xpm', 'xul', 'xwd') GROUP BY ulf_MimeExt;
DELETE FROM defFileExtToMimetype WHERE fxm_Extension IN ('ashx', 'bcpio', 'cda', 'class', 'cpio', 'cpt', 'csh', 'dcr', 'dir', 'dll', 'dmg', 'dms', 'dvi', 'dxr', 'etx', 'exe', 'flv', 'gra', 'gram', 'grxml', 'hqx', 'ice', 'ief', 'jar', 'kar', 'lha', 'lnk', 'lzh', 'm3u', 'm4u', 'man', 'me', 'mesh', 'movie', 'ms', 'msh', 'mxu', 'oda', 'pbm', 'pgm', 'pgn', 'pl', 'pnm', 'ppm', 'ra', 'ram', 'ras', 'rgb', 'rm', 'rtx', 'sh', 'shar', 'shs', 'silo', 'sit', 'skd', 'skm', 'skt', 'smi', 'smil', 'so', 'spl', 'src', 'sv4cpio', 'sv4crc', 'swf', 't', 'tcl', 'texi', 'texinfo', 'tr', 'ustar', 'vcd', 'vob', 'vxml', 'wbmp', 'wbxml', 'wml', 'wmlc', 'wmls', 'wmlsc', 'xbm', 'xpm', 'xul', 'xwd')
    AND fxm_Extension NOT IN (SELECT ulf_MimeExt FROM (SELECT DISTINCT ulf_MimeExt FROM recUploadedFiles WHERE ulf_MimeExt IS NOT NULL) AS used);

-- 2. descriptions (fxm_FiletypeName, at most 31 characters)
UPDATE defFileExtToMimetype SET fxm_FiletypeName='dBase table' WHERE fxm_Extension='dbf';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='GeoJSON' WHERE fxm_Extension='geojson';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='IGES drawing' WHERE fxm_Extension='iges';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='IGES drawing' WHERE fxm_Extension='igs';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='JSON' WHERE fxm_Extension='json';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='MathML' WHERE fxm_Extension='mathml';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Microsoft PowerPoint slide show' WHERE fxm_Extension='pps';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Microsoft Word document' WHERE fxm_Extension='doc';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Microsoft Word document' WHERE fxm_Extension='dot';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Binary data' WHERE fxm_Extension='bin';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Binary data' WHERE fxm_Extension='cdf';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Binary data' WHERE fxm_Extension='dat';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Binary data' WHERE fxm_Extension='db';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Binary data' WHERE fxm_Extension='mxd';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Binary data' WHERE fxm_Extension='shp';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Binary data' WHERE fxm_Extension='shx';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Binary data' WHERE fxm_Extension='xyz';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Microsoft OneNote document' WHERE fxm_Extension='one';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='PDF document' WHERE fxm_Extension='pdf';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='PostScript' WHERE fxm_Extension='ps';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Adobe Illustrator drawing' WHERE fxm_Extension='ai';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='RDF/XML' WHERE fxm_Extension='rdf';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='KML' WHERE fxm_Extension='kml';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='KMZ (compressed KML)' WHERE fxm_Extension='kmz';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Adobe FrameMaker interchange' WHERE fxm_Extension='mif';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Microsoft Excel worksheet' WHERE fxm_Extension='xls';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Microsoft PowerPoint presentati' WHERE fxm_Extension='ppt';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='OpenDocument text' WHERE fxm_Extension='odt';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Microsoft Word document (docx)' WHERE fxm_Extension='docx';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='SketchUp model' WHERE fxm_Extension='skp';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Microsoft Visio diagram' WHERE fxm_Extension='vsd';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='EndNote connection' WHERE fxm_Extension='enz';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='TrueType font' WHERE fxm_Extension='ttf';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='GNU tar archive' WHERE fxm_Extension='gtar';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Hierarchical Data Format' WHERE fxm_Extension='hdf';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='LaTeX source' WHERE fxm_Extension='latex';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='LaTeX source' WHERE fxm_Extension='tex';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='NetCDF data' WHERE fxm_Extension='nc';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='MBTiles map tiles (SQLite)' WHERE fxm_Extension='mbtiles';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='tar archive' WHERE fxm_Extension='tar';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='ZIP archive' WHERE fxm_Extension='zip';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='XHTML document' WHERE fxm_Extension='xht';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='XHTML document' WHERE fxm_Extension='xhtml';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='XML' WHERE fxm_Extension='xml';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='XML document type definition' WHERE fxm_Extension='dtd';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Basic audio (au, snd)' WHERE fxm_Extension='au';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Basic audio (au, snd)' WHERE fxm_Extension='snd';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='MIDI' WHERE fxm_Extension='mid';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='MIDI' WHERE fxm_Extension='midi';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='MP3 audio' WHERE fxm_Extension='mp3';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='MPEG audio' WHERE fxm_Extension='mp2';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='MPEG audio' WHERE fxm_Extension='mpga';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='SoundCloud' WHERE fxm_Extension='soundcloud';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='AIFF audio' WHERE fxm_Extension='aif';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='AIFF audio' WHERE fxm_Extension='aifc';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='AIFF audio' WHERE fxm_Extension='aiff';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Windows Media audio' WHERE fxm_Extension='wma';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='WAV audio' WHERE fxm_Extension='wav';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Protein Data Bank' WHERE fxm_Extension='pdb';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='BMP image' WHERE fxm_Extension='bmp';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Computer Graphics Metafile' WHERE fxm_Extension='cgm';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='GIF image' WHERE fxm_Extension='gif';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='JPEG image' WHERE fxm_Extension='jpe';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='JPEG image' WHERE fxm_Extension='jpeg';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='JPEG image' WHERE fxm_Extension='jpg';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='PNG image' WHERE fxm_Extension='png';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='SVG drawing' WHERE fxm_Extension='svg';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='TIFF image' WHERE fxm_Extension='tif';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='TIFF image' WHERE fxm_Extension='tiff';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Adobe Photoshop image' WHERE fxm_Extension='psd';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='DjVu scanned image' WHERE fxm_Extension='djvu';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Encapsulated PostScript' WHERE fxm_Extension='eps';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Windows icon' WHERE fxm_Extension='ico';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Windows metafile' WHERE fxm_Extension='wmf';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='E-mail message' WHERE fxm_Extension='eml';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='VRML model' WHERE fxm_Extension='vrml';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='VRML model' WHERE fxm_Extension='wrl';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='iCalendar' WHERE fxm_Extension='ics';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='iCalendar' WHERE fxm_Extension='ifb';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='CSS style sheet' WHERE fxm_Extension='css';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='CSV (comma separated values)' WHERE fxm_Extension='csv';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='HTML page' WHERE fxm_Extension='htm';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='HTML page' WHERE fxm_Extension='html';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Plain text' WHERE fxm_Extension='asc';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Plain text' WHERE fxm_Extension='c';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Plain text' WHERE fxm_Extension='ini';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Plain text' WHERE fxm_Extension='sql';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Plain text' WHERE fxm_Extension='txt';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Rich Text Format' WHERE fxm_Extension='rtf';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='SGML' WHERE fxm_Extension='sgm';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='SGML' WHERE fxm_Extension='sgml';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='TSV (tab separated values)' WHERE fxm_Extension='tsv';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='XSL style sheet' WHERE fxm_Extension='xsl';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='XSLT transformation' WHERE fxm_Extension='xslt';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='MP4 video' WHERE fxm_Extension='mp4';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='MPEG video' WHERE fxm_Extension='mpe';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='MPEG video' WHERE fxm_Extension='mpeg';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='MPEG video' WHERE fxm_Extension='mpg';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Ogg video' WHERE fxm_Extension='ogg';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Ogg video' WHERE fxm_Extension='ogv';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='QuickTime video' WHERE fxm_Extension='mov';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='QuickTime video' WHERE fxm_Extension='qt';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Vimeo video' WHERE fxm_Extension='vimeo';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='WebM video' WHERE fxm_Extension='webm';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='Windows Media video' WHERE fxm_Extension='wmv';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='AVI video' WHERE fxm_Extension='avi';
UPDATE defFileExtToMimetype SET fxm_FiletypeName='YouTube video' WHERE fxm_Extension='youtube';

-- 3. MIME types that were wrong
UPDATE defFileExtToMimetype SET fxm_MimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fxm_FiletypeName='Microsoft Excel workbook (xlsx)' WHERE fxm_Extension='xlsx';
UPDATE defFileExtToMimetype SET fxm_MimeType='application/vnd.openxmlformats-officedocument.presentationml.presentation', fxm_FiletypeName='Microsoft PowerPoint (pptx)' WHERE fxm_Extension='pptx';
UPDATE defFileExtToMimetype SET fxm_MimeType='text/javascript', fxm_FiletypeName='JavaScript' WHERE fxm_Extension='js';
UPDATE defFileExtToMimetype SET fxm_MimeType='audio/ogg', fxm_FiletypeName='Ogg audio' WHERE fxm_Extension='ogg';  -- .ogv stays video/ogg

-- 4. new extensions
INSERT IGNORE INTO defFileExtToMimetype (fxm_Extension, fxm_MimeType, fxm_OpenNewWindow, fxm_IconFileName, fxm_FiletypeName, fxm_ImagePlaceholder) VALUES
    ('webp', 'image/webp', 0, '', 'WebP image', ''),
    ('avif', 'image/avif', 0, '', 'AVIF image', ''),
    ('heic', 'image/heic', 0, '', 'HEIC image', ''),
    ('heif', 'image/heic', 0, '', 'HEIC image', ''),
    ('m4a', 'audio/mp4', 0, '', 'MPEG-4 audio', ''),
    ('flac', 'audio/flac', 0, '', 'FLAC audio', ''),
    ('oga', 'audio/ogg', 0, '', 'Ogg audio', ''),
    ('opus', 'audio/ogg', 0, '', 'Ogg audio', ''),
    ('aac', 'audio/aac', 0, '', 'AAC audio', ''),
    ('mkv', 'video/x-matroska', 0, '', 'Matroska video', ''),
    ('ods', 'application/vnd.oasis.opendocument.spreadsheet', 0, '', 'OpenDocument spreadsheet', ''),
    ('odp', 'application/vnd.oasis.opendocument.presentation', 0, '', 'OpenDocument presentation', ''),
    ('epub', 'application/epub+zip', 0, '', 'EPUB e-book', ''),
    ('md', 'text/markdown', 0, '', 'Markdown', ''),
    ('jsonld', 'application/ld+json', 0, '', 'JSON-LD', ''),
    ('ttl', 'text/turtle', 0, '', 'RDF Turtle', ''),
    ('gpx', 'application/gpx+xml', 0, '', 'GPS exchange format', ''),
    ('gpkg', 'application/geopackage+sqlite3', 0, '', 'GeoPackage', ''),
    ('7z', 'application/x-7z-compressed', 0, '', '7-Zip archive', ''),
    ('gz', 'application/gzip', 0, '', 'gzip archive', ''),
    ('gltf', 'model/gltf+json', 0, '', 'glTF model', ''),
    ('glb', 'model/gltf-binary', 0, '', 'glTF binary model', ''),
    ('obj', 'model/obj', 0, '', 'Wavefront OBJ model', ''),
    ('stl', 'model/stl', 0, '', 'STL model', ''),
    ('jp2', 'image/jp2', 0, '', 'JPEG 2000 image', '');

COMMIT;  -- or ROLLBACK
