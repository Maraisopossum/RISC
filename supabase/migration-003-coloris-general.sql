-- Généralise la couleur : jusqu'ici réservée aux cordes (rope_color), elle
-- devient un champ générique utilisable par tout type de matériel (sangles,
-- harnais...). Aucune donnée n'existe encore dans cette colonne (vérifié
-- avant migration), donc un simple renommage suffit sans perte.
alter table items rename column rope_color to color;

-- PostgreSQL ne propage pas le renommage à travers une vue "select *" (et
-- refuse même un simple "create or replace view" qui changerait un nom de
-- colonne de sortie) : il faut renommer explicitement la colonne côté vue.
alter view items_with_alerts rename column rope_color to color;
