CREATE TYPE "public"."mode_repartition" AS ENUM('prorata', 'moitie', 'personnalise', 'transfert');--> statement-breakpoint
CREATE TYPE "public"."personne" AS ENUM('thomas', 'liz');--> statement-breakpoint
CREATE TYPE "public"."type_depense" AS ENUM('charge_fixe', 'courante', 'transfert');--> statement-breakpoint
CREATE TABLE "depense" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"montant_cents" integer NOT NULL,
	"paye_par" "personne" NOT NULL,
	"type" "type_depense" NOT NULL,
	"mode_repartition" "mode_repartition" NOT NULL,
	"part_thomas_cents" integer NOT NULL,
	"part_liz_cents" integer NOT NULL,
	"version_config_id" uuid NOT NULL,
	"genere_auto" boolean DEFAULT false NOT NULL,
	"commentaire" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "description_non_vide" CHECK (length(trim("depense"."description")) > 0),
	CONSTRAINT "montant_positif" CHECK ("depense"."montant_cents" > 0),
	CONSTRAINT "parts_somment_au_montant" CHECK ("depense"."part_thomas_cents" + "depense"."part_liz_cents" = "depense"."montant_cents")
);
--> statement-breakpoint
CREATE TABLE "version_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"libelle" text NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date,
	"salaire_net_thomas_cents" integer NOT NULL,
	"salaire_net_liz_cents" integer NOT NULL,
	"charges_communes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"charges_perso_thomas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"charges_perso_liz" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "libelle_non_vide" CHECK (length(trim("version_config"."libelle")) > 0),
	CONSTRAINT "salaires_cumules_non_nuls" CHECK ("version_config"."salaire_net_thomas_cents" + "version_config"."salaire_net_liz_cents" > 0),
	CONSTRAINT "periode_coherente" CHECK ("version_config"."date_fin" is null or "version_config"."date_fin" >= "version_config"."date_debut")
);
--> statement-breakpoint
ALTER TABLE "depense" ADD CONSTRAINT "depense_version_config_id_version_config_id_fk" FOREIGN KEY ("version_config_id") REFERENCES "public"."version_config"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "depense_date_idx" ON "depense" USING btree ("date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "depense_version_idx" ON "depense" USING btree ("version_config_id");