-- The fee rate is public (platform_settings is readable by anyone), so the
-- helper doesn't need definer rights; the triggers that call it already have
-- them.
alter function public.current_commission_rate() security invoker;
