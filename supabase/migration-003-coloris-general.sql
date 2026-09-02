-- Généralise la couleur : jusqu'ici réservée aux cordes (rope_color), elle
-- devient un champ générique utilisable par tout type de matériel (sangles,
-- harnais...). Aucune donnée n'existe encore dans cette colonne (vérifié
-- avant migration), donc un simple renommage suffit sans perte.
alter table items rename column rope_color to color;
