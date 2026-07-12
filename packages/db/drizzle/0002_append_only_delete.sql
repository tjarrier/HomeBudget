-- Custom SQL migration file, put your code below! --
-- I1 (suite) — L'append-only doit aussi resister a DELETE, pas seulement UPDATE.
-- Une version close qui n'a aucune depense pouvait etre supprimee sans la
-- moindre resistance : la FK ON DELETE restrict depuis depense ne protege
-- que les versions qui portent au moins une ligne. On etend donc le meme
-- trigger a DELETE, avec la meme regle : old.date_fin is not null => refus.
--
-- Piege : dans un trigger BEFORE DELETE, NEW vaut NULL. Renvoyer NEW (comme
-- le fait la branche UPDATE) annulerait silencieusement TOUTES les
-- suppressions, y compris celles d'une version encore ouverte. Le corps doit
-- donc renvoyer OLD pour un DELETE et NEW pour un UPDATE, selon TG_OP.
--
-- TRUNCATE reste inaffecte : ce trigger est "for each row", et TRUNCATE ne
-- declenche pas les triggers de ligne (seuls les triggers "for each
-- statement" de type TRUNCATE le seraient, et on n'en cree pas ici).
create or replace function bloquer_modification_version_close()
returns trigger
language plpgsql
as $$
begin
  -- Cloturer une version ouverte (poser date_fin) reste autorise : c'est le
  -- mecanisme normal de creation d'une nouvelle version.
  if old.date_fin is not null then
    raise exception
      'Version « % » close le % : la configuration est append-only. Creez une nouvelle version a partir d''une date.',
      old.libelle, old.date_fin
      using errcode = 'restrict_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists version_config_append_only on version_config;

create trigger version_config_append_only
  before update or delete on version_config
  for each row
  execute function bloquer_modification_version_close();
