-- =========================================================
-- Fix: AuthContext.loadPerfil() hace
--   supabase.from('usuarios').select(...).eq('id', authUser.id).maybeSingle()
-- para saber quién sos apenas logueás. Esa consulta corre como el
-- usuario autenticado (no como service role), así que necesita su
-- propia policy de SELECT en `usuarios`.
--
-- rls_setup_cajero.sql:40 sólo agrega "usuarios_select_dueno"
-- (auth_rol() = 'dueño'), y su comentario dice que ya existía una
-- policy "usuarios_select_propio" agregada antes -- pero esa policy
-- no está en ningún .sql del repo, así que probablemente se aplicó
-- a mano desde el SQL editor de Supabase y se perdió/nunca se guardó
-- (o se borró sin querer). Resultado: un login que NO es 'dueño' no
-- puede leer ni su propia fila de `usuarios` -> el select vuelve
-- vacío, usuario queda null en el AuthContext, y todo lo que depende
-- de usuario?.rol (los botones de ajuste de stock, el nombre/rol que
-- se muestra en el sidebar, etc.) se comporta como si nadie hubiera
-- logueado.
--
-- Corre esto una sola vez en el SQL editor de Supabase.
-- =========================================================

drop policy if exists "usuarios_select_propio" on usuarios;
create policy "usuarios_select_propio"
on usuarios
for select
using (id = auth.uid());
