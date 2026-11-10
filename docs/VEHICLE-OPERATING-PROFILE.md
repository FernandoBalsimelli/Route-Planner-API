# Perfil operativo del vehículo

Actualizado: 2026-11-10. Alcance: datos declarados de la unidad, no autorización de circulación.

## Contrato

`vehicle.axleCount` es un entero opcional de 2 a 12; `configuration` es un código opcional del catálogo `data/vehicle-configurations.json`; `payloadCapacityT` es la capacidad máxima de carga declarada, mayor que cero, hasta 100 toneladas y con máximo tres decimales. No equivale al peso bruto real cargado ni al peso por eje. No se calcula una carga por eje dividiendo el peso bruto entre los ejes.

Una configuración identificada requiere su número total de ejes consistente. Una unidad sin configuración identificada puede registrar sólo sus ejes. Los campos ausentes siguen sin conocerse; no se sustituyen por valores supuestos. Las solicitudes anteriores siguen siendo válidas.

La respuesta de un cálculo de camión conserva `vehicleContext`, los datos normalizados declarados. OpenRouteService recibe exclusivamente altura, anchura, longitud, peso bruto y carga por eje soportados previamente. No recibe estos tres campos nuevos como restricciones ficticias. La capacidad y los ejes no activan exclusiones municipales, no verifican límites de la NOM ni garantizan una ruta legal.

## Fuente y alcance

- [NOM-012-SCT-2-2017, Tabla B-2](https://sidof.segob.gob.mx/notas/docFuente/5508944), consultada 2026-11-10: nomenclatura y número de ejes de 23 configuraciones. No se han convertido sus tablas de peso, neumáticos, clases de carretera, condiciones especiales o permisos en reglas ejecutables. No representa todas las unidades posibles.
- [Opciones de OpenRouteService](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/routing-options): dimensiones, peso y carga por eje; no configuración, capacidad nominal ni número de ejes.

## Persistencia y recuperación

Migración aditiva `20261110181032_vehicle_operating_profile.sql`: `vehicles.axle_count`, `vehicle_configuration`, `payload_capacity_t`, todos anulables. Una restricción CHECK rechaza configuración desconocida o ejes inconsistentes. La capacidad usa numeric sin redondeo automático y rechaza más de tres decimales para no alterar umbrales legales. No modifica propiedad, RLS ni elimina filas.

El cliente conserva estos datos en `saved_routes.route_metadata.vehicle`, junto al perfil dimensional histórico. Editar posteriormente el vehículo no modifica el perfil guardado en una ruta anterior. No requiere migrar el JSON histórico ni inventar campos ausentes.

Orden de despliegue: comprobar migraciones y RLS en Postgres aislado, aplicar la migración en Route Planner, publicar API compatible y luego Web. Rollback: volver a los despliegues anteriores, conservar las columnas nuevas y los datos; no ejecutar DROP para revertir la interfaz.

La versión aplicada por Supabase es `20261110181032`. El archivo se alinea con ese registro; el SQL es idéntico al probado inicialmente con la versión local `20261110175839`. No se reejecuta la migración ni se modifica su historial remoto.
