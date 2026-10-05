-- =========================================================
-- Coordenadas del local (origen para el cálculo de distancia por
-- calle). Se guardan en config_envios en vez de hardcodearse en la
-- Edge Function, para poder corregirlas sin redeploy si están mal.
--
-- IMPORTANTE: el geocode automático de la DIRECCIÓN EXACTA del local
-- (Arenales 345) no dio un resultado confiable al probarlo contra
-- OpenRouteService (ver aviso completo en la respuesta del chat) -- la
-- cobertura de numeración de calle en esa zona es floja en
-- OpenStreetMap. Estos valores son la MEJOR aproximación encontrada
-- (nivel de calle, no de altura exacta), quedan como semilla para que
-- el dueño los corrija una vez desde la pantalla de Zonas de envío
-- (ej. copiando las coordenadas exactas de Google Maps) -- no asumir
-- que están perfectos.
-- =========================================================

alter table config_envios add column if not exists origen_lat numeric;
alter table config_envios add column if not exists origen_lng numeric;

update config_envios
set origen_lat = -31.425645,
    origen_lng = -64.250756
where origen_lat is null;
