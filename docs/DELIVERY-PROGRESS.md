# Avance manual de entregas

Revisión: 17-11-2026. Exclusivamente Route Planner.

En Mis rutas, **Entregas** abre una lista de todas las paradas intermedias y el
destino. Marcar casillas no escribe automáticamente: **Guardar avance** registra
una selección completa. Al volver a abrir o iniciar otra sesión de la misma cuenta,
se recupera la revisión del servidor. **Actualizar avance** vuelve a consultar y
sustituye la selección local. Los cambios sin guardar se indican explícitamente.

El avance es una declaración manual, no comprobante de entrega ni llegada GPS.
No elimina puntos, modifica la ruta calculada o cambia enlaces de navegación.
Para navegar se carga la ruta completa y se revisa Retomar desde explícitamente.
No se publica avance mediante enlaces compartidos ni se guarda en localStorage.

## Contrato de base de datos

Migración creada con CLI: `20261117201420_route_delivery_progress.sql`.

- Tabla `route_delivery_events`: clave ruta/revisión, dueño, huella de puntos,
  secuencias completadas y fecha. Cada cambio añade una fila. Clientes sólo tienen
  SELECT e INSERT bajo RLS; no UPDATE/DELETE. No se modifica ninguna ruta/parada
  existente. Archivar impide editar, recuperar conserva el historial.
- El RPC `route_delivery_progress` usa SECURITY INVOKER y search_path vacío.
  Requiere auth.uid() y pertenencia a una ruta activa, además de las políticas RLS.
  No tiene acceso anónimo ni eleva privilegios.
- La huella incluye los puntos validados en orden y las identidades/secuencias
  originales de route_stops. Visitas distintas con igual etiqueta y coordenadas no
  se fusionan. Si cambian puntos/orden/identidades, la selección anterior no se
  aplica; guardar una selección revisada añade historial sin borrar el anterior.
- Un bloqueo breve de la fila de la ruta serializa los RPC y el archivo de la ruta.
  Cada escritura compara la revisión esperada y la huella actual. Otra sesión
  no se sobrescribe silenciosamente: se devuelve 40001 y la interfaz conserva
  cambios locales hasta que el operador actualice y revise.
- La consulta no crea revisiones. Guardar la misma selección en la misma revisión
  no duplica filas. La lista contiene hasta 48 paradas más destino (49 casillas).
  El origen no se marca como entrega. Se rechazan duplicados, nulos y fuera de rango.
- Se devuelven las diez revisiones recientes. Preparar una selección anterior
  no escribe ni borra; guardarla añade una revisión. Revisiones de otros puntos
  se conservan pero no se pueden aplicar a la lista actual.

Es historial operativo privado, no una bitácora probatoria o inalterable frente
al dueño: el rol autenticado puede insertar datos propios válidos por REST bajo
RLS. El RPC/UI añaden controles de revisión/huella; no certifican entregas.
El historial permanece ligado al ciclo de vida de su ruta/cuenta. No se implementa
purga automática ni se eliminan datos alojados en esta implementación.

## Validación y rollback

SQL desechable verifica persistencia, 48 paradas, precisión, revisión conflictiva,
identidad de visitas repetidas, archivo/recuperación, historial y acceso por dueño.
Web verifica datos no confiables, selección manual, revisión previa a guardar,
reintento y descarte de respuestas después de cerrar/cambiar cuenta. Integración
Auth/REST local incluye recarga, conflicto de otra sesión, recuperación de historial,
cambio de puntos, papelera y dos escrituras simultáneas de la misma revisión.
No representa uso autenticado alojado, sensores físicos ni prueba de entrega real.

La migración es aditiva. Volver a la Web anterior oculta los controles sin eliminar
historial. Si fuera necesario suspender escrituras, revocar INSERT de
public.route_delivery_events a authenticated y EXECUTE del RPC a authenticated;
reponer los grants después de corregir/verificar. No borrar tabla ni filas.
Las políticas de los demás recursos y las restricciones de navegación no cambian.

La versión creada con CLI se alineó con la versión 20261117201420 registrada
por apply_migration en pakhlscjbjvwnheeyjxd. El SQL no cambió respecto del commit
6fbf44c probado. No se editaron filas del historial de migraciones alojado.
Después de aplicar se conservan 3 rutas, 10 paradas, 1 vehículo y 0 enlaces;
la nueva tabla tiene 0 revisiones. No se sembraron datos o cuentas de prueba.
