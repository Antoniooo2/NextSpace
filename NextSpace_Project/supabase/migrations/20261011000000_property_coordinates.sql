-- Optional map pin for each space (set by the owner, shown on the Marketplace map).
-- Nullable: spaces without a pin still appear in the list view.
alter table public.add_business
    add column if not exists latitude double precision,
    add column if not exists longitude double precision;

alter table public.add_business drop constraint if exists add_business_coordinates_check;
alter table public.add_business add constraint add_business_coordinates_check check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
);
