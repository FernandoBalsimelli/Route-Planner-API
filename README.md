# Route Planner API

API Fastify para geocodificar direcciones y calcular recorridos con OpenRouteService (HeiGIT).

## Variables de entorno
- ORS_API_KEY: clave gratuita de HeiGIT/OpenRouteService. Solo en el backend de Vercel; nunca usar prefijo NEXT_PUBLIC_.
- SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY: validación de sesiones.
- ALLOWED_ORIGINS: orígenes web permitidos separados por coma.

## Endpoints
- GET /health — salud y disponibilidad de OpenRouteService (sin revelar secretos).
- GET /v1 — capacidades y estado.
- POST /v1/routes/validate — valida payload.
- POST /v1/routes/plan — requiere Authorization: Bearer <session>; geocodifica y calcula. Límite: 10 solicitudes por minuto por IP.

## Errores del proveedor

La API distingue errores de autenticación (`ORS_AUTH_FAILED`), denegaciones de acceso o cuota diaria (`ORS_ACCESS_OR_DAILY_LIMIT`), restricciones del nivel de clave (`ORS_PLAN_RESTRICTION`), límites por minuto (`ORS_RATE_LIMIT`) y tiempos de espera (`ORS_TIMEOUT`). Estos códigos permiten mostrar mensajes útiles sin exponer la clave ni los detalles internos del proveedor.

## Optimización de paradas

`POST /v1/routes/plan` acepta `optimize: true` para ordenar automáticamente dos o más paradas de reparto mediante VROOM (`https://api.heigit.org/vroom/v0`). La API vuelve a solicitar Directions con el orden resultante para devolver geometría e indicaciones. La optimización permanece desactivada por defecto y no se ofrece para camiones porque VROOM no recibe las restricciones de dimensiones y peso que Directions aplica al perfil HGV.

## Perfiles
- Reparto: driving-car.
- Transporte pesado: driving-hgv, vehicle_type hgv y restricciones de altura, ancho, largo, peso bruto y carga por eje en metros/toneladas.

Las restricciones solo se aplican donde la cartografía contiene los datos correspondientes. La cobertura en México puede ser incompleta: el resultado no garantiza que una vía sea legal o físicamente transitable para el camión. Verifica señalización y normativa local antes de circular.

## API alojada
Host vigente: https://api.heigit.org
- Geocodificación: /pelias/v1/search
- Rutas: /openrouteservice/v2/directions/{profile}/json

## Desarrollo y despliegue

`npm ci` y `npm run dev` inician el servidor local mediante `server.js`.
`npm test` verifica el handler HTTP real, solicitudes concurrentes, cuerpos JSON y autenticación.

En Vercel, `index.js` exporta directamente un handler Node `(request, response)`
que espera `app.ready()` y entrega la solicitud a Fastify. Importar el módulo no
abre un puerto: el arranque local queda separado para evitar depender de la
interceptación asíncrona de `listen()` durante el inicio de la función.


## Búsqueda y selección de ubicaciones

- `GET /v1/locations/suggest?q=...`: sugerencias de direcciones y lugares mediante Pelias Autocomplete; devuelve etiqueta, coordenadas y Plus Code.
- `GET /v1/locations/reverse?lat=...&lng=...`: convierte coordenadas a dirección legible y Plus Code.
- Se aceptan coordenadas decimales separadas por coma o espacio.
- Se aceptan Plus Codes globales y códigos cortos acompañados de ciudad/localidad. Un código corto sin referencia geográfica no identifica un punto único.
- `POST /v1/routes/plan` acepta texto libre o puntos confirmados con `label`, `lat` y `lng`; los puntos confirmados se enrutan sin geocodificarlos otra vez.
- Los Plus Codes se decodifican con la implementación TypeScript del estándar Open Location Code; no se requiere una API de Google ni una clave de Google Maps.

La búsqueda sugiere resultados basados en OpenStreetMap/Pelias; su cobertura y nombres pueden diferir de Google Maps.

Las búsquedas de puntos excluyen estados, países y otras regiones extensas para
evitar enrutar hacia su centro geográfico. Las ciudades incluyen su estado en la
etiqueta. Photon sirve de respaldo sin forzar idiomas no soportados.

Si el proveedor no encuentra una vía transitable cerca de un punto, la API devuelve
`ORS_POINT_NOT_ROUTABLE`, `waypointIndex` (origen = 0, después las paradas y el
destino) y el punto afectado. Debe corregirse ese acceso; la API conserva las
coordenadas confirmadas y las restricciones del vehículo. También distingue
`ORS_ROUTE_TOO_LONG`, `ORS_NO_ROUTE` y `ORS_ROUTING_UNAVAILABLE`.

### Nearby suggestions

`GET /v1/locations/suggest?q=Bodega%20Aurrera%20Express&lat=25.6866&lng=-100.3161`
uses the origin as a soft focus for Pelias and Photon. Results include optional
`distanceMeters` (straight-line distance), `name` and `locality`. Explicit city
matches take precedence; comma/`en`/postal qualifiers disable origin proximity.
An empty or distant (>50 km) focused response includes `NO_NEARBY_MATCHES`.
Coordinates and full/compound Plus Codes retain their existing resolution.
Responses are cached in memory for 60 seconds, capped at 200 queries. Query
strings are omitted from request logs. No paid providers were added.

### Favorite delivery locations

Additive Supabase migrations in `supabase/migrations` introduce owner-scoped
verified locations. Public clients can select/insert/update their own favorites;
removal is an archive operation. Coordinates are unique per owner. RLS rejects
cross-account reads/writes and the public API role has no physical DELETE grant.
The runtime API is unchanged by these migrations. Rollback the UI independently;
retain the table and data if reverting a release.

### Atomic saved routes

`save_route_with_stops(uuid,jsonb,jsonb)` is an authenticated SECURITY INVOKER
Supabase RPC. It validates inputs and vehicle ownership, inserts the route and
ordered stops transactionally, and uses a per-owner request key and content
fingerprint to make retries idempotent. Its additive columns are nullable for
older clients. Never drop data when reverting the UI; leave the migration in
place. Anonymous users have no EXECUTE privilege.
