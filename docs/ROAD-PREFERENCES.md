# Preferencias de carretera

Revisión técnica: 10 de noviembre de 2026. Sólo Route Planner.

`POST /v1/routes/validate` y `/v1/routes/plan` admiten:

```json
{"preferences":{"avoidTolls":true,"avoidHighways":false}}
```

Se validan booleanos estrictos y se rechazan propiedades desconocidas del objeto.
Ambos valores son false cuando no se proporcionan; clientes anteriores siguen
funcionando. Directions recibe `options.avoid_features` con `tollways` y/o
`highways` tanto en driving-car como driving-hgv. Se combinan con vehicle_type y
las restricciones de altura, anchura, longitud, peso y carga por eje existentes.
El resultado conserva `route.preferences`, una instantánea de lo solicitado, no
una auditoría de las vías recorridas. No se inventan peajes, precios ni ahorros.

El optimizador VROOM utilizado no recibe esas exclusiones. Para reparto con
más de una parada, optimize=true junto a una preferencia activa se rechaza antes
de geocodificar o llamar al proveedor. La interfaz lo desactiva y conserva el
orden. Camión sigue sin optimización dimensional. No se introduce una matriz
comercial ni un optimizador distinto, ni se amplía el consumo de llamadas.

Los errores de ORS conservan su código y límite real. Si no hay conexión y se
solicitaron exclusiones, el mensaje explica que pueden revisarse; no se reintenta
sin ellas. No se promete evitar toda caseta sin datos cartográficos suficientes,
ni se transforman estas preferencias en permisos municipales. Evitar autopistas
puede llevar a vías urbanas con otras restricciones.

La Web guarda la instantánea dentro del resultado en route_metadata de la RPC
existente, sin migración. Al cargar rutas antiguas se desmarcan preferencias
no registradas. Editarlas cancela el cálculo pendiente y descarta el resultado.
Los enlaces Google usan `avoid=tolls,highways` en todos los tramos y cuentan
esos caracteres en el límite de 2048. Google decide su trazado: no recibe HGV,
polilínea externa ni permisos y puede conservar vías que se prefieren evitar.

Fuentes técnicas primarias comprobadas:
- https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/routing-options
- https://giscience.github.io/openrouteservice/hosted-api-restrictions
- https://developers.google.com/maps/documentation/urls/get-started

Pruebas: payloads con dos/múltiples puntos, ambos perfiles, opciones y medidas
combinadas, compatibilidad anterior, entradas inválidas, bloqueo de optimización
incompatible y ausencia de fallback silencioso. La integración Web usa Auth,
REST y RPC locales reales con proveedor de ruteo sintético; no es ensayo Android
ni cálculo autenticado de producción con ORS real. El cierre publicado y rollback
se documentan en Web/docs/ENGINEERING-STATUS.md.
