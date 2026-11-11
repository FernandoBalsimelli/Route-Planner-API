# Alternativas de recorrido

Consulta técnica: 10 de noviembre de 2026 (Chihuahua). No cambia cobertura normativa ni certifica circulación.

## Contrato

`POST /v1/routes/plan` acepta `alternatives: true`, opcional y falso por defecto. Se permite sólo con origen y destino sin intermedias; rechaza la combinación con entregas sin borrarlas. El recorrido normal sigue admitiendo 48 paradas intermedias.

Se hace una solicitud Directions con `alternative_routes: { target_count: 3, share_factor: 0.6, weight_factor: 1.4 }`. Se conservan perfil HGV, las cinco restricciones soportadas del camión y preferencias de peajes/autopistas. No se repite una petición quitando restricciones si el proveedor falla.

ORS publica hasta tres rutas y 100 km para alternativas. Antes de Directions se rechazan extremos separados por más de 100 km en línea recta: es un descarte de solicitudes imposibles, no distancia de conducción ni garantía de aceptación por debajo de ese valor. Un rechazo de distancia del proveedor conserva el error e invita a desactivar alternativas; no convierte el recorrido a una recta.

La respuesta conserva `route` para compatibilidad. Con alternativas solicitadas añade `alternatives` (otras cero a dos rutas) y `alternativeSummary` (cantidad disponible, máximo y opciones omitidas). Cada resultado tiene su propia geometría, instrucciones, índices de extremos y revisión de jurisdicciones, además del mismo contexto de unidad y preferencias. Distancias/tiempos proceden del proveedor, sin estimaciones fabricadas para completar opciones.

Una primaria incompleta produce ORS_INVALID_ROUTE; no se sustituye silenciosamente. Las secundarias incompletas, duplicadas o excedentes se omiten y se informa su cantidad. Sólo se ofrece un recorrido si sólo hay uno válido. Se exige geometría decodificable, métricas finitas no negativas e índices de los dos extremos.

## Uso y persistencia

La Web permite comparar y seleccionar. Cambiar de opción no vuelve a consultar la API: actualiza mapa, métricas, instrucciones, jurisdicciones, navegación/exportación y los datos que se guardan. Un cambio de ruta termina la sesión GPS anterior mediante los controles existentes. Durante el guardado se desactiva la selección.

Guardar conserva únicamente el resultado elegido y su trazado, con el mecanismo transaccional existente. Al cargarlo se restaura ese resultado, sin inventar las opciones que no se guardaron. Añadir una entrega desactiva la búsqueda de alternativas y cancela cálculos obsoletos. Los enlaces de Google conservan su semántica: no importan una polilínea ni atributos HGV, aunque se seleccione otra opción aquí.

## Fuentes y prueba pendiente

- [Restricciones alojadas de ORS](https://giscience.github.io/openrouteservice/hosted-api-restrictions).
- [Cliente oficial de ORS, contrato alternative_routes](https://github.com/GIScience/openrouteservice-py/blob/master/openrouteservice/directions.py).
- [Formato oficial de resultados](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/requests-and-return-types).
- [Opciones HGV](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/routing-options).

Las pruebas de integración usan Auth y REST locales reales y ORS simulado. No equivalen a obtener alternativas reales con una sesión de producción ni a conducción Android física. La disponibilidad de opciones depende del mapa, restricciones, credencial y cuotas; no se garantiza obtener tres.

Sin migración ni cambios de RLS. Rollback de código: volver a los despliegues anteriores de Web y API; los recorridos guardados siguen usando el mismo contrato JSON.
