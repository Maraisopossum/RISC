-- Résultats de contrôle SECT : OK / A_REPARER / A_DETRUIRE (les anciennes
-- valeurs restent telles quelles dans la table, la colonne est du texte libre).
-- Ajoute à la vue le résultat du dernier contrôle (le plus récent, à date
-- égale le dernier saisi).
--
-- La vue est supprimée puis recréée (et non "create or replace") : `i.*`
-- s'étend aux colonnes actuelles de items, dans un ordre qui peut différer de
-- celui de la vue déjà en base (colonnes ajoutées par les migrations 002/003).
-- Aucun autre objet ne dépend de cette vue.

drop view if exists items_with_alerts;

create view items_with_alerts as
select
  i.*,
  li.last_inspection_on,
  (
    i.status = 'en_service'
    and i.manufacture_date_unknown = false
    and i.manufacture_date is not null
    and i.manufacture_date <= (current_date - interval '10 years')
  ) as alert_age,
  (
    i.status = 'en_service'
    and (li.last_inspection_on is null or li.last_inspection_on <= (current_date - interval '1 year'))
  ) as alert_control,
  li.last_inspection_result
from items i
left join lateral (
  select inspected_on as last_inspection_on, result as last_inspection_result
  from inspections
  where inspections.item_id = i.id
  order by inspected_on desc, id desc
  limit 1
) li on true;
