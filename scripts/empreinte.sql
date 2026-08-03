-- L'empreinte d'une base : ce qu'on compare entre la production et la copie
-- restauree pour distinguer « la commande est sortie en 0 » de « les donnees
-- sont passees ». Un dump vide se restaure parfaitement.
--
-- Les tables sont ENUMEREES, et non listees a la main. Le mode de defaillance
-- qui n'apparaitrait que des mois plus tard est une table ou un schema ajoute
-- apres coup, que la liste de `--schema` du dump ne couvre pas : il manquerait
-- dans la copie, et cette requete le dirait. Une liste ecrite a la main, elle,
-- se contenterait de vieillir en silence.
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
-- Un `diff` sur deux ordres de lignes ne voudrait rien dire : Postgres ne
-- promet aucun ordre sans `order by`.
order by table_schema, table_name;

-- Le compte de lignes ne verrait pas une colonne de montants perdue en route.
-- Les parts sont lues telles qu'elles sont STOCKEES et sommees : comparer une
-- somme des deux cotes ne suppose rien sur la facon dont elle a ete obtenue,
-- donc cette empreinte ne recalcule aucune part (regle 4).
select
  count(*) as depenses,
  coalesce(sum(montant_cents), 0) as somme_montants,
  coalesce(sum(part_thomas_cents), 0) as somme_part_thomas,
  coalesce(sum(part_liz_cents), 0) as somme_part_liz
from depense;
