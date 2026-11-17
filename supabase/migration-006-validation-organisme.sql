-- Validation des contrôles par l'organisme de contrôle : une date de
-- validation par contrôle (null = pas encore validé). Les contrôles d'une année
-- sont exportés depuis la page Matériel, puis marqués validés une fois le
-- retour de l'organisme reçu.
alter table inspections add column if not exists validated_on date;

-- La vue expose le résultat et la validation du dernier contrôle. Supprimée
-- puis recréée (cf. migration 005) : `i.*` peut s'étendre dans un ordre
-- différent de la vue existante.
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
  li.last_inspection_result,
  li.last_inspection_validated_on
from items i
left join lateral (
  select
    inspected_on as last_inspection_on,
    result as last_inspection_result,
    validated_on as last_inspection_validated_on
  from inspections
  where inspections.item_id = i.id
  order by inspected_on desc, id desc
  limit 1
) li on true;
