# Endurecimiento de Supabase para E-ternal

El código ya filtra por usuario y usa URLs firmadas, pero la seguridad real vive
en el servidor. Aplica estos pasos en tu panel de Supabase (**SQL Editor** y
**Storage**). El orden importa: primero el SQL, luego pruebas la app.

> La app funciona antes y después de aplicar esto (tiene fallbacks de
> transición), pero los datos solo quedan realmente aislados cuando termines
> el paso 3.

## Paso 1. Dueño por fila + RLS en `memories`

Ejecuta en el SQL Editor:

```sql
-- Columna que identifica al dueño de cada recuerdo
alter table public.memories
  add column if not exists user_id uuid references auth.users (id);

-- Activar Row Level Security
alter table public.memories enable row level security;

-- Leer: solo las filas propias
drop policy if exists "memories_select_own" on public.memories;
create policy "memories_select_own" on public.memories
  for select to authenticated using (auth.uid() = user_id);

-- Insertar: solo filas propias
drop policy if exists "memories_insert_own" on public.memories;
create policy "memories_insert_own" on public.memories
  for insert to authenticated with check (auth.uid() = user_id);

-- Actualizar: solo filas propias
drop policy if exists "memories_update_own" on public.memories;
create policy "memories_update_own" on public.memories
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Borrar: solo filas propias
drop policy if exists "memories_delete_own" on public.memories;
create policy "memories_delete_own" on public.memories
  for delete to authenticated using (auth.uid() = user_id);
```

## Paso 2. Filas existentes (quedan invisibles tras el paso 1)

Las filas creadas antes tienen `user_id` nulo y RLS las ocultará. Asígnaselas
a tu usuario (tu UUID está en **Authentication > Users**) o bórralas si eran
de prueba:

```sql
update public.memories set user_id = '<TU-UUID-DE-AUTH-USERS>'
  where user_id is null;
```

## Paso 3. Bucket `vault` privado + políticas por carpeta

La app ahora sube a `{userId}/archivo.ext` y reproduce con URLs firmadas de
1 hora. Haz privado el bucket y limita cada usuario a su carpeta:

```sql
update storage.buckets set public = false where id = 'vault';

-- Subir: solo a tu carpeta y solo audio/video
drop policy if exists "vault_insert_own" on storage.objects;
create policy "vault_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vault'
    and (storage.foldername(name))[1] = auth.uid()::text
    and ((metadata ->> 'mimetype') like 'video/%'
      or (metadata ->> 'mimetype') like 'audio/%')
  );

-- Leer (incluye URLs firmadas): solo tu carpeta
drop policy if exists "vault_select_own" on storage.objects;
create policy "vault_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vault'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Borrar: solo tu carpeta
drop policy if exists "vault_delete_own" on storage.objects;
create policy "vault_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vault'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

Notas:

- Los recuerdos viejos con URL pública guardada dejarán de reproducirse al
  privatizar el bucket. Vuelve a subir esos archivos para regenerarlos.
- El límite de 50 MB vive en la app (ayuda visual) e iguala el tope global
  del plan Free, que no es configurable. Si subes de plan, podrás subir el
  tope en Storage > Settings y en la constante MAX_UPLOAD_BYTES de la app.
- La `anon key` es pública por diseño (viaja en el JS). Jamás pongas la
  `service_role` en el frontend: con RLS bien puesto, la anon key solo
  alcanza los datos del usuario autenticado.

## Paso 4. Auth: exige confirmación de correo (recomendado)

En **Authentication > Sign In / Up**, activa la confirmación de correo para
que solo entren cuentas reales. La app muestra "Sin confirmar" en el perfil
hasta que el usuario valida su correo.

## Paso 5. Verificar el aislamiento

1. Crea un segundo usuario desde la propia app (otro correo).
2. Con el usuario 1, crea un recuerdo con archivo.
3. Entra con el usuario 2: no debe ver ni el recuerdo ni el archivo del
   usuario 1, ni poder borrarlo.
4. Copia la URL de un video siendo el usuario 1, ciérrala sesión y ábrela
   en incógnito tras 1 hora: debe fallar (URL firmada expirada).

## Siguiente: bóveda por persona + entrega + entrevista

Continúa con `supabase/vault-delivery-setup.sql` (tablas `recipients`,
`family_members`, `interview_state`, `custodians`, `deliveries`, columnas
nuevas en `memories` y trabajo programado de reparto).
