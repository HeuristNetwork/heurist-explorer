-- MIME type vocabulary 2-533 (plan 20 §10.11, 2026-10-23): nested by groups, all MIME types.
--
-- For the Heurist core definitions database (DB 2): new terms get 2-<trm_ID> concept codes there
-- (step 5). To try it on another database, set @core_db below to that database's registered id,
-- or leave step 5 out. Run in one transaction; the defTerms triggers keep defTermsLinks in step.
--
-- Review: one line per MIME type with its extensions. Outdated types are not inserted (list at the
-- end, with the reason); move a line up to keep one. A group is a term with child terms; a file's
-- MIME type is a term with a code (its main extension) - the server refuses a term without one.
-- Existing terms keep their concept codes (legacy viewers/map/mapLayer.js reads 2-537 / 2-540).
-- Apply together with 20-file-extensions.sql (defFileExtToMimetype: allowed upload extensions).

SET @core_db = 2;
SET @vocab = (SELECT trm_ID FROM defTerms WHERE trm_OriginatingDBID=2 AND trm_IDInOriginatingDB=533);
SET @first = (SELECT MAX(trm_ID) + 1 FROM defTerms);

START TRANSACTION;

-- 1. the vocabulary
UPDATE defTerms SET trm_Label='MIME type',
    trm_Description='MIME types of files, grouped (images, audio, video, documents...). The code is the main file extension.'
    WHERE trm_ID=@vocab;

-- 2. groups (no code: not selectable as the MIME type of a file)
INSERT INTO defTerms (trm_Label, trm_Description, trm_Code, trm_Domain, trm_Status, trm_ParentTermID, trm_Depth) VALUES
    ('Images', 'Raster and vector images', '', 'enum', 'open', @vocab, 1),
    ('Audio', 'Sound files', '', 'enum', 'open', @vocab, 1),
    ('Video', 'Video files', '', 'enum', 'open', @vocab, 1),
    ('Documents', 'Text documents, presentations, spreadsheets, e-books', '', 'enum', 'open', @vocab, 1),
    ('Text and data', 'Plain text, web pages, structured data and scripts', '', 'enum', 'open', @vocab, 1),
    ('Geo', 'Spatial data and map tiles', '', 'enum', 'open', @vocab, 1),
    ('Archives', 'Compressed archives', '', 'enum', 'open', @vocab, 1),
    ('3D', '3D models and drawings', '', 'enum', 'open', @vocab, 1),
    ('Web services', 'Media served by external services (YouTube, Vimeo, SoundCloud)', '', 'enum', 'open', @vocab, 1),
    ('Other', 'Other binary formats', '', 'enum', 'open', @vocab, 1);
SET @g_images = (SELECT trm_ID FROM defTerms WHERE trm_ParentTermID=@vocab AND trm_Label='Images' AND trm_ID>=@first);
SET @g_audio = (SELECT trm_ID FROM defTerms WHERE trm_ParentTermID=@vocab AND trm_Label='Audio' AND trm_ID>=@first);
SET @g_video = (SELECT trm_ID FROM defTerms WHERE trm_ParentTermID=@vocab AND trm_Label='Video' AND trm_ID>=@first);
SET @g_documents = (SELECT trm_ID FROM defTerms WHERE trm_ParentTermID=@vocab AND trm_Label='Documents' AND trm_ID>=@first);
SET @g_textanddata = (SELECT trm_ID FROM defTerms WHERE trm_ParentTermID=@vocab AND trm_Label='Text and data' AND trm_ID>=@first);
SET @g_geo = (SELECT trm_ID FROM defTerms WHERE trm_ParentTermID=@vocab AND trm_Label='Geo' AND trm_ID>=@first);
SET @g_archives = (SELECT trm_ID FROM defTerms WHERE trm_ParentTermID=@vocab AND trm_Label='Archives' AND trm_ID>=@first);
SET @g_3d = (SELECT trm_ID FROM defTerms WHERE trm_ParentTermID=@vocab AND trm_Label='3D' AND trm_ID>=@first);
SET @g_webservices = (SELECT trm_ID FROM defTerms WHERE trm_ParentTermID=@vocab AND trm_Label='Web services' AND trm_ID>=@first);
SET @g_other = (SELECT trm_ID FROM defTerms WHERE trm_ParentTermID=@vocab AND trm_Label='Other' AND trm_ID>=@first);

-- 3. the existing terms under their group (concept codes stay)
UPDATE defTerms SET trm_ParentTermID=@g_images, trm_Depth=2, trm_Code='bmp', trm_Description='BMP image' WHERE trm_OriginatingDBID=2 AND trm_IDInOriginatingDB=534;
UPDATE defTerms SET trm_ParentTermID=@g_images, trm_Depth=2, trm_Code='ecw', trm_Description='ER Mapper image' WHERE trm_OriginatingDBID=2 AND trm_IDInOriginatingDB=535;  -- outdated? values exist; not in defFileExtToMimetype
UPDATE defTerms SET trm_ParentTermID=@g_images, trm_Depth=2, trm_Code='gif', trm_Description='GIF image' WHERE trm_OriginatingDBID=2 AND trm_IDInOriginatingDB=536;
UPDATE defTerms SET trm_ParentTermID=@g_images, trm_Depth=2, trm_Code='jpg', trm_Description='JPEG image' WHERE trm_OriginatingDBID=2 AND trm_IDInOriginatingDB=537;  -- legacy mapLayer.js: tiles .jpg
UPDATE defTerms SET trm_Label='image/jp2', trm_ParentTermID=@g_images, trm_Depth=2, trm_Code='jp2', trm_Description='JPEG 2000 image' WHERE trm_OriginatingDBID=2 AND trm_IDInOriginatingDB=538;  -- label was image/jpeg2000 (not a MIME type)
UPDATE defTerms SET trm_ParentTermID=@g_images, trm_Depth=2, trm_Code='sid', trm_Description='MrSID image' WHERE trm_OriginatingDBID=2 AND trm_IDInOriginatingDB=539;  -- outdated? values exist; not in defFileExtToMimetype
UPDATE defTerms SET trm_ParentTermID=@g_images, trm_Depth=2, trm_Code='png', trm_Description='PNG image' WHERE trm_OriginatingDBID=2 AND trm_IDInOriginatingDB=540;  -- legacy mapLayer.js: tiles .png
UPDATE defTerms SET trm_ParentTermID=@g_images, trm_Depth=2, trm_Code='tif', trm_Description='TIFF image' WHERE trm_OriginatingDBID=2 AND trm_IDInOriginatingDB=541;
UPDATE defTerms SET trm_ParentTermID=@g_images, trm_Depth=2, trm_Code='', trm_Description='Zoomify tiles' WHERE trm_OriginatingDBID=2 AND trm_IDInOriginatingDB=542;  -- outdated: a tiling scheme, not a MIME type; no code, so not a file MIME type

-- 4. MIME types (label, description, code = main extension, group); -- extensions
INSERT INTO defTerms (trm_Label, trm_Description, trm_Code, trm_Domain, trm_Status, trm_ParentTermID, trm_Depth) VALUES
    ('application/postscriptp', 'Adobe Illustrator drawing', 'ai', 'enum', 'open', @g_images, 2),  -- ai
    ('image/avif', 'AVIF image', 'avif', 'enum', 'open', @g_images, 2),  -- avif  NEW
    ('image/cgm', 'Computer Graphics Metafile', 'cgm', 'enum', 'open', @g_images, 2),  -- cgm
    ('image/heic', 'HEIC image', 'heic', 'enum', 'open', @g_images, 2),  -- heic heif  NEW
    ('image/svg+xml', 'SVG drawing', 'svg', 'enum', 'open', @g_images, 2),  -- svg
    ('image/vnd.adobe.photoshop', 'Adobe Photoshop image', 'psd', 'enum', 'open', @g_images, 2),  -- psd
    ('image/vnd.djvu', 'DjVu scanned image', 'djvu', 'enum', 'open', @g_images, 2),  -- djvu
    ('image/webp', 'WebP image', 'webp', 'enum', 'open', @g_images, 2),  -- webp  NEW
    ('image/x-eps', 'Encapsulated PostScript', 'eps', 'enum', 'open', @g_images, 2),  -- eps
    ('image/x-icon', 'Windows icon', 'ico', 'enum', 'open', @g_images, 2),  -- ico
    ('image/x-wmf', 'Windows metafile', 'wmf', 'enum', 'open', @g_images, 2),  -- wmf
    ('audio/aac', 'AAC audio', 'aac', 'enum', 'open', @g_audio, 2),  -- aac  NEW
    ('audio/basic', 'Basic audio (au, snd)', 'au', 'enum', 'open', @g_audio, 2),  -- au snd
    ('audio/flac', 'FLAC audio', 'flac', 'enum', 'open', @g_audio, 2),  -- flac  NEW
    ('audio/midi', 'MIDI', 'midi', 'enum', 'open', @g_audio, 2),  -- mid midi
    ('audio/mp3', 'MP3 audio', 'mp3', 'enum', 'open', @g_audio, 2),  -- mp3
    ('audio/mp4', 'MPEG-4 audio', 'm4a', 'enum', 'open', @g_audio, 2),  -- m4a  NEW
    ('audio/mpeg', 'MPEG audio', 'mp2', 'enum', 'open', @g_audio, 2),  -- mp2 mpga
    ('audio/ogg', 'Ogg audio', 'oga', 'enum', 'open', @g_audio, 2),  -- oga opus  NEW
    ('audio/x-aiff', 'AIFF audio', 'aif', 'enum', 'open', @g_audio, 2),  -- aif aifc aiff
    ('audio/x-ms-wma', 'Windows Media audio', 'wma', 'enum', 'open', @g_audio, 2),  -- wma
    ('audio/x-wav', 'WAV audio', 'wav', 'enum', 'open', @g_audio, 2),  -- wav
    ('video/mp4', 'MP4 video', 'mp4', 'enum', 'open', @g_video, 2),  -- mp4
    ('video/mpeg', 'MPEG video', 'mpeg', 'enum', 'open', @g_video, 2),  -- mpe mpeg mpg
    ('video/ogg', 'Ogg video', 'ogg', 'enum', 'open', @g_video, 2),  -- ogg ogv
    ('video/quicktime', 'QuickTime video', 'mov', 'enum', 'open', @g_video, 2),  -- mov qt
    ('video/webm', 'WebM video', 'webm', 'enum', 'open', @g_video, 2),  -- webm
    ('video/x-matroska', 'Matroska video', 'mkv', 'enum', 'open', @g_video, 2),  -- mkv  NEW
    ('video/x-ms-wmv', 'Windows Media video', 'wmv', 'enum', 'open', @g_video, 2),  -- wmv
    ('video/x-msvideo', 'AVI video', 'avi', 'enum', 'open', @g_video, 2),  -- avi
    ('application/epub+zip', 'EPUB e-book', 'epub', 'enum', 'open', @g_documents, 2),  -- epub  NEW
    ('application/mspowerpoint', 'Microsoft PowerPoint slide show', 'pps', 'enum', 'open', @g_documents, 2),  -- pps
    ('application/msword', 'Microsoft Word document', 'doc', 'enum', 'open', @g_documents, 2),  -- doc dot
    ('application/onenote', 'Microsoft OneNote document', 'one', 'enum', 'open', @g_documents, 2),  -- one
    ('application/pdf', 'PDF document', 'pdf', 'enum', 'open', @g_documents, 2),  -- pdf
    ('application/postscript', 'PostScript', 'ps', 'enum', 'open', @g_documents, 2),  -- ps
    ('application/vnd.mif', 'Adobe FrameMaker interchange', 'mif', 'enum', 'open', @g_documents, 2),  -- mif
    ('application/vnd.ms-excel', 'Microsoft Excel worksheet', 'xls', 'enum', 'open', @g_documents, 2),  -- xls
    ('application/vnd.ms-powerpoint', 'Microsoft PowerPoint presentation', 'ppt', 'enum', 'open', @g_documents, 2),  -- ppt
    ('application/vnd.oasis.opendocument.presentation', 'OpenDocument presentation', 'odp', 'enum', 'open', @g_documents, 2),  -- odp  NEW
    ('application/vnd.oasis.opendocument.spreadsheet', 'OpenDocument spreadsheet', 'ods', 'enum', 'open', @g_documents, 2),  -- ods  NEW
    ('application/vnd.oasis.opendocument.text', 'OpenDocument text', 'odt', 'enum', 'open', @g_documents, 2),  -- odt
    ('application/vnd.openxmlformats-officedocument.presentationml.presentation', 'Microsoft PowerPoint presentation (pptx)', 'pptx', 'enum', 'open', @g_documents, 2),  -- pptx  NEW
    ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Microsoft Excel workbook (xlsx)', 'xlsx', 'enum', 'open', @g_documents, 2),  -- xlsx  NEW
    ('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Microsoft Word document (docx)', 'docx', 'enum', 'open', @g_documents, 2),  -- docx
    ('application/vnd.visio', 'Microsoft Visio diagram', 'vsd', 'enum', 'open', @g_documents, 2),  -- vsd
    ('application/x-latex', 'LaTeX source', 'latex', 'enum', 'open', @g_documents, 2),  -- latex tex
    ('text/rtf', 'Rich Text Format', 'rtf', 'enum', 'open', @g_documents, 2),  -- rtf
    ('application/dbf', 'dBase table', 'dbf', 'enum', 'open', @g_textanddata, 2),  -- dbf
    ('application/json', 'JSON', 'json', 'enum', 'open', @g_textanddata, 2),  -- json
    ('application/ld+json', 'JSON-LD', 'jsonld', 'enum', 'open', @g_textanddata, 2),  -- jsonld  NEW
    ('application/mathml+xml', 'MathML', 'mathml', 'enum', 'open', @g_textanddata, 2),  -- mathml
    ('application/rdf+xml', 'RDF/XML', 'rdf', 'enum', 'open', @g_textanddata, 2),  -- rdf
    ('application/x-hdf', 'Hierarchical Data Format', 'hdf', 'enum', 'open', @g_textanddata, 2),  -- hdf
    ('application/x-netcdf', 'NetCDF data', 'nc', 'enum', 'open', @g_textanddata, 2),  -- nc
    ('application/xhtml+xml', 'XHTML document', 'xht', 'enum', 'open', @g_textanddata, 2),  -- xht xhtml
    ('application/xml', 'XML', 'xml', 'enum', 'open', @g_textanddata, 2),  -- xml
    ('application/xml-dtd', 'XML document type definition', 'dtd', 'enum', 'open', @g_textanddata, 2),  -- dtd
    ('chemical/x-pdb', 'Protein Data Bank', 'pdb', 'enum', 'open', @g_textanddata, 2),  -- pdb
    ('text/calendar', 'iCalendar', 'ics', 'enum', 'open', @g_textanddata, 2),  -- ics ifb
    ('text/css', 'CSS style sheet', 'css', 'enum', 'open', @g_textanddata, 2),  -- css
    ('text/csv', 'CSV (comma separated values)', 'csv', 'enum', 'open', @g_textanddata, 2),  -- csv
    ('text/html', 'HTML page', 'html', 'enum', 'open', @g_textanddata, 2),  -- htm html
    ('text/javascript', 'JavaScript', 'js', 'enum', 'open', @g_textanddata, 2),  -- js  NEW
    ('text/markdown', 'Markdown', 'md', 'enum', 'open', @g_textanddata, 2),  -- md  NEW
    ('text/plain', 'Plain text', 'asc', 'enum', 'open', @g_textanddata, 2),  -- asc c ini sql txt
    ('text/sgml', 'SGML', 'sgml', 'enum', 'open', @g_textanddata, 2),  -- sgm sgml
    ('text/tab-separated-values', 'TSV (tab separated values)', 'tsv', 'enum', 'open', @g_textanddata, 2),  -- tsv
    ('text/turtle', 'RDF Turtle', 'ttl', 'enum', 'open', @g_textanddata, 2),  -- ttl  NEW
    ('text/xml', 'XSL style sheet', 'xsl', 'enum', 'open', @g_textanddata, 2),  -- xsl
    ('text/xslt', 'XSLT transformation', 'xslt', 'enum', 'open', @g_textanddata, 2),  -- xslt
    ('application/geo+json', 'GeoJSON', 'geojson', 'enum', 'open', @g_geo, 2),  -- geojson
    ('application/geopackage+sqlite3', 'GeoPackage', 'gpkg', 'enum', 'open', @g_geo, 2),  -- gpkg  NEW
    ('application/gpx+xml', 'GPS exchange format', 'gpx', 'enum', 'open', @g_geo, 2),  -- gpx  NEW
    ('application/vnd.google-earth.kml+xml', 'KML', 'kml', 'enum', 'open', @g_geo, 2),  -- kml
    ('application/vnd.google-earth.kmz', 'KMZ (compressed KML)', 'kmz', 'enum', 'open', @g_geo, 2),  -- kmz
    ('application/x-sqlite3', 'MBTiles map tiles (SQLite)', 'mbtiles', 'enum', 'open', @g_geo, 2),  -- mbtiles
    ('application/gzip', 'gzip archive', 'gz', 'enum', 'open', @g_archives, 2),  -- gz  NEW
    ('application/x-7z-compressed', '7-Zip archive', '7z', 'enum', 'open', @g_archives, 2),  -- 7z  NEW
    ('application/x-gtar', 'GNU tar archive', 'gtar', 'enum', 'open', @g_archives, 2),  -- gtar
    ('application/x-tar', 'tar archive', 'tar', 'enum', 'open', @g_archives, 2),  -- tar
    ('application/x-zip-compressed', 'ZIP archive', 'zip', 'enum', 'open', @g_archives, 2),  -- zip
    ('application/iges', 'IGES drawing', 'iges', 'enum', 'open', @g_3d, 2),  -- iges igs
    ('application/vnd.sketchup.skp', 'SketchUp model', 'skp', 'enum', 'open', @g_3d, 2),  -- skp
    ('model/gltf+json', 'glTF model', 'gltf', 'enum', 'open', @g_3d, 2),  -- gltf  NEW
    ('model/gltf-binary', 'glTF binary model', 'glb', 'enum', 'open', @g_3d, 2),  -- glb  NEW
    ('model/obj', 'Wavefront OBJ model', 'obj', 'enum', 'open', @g_3d, 2),  -- obj  NEW
    ('model/stl', 'STL model', 'stl', 'enum', 'open', @g_3d, 2),  -- stl  NEW
    ('model/vrml', 'VRML model', 'vrml', 'enum', 'open', @g_3d, 2),  -- vrml wrl
    ('audio/soundcloud', 'SoundCloud', 'soundcloud', 'enum', 'open', @g_webservices, 2),  -- soundcloud
    ('video/vimeo', 'Vimeo video', 'vimeo', 'enum', 'open', @g_webservices, 2),  -- vimeo
    ('video/youtube', 'YouTube video', 'youtube', 'enum', 'open', @g_webservices, 2),  -- youtube
    ('application/octet-stream', 'Binary data', 'bin', 'enum', 'open', @g_other, 2),  -- bin cdf dat db mxd shp shx xyz
    ('application/x-endnote-connect', 'EndNote connection', 'enz', 'enum', 'open', @g_other, 2),  -- enz
    ('application/x-font-ttf', 'TrueType font', 'ttf', 'enum', 'open', @g_other, 2),  -- ttf
    ('message/rfc822', 'E-mail message', 'eml', 'enum', 'open', @g_other, 2);  -- eml

-- 5. concept codes of the new terms (core definitions database only)
UPDATE defTerms SET trm_OriginatingDBID=@core_db, trm_NameInOriginatingDB=LEFT(trm_Label, 63), trm_IDInOriginatingDB=trm_ID
    WHERE trm_ID>=@first AND (trm_OriginatingDBID IS NULL OR trm_OriginatingDBID=0);

-- check before COMMIT: the tree under the vocabulary
SELECT g.trm_Label AS grp, t.trm_ID, t.trm_Label, t.trm_Code, CONCAT(t.trm_OriginatingDBID, '-', t.trm_IDInOriginatingDB) AS concept
    FROM defTerms g JOIN defTerms t ON t.trm_ParentTermID=g.trm_ID WHERE g.trm_ParentTermID=@vocab ORDER BY g.trm_ID, t.trm_Label;

COMMIT;  -- or ROLLBACK

-- Outdated MIME types, not inserted (move a line into step 4 to keep one):
--   application/java-archive                      jar                    executable code
--   application/mac-binhex40                      hqx                    old Mac encoding
--   application/oda                               oda                    obsolete
--   application/srgs                              gram                   speech grammar, not used
--   application/srgs+xml                          grxml                  speech grammar, not used
--   application/vnd.dxr                           dxr                    Macromedia Director, obsolete
--   application/vnd.mozilla.xul+xml               xul                    obsolete
--   application/vnd.openxmlformats                pptx xlsx              not a MIME type: pptx and xlsx get their own types
--   application/vnd.rn-realmedia                  rm                     RealMedia, obsolete
--   application/vnd.wap.wbxml                     wbxml                  WAP, obsolete
--   application/vnd.wap.wmlc                      wmlc                   WAP, obsolete
--   application/vnd.wap.wmlscriptc                wmlsc                  WAP, obsolete
--   application/voicexml+xml                      vxml                   not used
--   application/x-bcpio                           bcpio                  obsolete archive
--   application/x-cdf                             cda                    CD audio track reference, not a file
--   application/x-chess-pgn                       pgn                    wrong description, not used
--   application/x-cpio                            cpio                   obsolete archive
--   application/x-director                        dcr dir                Macromedia Director, obsolete
--   application/x-dvi                             dvi                    obsolete
--   application/x-futuresplash                    spl                    Flash, obsolete
--   application/x-javascript                      js                     replaced by text/javascript
--   application/x-koan                            skd skt                obsolete
--   application/x-ms-shortcut                     lnk                    Windows shortcut, not content
--   application/x-msgraph                         gra                    obsolete
--   application/x-perl                            pl                     script
--   application/x-photoshop                       csh                    wrong (.csh is a shell script)
--   application/x-sh                              sh                     script
--   application/x-shar                            shar                   shell archive (script)
--   application/x-shockwave-flash                 swf                    Flash, obsolete
--   application/x-smil                            smi smil               obsolete
--   application/x-stuffit                         sit                    obsolete archive
--   application/x-sv4cpio                         sv4cpio                obsolete archive
--   application/x-sv4crc                          sv4crc                 obsolete archive
--   application/x-texinfo                         texi texinfo           not used
--   application/x-troff                           t                      obsolete
--   application/x-troff-man                       man                    obsolete
--   application/x-troff-me                        me                     obsolete
--   application/x-troff-ms                        ms                     obsolete
--   application/x-ustar                           ustar                  obsolete archive
--   audio/x-midi                                  kar                    karaoke variant of audio/midi
--   audio/x-mpegurl                               m3u                    playlist, not content
--   audio/x-pn-realaudio                          ra ram                 RealAudio, obsolete
--   image/ief                                     ief                    obsolete
--   image/vnd.wap.wbmp                            wbmp                   WAP, obsolete
--   image/x-cpt                                   cpt                    obsolete
--   image/x-portable-anymap                       pnm                    rare
--   image/x-portable-bitmap                       pbm                    rare
--   image/x-portable-graymap                      pgm                    rare
--   image/x-portable-pixmap                       ppm                    rare
--   image/x-ras                                   ras                    obsolete
--   image/x-rgb                                   rgb                    obsolete
--   image/x-xbitmap                               xbm                    obsolete
--   image/x-xpixmap                               xpm                    obsolete
--   image/x-xwindowdump                           xwd                    obsolete
--   model/mesh                                    mesh msh silo          obsolete
--   text/richtext                                 rtx                    obsolete (not RTF)
--   text/vnd.wap.wml                              wml                    WAP, obsolete
--   text/vnd.wap.wmlscript                        wmls                   WAP, obsolete
--   text/x-setext                                 etx                    obsolete
--   text/x-tcl                                    tcl                    script
--   video/vnd.mpegurl                             m4u mxu                playlist, not content
--   video/x-flv                                   flv                    Flash video, obsolete
--   video/x-sgi-movie                             movie                  obsolete
--   video/x-skm                                   skm                    obsolete
--   x-conference/x-cooltalk                       ice                    obsolete
-- Extensions of application/octet-stream left out: class dll dmg dms exe lha lzh shs so vcd vob
