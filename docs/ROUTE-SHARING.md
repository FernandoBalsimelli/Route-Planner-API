# Enlaces de puntos compartidos

Revisión técnica: 17-11-2026. Alcance exclusivo: Route Planner.

## Contrato y consentimiento

El dueño abre **Mis rutas → Compartir puntos**, elige 1, 24, 72 o 168 horas,
acepta explícitamente compartir nombre, ubicaciones y parámetros del vehículo,
y genera el enlace. No se envía ningún mensaje automáticamente. Los enlaces
anteriores no se pueden reconstruir: el token completo se devuelve una sola vez.
El receptor puede abrirlo sin cuenta, revisar sus puntos y usar la copia como
borrador. Debe calcular nuevamente; no recibe una polilínea, métricas ni una
clasificación legal. Las copias ya importadas no se pueden borrar remotamente.

La instantánea conserva origen, destino, hasta 48 paradas intermedias ordenadas,
modo, cinco medidas/pesos del camión y sus parámetros operativos opcionales,
y preferencias de peaje/autopista. No contiene IDs de dueño, ruta, vehículo o
flota, correo, trazado, instrucciones, resultados ni cobertura normativa.
Las etiquetas escritas por el operador sí se comparten: debe revisarlas antes
de dar su consentimiento. Cambiar el recorrido original no actualiza los enlaces.

## Persistencia y permisos

Migración aditiva `supabase/migrations/20261117101117_route_share_links.sql`:

- `public.route_share_links`: RLS; sólo el dueño puede consultar columnas de
  administración. `snapshot` y `token_hash` no tienen SELECT para clientes.
- `create_route_share_link(uuid,integer)`: autenticación, pertenencia, ruta activa,
  puntos válidos, modo explícito y perfil de camión completo. Caduca entre 1 y
  168 horas. Bloquea la fila de la ruta para serializar un máximo de diez enlaces
  activos, independiente del número de entregas. Un exceso se rechaza sin recortar.
- El token usa dos UUID aleatorios, SHA-256 y 64 caracteres hexadecimales. Sólo
  su SHA-256 se guarda. No aparece en parámetros de consulta ni rutas HTTP: va
  en el fragmento `#compartir=…`. El RPC de lectura lo recibe en el cuerpo POST.
- `read_route_share_link(text)`: lector limitado por posesión del token, índice
  único por hash, comprobación de caducidad/revocación y estado del original.
  Anónimo y autenticado reciben la misma respuesta nula si no está disponible.
- `revoke_route_share_link(uuid)`: sólo el dueño puede revocar; operación idempotente.
- Archivar dispara revocación persistente. Recuperar la ruta no reactiva enlaces.
- Helpers y trigger en esquema `route_private`, sin acceso de cliente. Los tres
  RPC públicos usan `SECURITY DEFINER` intencionalmente para servir únicamente
  el contrato reducido; tienen `search_path=''` y grants explícitos.

La interfaz limita la espera a 30 segundos y cancela al salir/cambiar de cuenta.
Una respuesta tardía no puede importar puntos ni mostrar un token en otra cuenta.
Si crear un enlace termina en timeout, el servidor pudo haberlo creado: actualizar
la lista permite revocarlo sin necesitar conocer el token. La lista mantiene los
potencialmente activos delante del historial, limitado a 50 metadatos.
Se vuelve a leer el enlace al pulsar **Usar estos puntos**, por si fue revocado o
caducó desde que se abrió. La sustitución del borrador requiere esa acción explícita.

## Verificación y rollback

`test/sql/route-sharing.sql` sólo admite la base desechable `route_planner_ci`.
Comprueba whitelist, precisión, 48 paradas, aislamiento entre dos dueños, permisos
por columna, lectura anónima con token, caducidad, revocación y papelera/recuperación.
El Web fija el commit API probado para levantar su Auth/PostgREST local de CI.
La integración del Web recorre la generación y revisión real en móvil/escritorio
con cuentas locales, y rechaza la importación revocada después de abrir el enlace.
El proveedor ORS de esas pruebas es sintético; no equivale a navegación Android
física, cálculo autenticado en producción ni verificación de calles autorizadas.

Rollback conservador: volver al despliegue Web anterior no elimina filas ni
revoca enlaces existentes por sí solo. Si se necesita suspender su lectura,
ejecutar una migración reversible `revoke execute on function
public.read_route_share_link(text) from anon, authenticated;`. Restaurar con el
grant equivalente tras corregir y probar. Mantener tabla/historial; no borrar datos.
Los tokens ya importados o copiados por receptores no son recuperables remotamente.

Fuentes técnicas: https://supabase.com/docs/guides/database/functions y
https://www.postgresql.org/docs/17/functions-binarystring.html.
