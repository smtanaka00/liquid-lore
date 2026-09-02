-- 0007_wishlist.sql
--
-- The wishlist: "must-try" drinks, alongside the "go-to" favourites (G2).
--
-- It is a column on `favorites`, not a second table. The two lists hold the same thing —
-- a reference to a drink — and a separate table would mean duplicating the RLS policy, the
-- `kind` discriminator and every read, for no gained expressiveness.
--
-- The existing `unique (user_id, drink_id)` is deliberately left alone, so a drink has
-- exactly one status: promoting something from the wishlist to a favourite is an update of
-- `list`, not an insert that would leave it sitting in both sections of the profile.

alter table favorites
    add column if not exists list text not null default 'favorite';

-- Recreated rather than added conditionally: the values are the app's vocabulary and this
-- migration is the only place they are defined, so re-running it should re-assert them.
alter table favorites drop constraint if exists favorites_list_check;
alter table favorites add constraint favorites_list_check
    check (list in ('favorite', 'wishlist'));

-- The profile reads one list at a time; without this it is a scan of everything the user
-- has ever saved.
create index if not exists favorites_user_list_idx on favorites (user_id, list);
