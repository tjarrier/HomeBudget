-- Custom SQL migration file, put your code below! --

-- =============================================================================
-- Une seule charge fixe GENEREE par mois.
-- =============================================================================
-- La generation mensuelle est declenchee a la main, depuis un bouton. Deux clics,
-- un rechargement de page, un onglet reste ouvert : rien n'empeche de la lancer
-- deux fois sur le meme mois — et deux lignes de loyer doublent la dette de Liz
-- en silence. Ni le CHECK des parts ni le trigger `depense_dans_sa_version` ne
-- le verraient : la seconde ligne est parfaitement valide, elle est juste en trop.
--
-- L'idempotence est donc portee par la BASE, pas par un `select` prealable dans
-- la facade. Un `select` puis un `insert` laisse une fenetre entre les deux ;
-- l'index, lui, tient meme si deux requetes arrivent en meme temps.
--
-- Partiel (`where genere_auto`) : la contrainte ne pese que sur les lignes que
-- l'application ecrit toute seule. Saisir a la main deux charges fixes le meme
-- mois — une regularisation d'eau, un rappel de charges — reste evidemment permis.
--
-- Le cast `::timestamp` n'est pas decoratif : sans lui, Postgres resout
-- `date_trunc` sur la surcharge `timestamptz`, qui depend du fuseau de la session
-- et n'est donc pas IMMUTABLE. La creation de l'index echoue net.
--
-- La cle est le MOIS, pas la date : la charge d'un mois de bascule est datee du
-- jour de prise d'effet de la nouvelle version (le 15, par exemple) et non du 1er.
-- Les deux retombent sur le meme mois, donc regenerer un mois deja genere ne
-- creera jamais de doublon, meme apres une revision de config.
--
-- Consequence assumee : un mois genere AVANT qu'une revision de mi-mois ne soit
-- saisie garde son ancien montant, et la regeneration ne le corrige pas — elle
-- ne fait rien. Corriger une depense deja figee est le sujet de #40, et ce n'est
-- pas a la generation de le trancher : ecrire une seconde ligne serait pire.
create unique index depense_une_charge_generee_par_mois
  on depense (date_trunc('month', date::timestamp))
  where genere_auto;
