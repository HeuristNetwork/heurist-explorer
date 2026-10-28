-- File type vocabulary 2-533 (plan 20 §10.11, Artem 2026-10-27): extensions in groups, not MIME types.
--
-- Run after 20-mime-vocabulary.sql (groups, one term per MIME type with code = main extension) and
-- 20-file-extensions.sql (defFileExtToMimetype), in the Heurist core definitions database (DB 2): new terms
-- get 2-<trm_ID> concept codes there (step 4). To try it on another database, set @core_db to that
-- database's registered id, or leave step 4 out. Run in one transaction.
--
-- Result: groups (no code, not a value) > extension terms (label = code = extension, description = the
-- file type name). The MIME type of an extension stays in defFileExtToMimetype (the server derives it).
-- The terms that exist keep their ids and concept codes, so stored values stay valid and legacy
-- viewers/map/mapLayer.js keeps reading 2-540 (png) / 2-537 (jpg).

SET @core_db = 2;
SET @vocab = (SELECT trm_ID FROM defTerms WHERE trm_OriginatingDBID=2 AND trm_IDInOriginatingDB=533);
SET @first = (SELECT MAX(trm_ID) + 1 FROM defTerms);

START TRANSACTION;

-- 0. the terms of the vocabulary: groups (children of the vocabulary) and their children
DROP TEMPORARY TABLE IF EXISTS tmp_file_types;
CREATE TEMPORARY TABLE tmp_file_types AS
    SELECT t.trm_ID, t.trm_Label, t.trm_Code, t.trm_Description, t.trm_ParentTermID, t.trm_Depth
    FROM defTerms t LEFT JOIN defTerms g ON g.trm_ID=t.trm_ParentTermID
    WHERE t.trm_ParentTermID=@vocab OR g.trm_ParentTermID=@vocab;
-- the extensions that have a term (MySQL does not read a temporary table twice in one query)
DROP TEMPORARY TABLE IF EXISTS tmp_file_type_codes;
CREATE TEMPORARY TABLE tmp_file_type_codes AS
    SELECT DISTINCT LOWER(trm_Code) AS code FROM tmp_file_types WHERE trm_Code<>'';

UPDATE defTerms SET trm_Label='File type',
    trm_Description='File types by extension, grouped (images, audio, video, documents...). The code is the extension.'
    WHERE trm_ID=@vocab;

-- 1. a term for every further extension of a MIME type (jpeg beside jpg, htm beside html...), in the group
--    of its MIME type term; an extension that has a term already is left out, and so are the extensions of
--    the upload stop list (srv/Files/Upload/ChunkedUpload::DENIED) in case 20-file-extensions.sql was not run
INSERT INTO defTerms (trm_Label, trm_Description, trm_Code, trm_Domain, trm_Status, trm_ParentTermID, trm_Depth)
    SELECT LOWER(f.fxm_Extension), COALESCE(NULLIF(TRIM(f.fxm_FiletypeName), ''), m.trm_Description), LOWER(f.fxm_Extension),
           'enum', 'open', m.trm_ParentTermID, m.trm_Depth
    FROM defFileExtToMimetype f
    JOIN tmp_file_types m ON LOWER(m.trm_Label)=LOWER(f.fxm_MimeType) AND m.trm_Code<>''
    WHERE LOWER(f.fxm_Extension)<>LOWER(m.trm_Code)
      AND LOWER(f.fxm_Extension) NOT IN (SELECT code FROM tmp_file_type_codes)
      AND LOWER(f.fxm_Extension) NOT REGEXP '^(bat|exe|cmd|sh|php[0-9]?|pl|cgi|386|dll|com|torrent|js|app|jar|pif|vb|vbscript|asp|cer|csr|jsp|drv|sys|ade|adp|bas|chm|cpl|crt|csh|fxp|hlp|hta|inf|ins|isp|jse|htaccess|htpasswd|ksh|lnk|mdb|mde|mdt|mdw|msc|msi|msp|mst|ops|pcd|prg|reg|scr|sct|shb|shs|url|vbe|vbs|wsc|wsf|wsh)$'
    GROUP BY LOWER(f.fxm_Extension);

-- 2. MIME type terms become extension terms: label = code (their main extension)
UPDATE defTerms t JOIN tmp_file_types m ON m.trm_ID=t.trm_ID
    SET t.trm_Label=LOWER(m.trm_Code), t.trm_Code=LOWER(m.trm_Code)
    WHERE m.trm_Code<>'' AND m.trm_Label LIKE '%/%';

-- 3. terms without an extension that are not groups (e.g. 2-542 Zoomify tiles): listed, not changed
SELECT m.trm_ID, m.trm_Label, m.trm_Description
    FROM tmp_file_types m
    WHERE m.trm_Code='' AND m.trm_ParentTermID<>@vocab;

-- 4. concept codes of the new terms (core definitions database only)
UPDATE defTerms SET trm_OriginatingDBID=@core_db, trm_NameInOriginatingDB=LEFT(trm_Label, 63), trm_IDInOriginatingDB=trm_ID
    WHERE trm_ID>=@first AND (trm_OriginatingDBID IS NULL OR trm_OriginatingDBID=0);

-- check before COMMIT: groups and their extensions; no label with "/" may be left
SELECT g.trm_Label AS grp, t.trm_ID, t.trm_Label, t.trm_Code, t.trm_Description,
       CONCAT(t.trm_OriginatingDBID, '-', t.trm_IDInOriginatingDB) AS concept
    FROM defTerms g JOIN defTerms t ON t.trm_ParentTermID=g.trm_ID WHERE g.trm_ParentTermID=@vocab
    ORDER BY g.trm_ID, t.trm_Label;
SELECT COUNT(*) AS mime_labels_left FROM defTerms t JOIN defTerms g ON g.trm_ID=t.trm_ParentTermID
    WHERE g.trm_ParentTermID=@vocab AND t.trm_Label LIKE '%/%';

DROP TEMPORARY TABLE IF EXISTS tmp_file_types;
DROP TEMPORARY TABLE IF EXISTS tmp_file_type_codes;

COMMIT;  -- or ROLLBACK

-- After this, in DB 2 (Artem):
-- * field 2-29: name "File type", vocabulary 2-533; merge 2-41 and 2-64 into it (20-file-type-migration.sql
--   moves the values of 2-64 in each database);
-- * two vocabularies by reference (defTermsLinks) to these terms, their concept codes go into
--   srv/Definitions/SystemConstants.php (TRM_TILE_FORMATS, TRM_REPORT_FORMATS):
--     tiled image formats: png jpg jpeg gif webp   (ZIP stacks extract only these: FileStorage::TILE_IMAGE_EXTENSIONS;
--                                                   MBTiles may also hold pbf vector tiles - not shown by the map)
--     report formats:      html csv txt xml json js css   (apps/reports REPORT_FORMATS)
