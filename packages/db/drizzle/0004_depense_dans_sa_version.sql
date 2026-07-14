-- Custom SQL migration file, put your code below! --

-- =============================================================================
-- I2 — Une depense appartient a la version qui couvre SA date.
-- =============================================================================
-- `depense.version_config_id` n'etait qu'une cle etrangere : elle garantissait que la
-- version EXISTE, jamais qu'elle COUVRE la date de la depense. La base acceptait donc
-- sans broncher une depense du 2026-08-01 rattachee a une version close le 2026-06-30.
--
-- Ce n'est pas theorique. C'est l'erreur naturelle d'une Server Action « ajouter une
-- depense » : attraper la config *courante* (`where date_fin is null`) au lieu de celle
-- *en vigueur a la date de la depense*. Sur une depense antidatee, les parts sont alors
-- calculees au mauvais ratio — et le CHECK `parts_somment_au_montant` est satisfait :
-- elles somment bel et bien au montant, elles sont juste FAUSSES.
--
-- Autrement dit : le bug du Sheet, rentre par la porte que ce projet devait condamner.
-- L'asymetrie etait frappante — les versions avaient un point de passage obligatoire
-- (`creer_version_config`), les depenses n'en avaient aucun.
--
-- Le trigger porte sur INSERT *et* UPDATE : sans l'UPDATE, il suffirait d'inserer une
-- ligne valide puis d'en deplacer la date pour se retrouver hors plage.
create or replace function verifier_depense_dans_sa_version()
returns trigger
language plpgsql
as $$
declare
  v record;
begin
  select date_debut, date_fin, libelle
    into v
    from version_config
   where id = new.version_config_id;

  -- Pas de version : c'est a la cle etrangere de parler, pas a nous.
  if not found then
    return new;
  end if;

  -- `date_fin is null` = version en cours : elle couvre tout ce qui suit date_debut.
  -- Les deux bornes sont INCLUSES, exactement comme `versionEnVigueurLe` du domaine.
  if new.date < v.date_debut
     or (v.date_fin is not null and new.date > v.date_fin) then
    raise exception
      'La version « % » (% .. %) ne couvre pas la depense du %. Une depense doit etre figee d''apres la config en vigueur A SA DATE, pas la config courante.',
      v.libelle, v.date_debut, coalesce(v.date_fin::text, 'en cours'), new.date
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists depense_dans_sa_version on depense;

create trigger depense_dans_sa_version
  before insert or update on depense
  for each row
  execute function verifier_depense_dans_sa_version();

-- =============================================================================
-- I1 (suite) — Une version qui porte des depenses est verrouillee.
-- =============================================================================
-- Le trigger append-only ne testait que `old.date_fin is not null` : une version encore
-- OUVERTE restait librement mutable, meme lorsque des depenses etaient deja figees
-- dessus.
--
--   update version_config set salaire_net_thomas_cents = 999999 where date_fin is null;
--
-- I2 tenait (les parts figees ne bougent pas), mais la tracabilite qui JUSTIFIE I1 etait
-- perdue : deux depenses pointant la meme version pouvaient avoir ete figees avec deux
-- ratios differents, et l'audit « part = f(version, montant) » n'etait plus reproductible.
-- Deplacer `date_debut` creait en prime un TROU de calendrier que la base acceptait —
-- l'`EXCLUDE USING gist` ne voit que les chevauchements, jamais les trous.
--
-- Regle : des qu'une version porte au moins une depense, la SEULE mutation encore
-- autorisee est la pose de `date_fin` (la cloture). Cette exception est indispensable :
-- une revision de loyer cloture forcement une version qui porte deja des depenses.
--
-- On compare les deux lignes en jsonb, privees de `date_fin`. Enumerer les colonnes une
-- a une laisserait passer en silence toute colonne ajoutee plus tard.
create or replace function bloquer_modification_version_close()
returns trigger
language plpgsql
as $$
begin
  if old.date_fin is not null then
    raise exception
      'Version « % » close le % : la configuration est append-only. Creez une nouvelle version a partir d''une date.',
      old.libelle, old.date_fin
      using errcode = 'restrict_violation';
  end if;

  -- La version est ouverte. Tant qu'aucune depense n'est figee dessus, la corriger reste
  -- legitime (coquille de saisie). Des qu'une depense la reference, elle devient une
  -- piece d'archive.
  if tg_op = 'UPDATE'
     and exists (select 1 from depense where version_config_id = old.id)
     and to_jsonb(new) - 'date_fin' is distinct from to_jsonb(old) - 'date_fin' then
    raise exception
      'Version « % » : des depenses sont deja figees d''apres cette config. Seule sa cloture (date_fin) reste possible — creez une nouvelle version pour changer les regles.',
      old.libelle
      using errcode = 'restrict_violation';
  end if;

  -- Dans un trigger BEFORE DELETE, NEW vaut NULL : renvoyer NEW annulerait
  -- silencieusement TOUTES les suppressions.
  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;
