-- File type field (plan 20 §10.11, Artem 2026-10-27): values of 2-64 (old DT_FILE_EXT, free text) move to
-- 2-29 (DT_FILE_EXT, "File type", a term of vocabulary 2-533). Run in each database, after its definitions
-- have the extension terms of 2-533 (20-file-type-vocabulary.sql in DB 2, then imported).
--
-- A value becomes the term whose code is the extension ("JPG", ".jpg" -> jpg). A record that has a 2-29
-- value already keeps it (its 2-64 value is removed). Values without a term are listed and stay in 2-64.
-- 2-41 (DT_FILE_TYPE) is only counted: Artem merges it in the definitions. The structures of the record
-- types (2-64 / 2-41 in defRecStructure, title masks) are definition work too and not changed here.

SET @ext_field = (SELECT dty_ID FROM defDetailTypes WHERE dty_OriginatingDBID=2 AND dty_IDInOriginatingDB=64);
SET @type_field = (SELECT dty_ID FROM defDetailTypes WHERE dty_OriginatingDBID=2 AND dty_IDInOriginatingDB=29);
SET @old_type_field = (SELECT dty_ID FROM defDetailTypes WHERE dty_OriginatingDBID=2 AND dty_IDInOriginatingDB=41);
SET @vocab = (SELECT trm_ID FROM defTerms WHERE trm_OriginatingDBID=2 AND trm_IDInOriginatingDB=533);

START TRANSACTION;

-- 0. counts before
SELECT (SELECT COUNT(*) FROM recDetails WHERE dtl_DetailTypeID=@ext_field) AS values_2_64,
       (SELECT COUNT(*) FROM recDetails WHERE dtl_DetailTypeID=@type_field) AS values_2_29,
       (SELECT COUNT(*) FROM recDetails WHERE dtl_DetailTypeID=@old_type_field) AS values_2_41;

-- 1. the term of each extension (groups have no code)
DROP TEMPORARY TABLE IF EXISTS tmp_ext_terms;
CREATE TEMPORARY TABLE tmp_ext_terms AS
    SELECT LOWER(t.trm_Code) AS code, MIN(t.trm_ID) AS trm_ID
    FROM defTerms t LEFT JOIN defTerms g ON g.trm_ID=t.trm_ParentTermID
    WHERE (t.trm_ParentTermID=@vocab OR g.trm_ParentTermID=@vocab) AND t.trm_Code<>''
    GROUP BY LOWER(t.trm_Code);

-- 2. values without a term: listed, they stay in 2-64
SELECT d.dtl_Value AS extension_without_term, COUNT(*) AS records
    FROM recDetails d LEFT JOIN tmp_ext_terms e ON e.code=LOWER(TRIM(LEADING '.' FROM TRIM(d.dtl_Value)))
    WHERE d.dtl_DetailTypeID=@ext_field AND e.trm_ID IS NULL
    GROUP BY d.dtl_Value;

-- 3. records with a file type already: the 2-64 value goes
DELETE d FROM recDetails d
    JOIN tmp_ext_terms e ON e.code=LOWER(TRIM(LEADING '.' FROM TRIM(d.dtl_Value)))
    JOIN recDetails x ON x.dtl_RecID=d.dtl_RecID AND x.dtl_DetailTypeID=@type_field
    WHERE d.dtl_DetailTypeID=@ext_field;

-- 4. the others: the value becomes the term of 2-29
UPDATE recDetails d JOIN tmp_ext_terms e ON e.code=LOWER(TRIM(LEADING '.' FROM TRIM(d.dtl_Value)))
    SET d.dtl_DetailTypeID=@type_field, d.dtl_Value=e.trm_ID
    WHERE d.dtl_DetailTypeID=@ext_field;

-- check before COMMIT: counts after (values_2_64 = the values listed in step 2)
SELECT (SELECT COUNT(*) FROM recDetails WHERE dtl_DetailTypeID=@ext_field) AS values_2_64,
       (SELECT COUNT(*) FROM recDetails WHERE dtl_DetailTypeID=@type_field) AS values_2_29;

DROP TEMPORARY TABLE IF EXISTS tmp_ext_terms;

COMMIT;  -- or ROLLBACK
