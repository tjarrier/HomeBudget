-- Ce qu'on compare entre la production et la copie restauree. A quoi ca sert :
-- CLAUDE.md, section « Sauvegarde ».
--
-- Les tables sont ENUMEREES et non listees a la main : une table ajoutee apres
-- coup, que la liste de `--schema` du dump ne couvre pas, manquerait dans la
-- copie et cette requete le dirait. Une liste ecrite a la main vieillirait en
-- silence.
--
-- `query_to_xml` est le seul moyen de compter des tables inconnues a l'ecriture
-- de la requete : `count(*)` exige un nom de table litteral. Le troisieme
-- argument (`tableforest`) vaut true, donc chaque ligne sort en `<row>`.
select
  table_schema,
  table_name,
  (xpath(
    '/row/c/text()',
    query_to_xml(
      format('select count(*) as c from %I.%I', table_schema, table_name),
      false,
      true,
      ''
    )
  ))[1]::text::bigint as lignes
from information_schema.tables
where table_schema in ('public', 'drizzle')
  and table_type = 'BASE TABLE'
-- Postgres ne promet aucun ordre sans `order by`, et un `diff` sur deux ordres
-- differents ne voudrait rien dire.
order by table_schema, table_name;

-- Le compte de lignes seul ne verrait pas une colonne de montants perdue en
-- route. Les parts sont sommees telles qu'elles sont STOCKEES : cette empreinte
-- ne recalcule aucune part (regle 4).
select
  count(*) as depenses,
  coalesce(sum(montant_cents), 0) as somme_montants,
  coalesce(sum(part_thomas_cents), 0) as somme_part_thomas,
  coalesce(sum(part_liz_cents), 0) as somme_part_liz
from depense;
