-- Les regles du PRD, portees par la base plutot que par le code applicatif.

create extension if not exists btree_gist;

-- I1a — Deux versions ne peuvent pas se chevaucher. Physiquement impossible a ecrire.
alter table version_config
  add constraint versions_sans_chevauchement
  exclude using gist (
    daterange(date_debut, coalesce(date_fin, 'infinity'::date), '[]') with &&
  );

-- I1b — Une version close ne se modifie plus. Append-only.
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
  return new;
end;
$$;

create trigger version_config_append_only
  before update on version_config
  for each row
  execute function bloquer_modification_version_close();

-- I2 — Une depense figee ne voit jamais ses parts recalculees par la base.
-- Aucune vue, aucun trigger ne recalcule part_thomas_cents / part_liz_cents.
-- Le calcul vit dans packages/domain, une seule fois, a l'ecriture.

-- Creation d'une version : cloture la precedente la VEILLE, en une transaction.
create or replace function creer_version_config(
  p_libelle                  text,
  p_date_debut               date,
  p_salaire_net_thomas_cents integer,
  p_salaire_net_liz_cents    integer,
  p_charges_communes         jsonb,
  p_charges_perso_thomas     jsonb,
  p_charges_perso_liz        jsonb
)
returns version_config
language plpgsql
as $$
declare
  v_courante version_config;
  v_nouvelle version_config;
begin
  select * into v_courante from version_config where date_fin is null;

  if found then
    if p_date_debut <= v_courante.date_debut then
      raise exception
        'Date de prise d''effet (%) anterieure ou egale a la version courante (%).',
        p_date_debut, v_courante.date_debut;
    end if;

    update version_config
       set date_fin = p_date_debut - interval '1 day'
     where id = v_courante.id;
  end if;

  insert into version_config (
    libelle, date_debut, date_fin,
    salaire_net_thomas_cents, salaire_net_liz_cents,
    charges_communes, charges_perso_thomas, charges_perso_liz
  ) values (
    p_libelle, p_date_debut, null,
    p_salaire_net_thomas_cents, p_salaire_net_liz_cents,
    p_charges_communes, p_charges_perso_thomas, p_charges_perso_liz
  )
  returning * into v_nouvelle;

  return v_nouvelle;
end;
$$;
