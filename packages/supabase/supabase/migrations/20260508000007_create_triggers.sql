create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_places_updated_at
  before update on public.places
  for each row execute function public.set_updated_at();

create trigger trg_saved_places_updated_at
  before update on public.saved_places
  for each row execute function public.set_updated_at();
