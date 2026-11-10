# Búsqueda cercana de establecimientos

Actualizado el 10 de noviembre de 2026. Sólo Route Planner; sin cambios de base de datos.

## Diagnóstico real

La versión anterior sólo consultaba Photon si Pelias no encontraba nada cercano
o si no coincidía un número solicitado. Una sucursal cercana en el primer
índice cerraba la búsqueda, aunque faltaran otras sucursales. En la comprobación
pública de Monterrey, `Bodega Aurrera Express` devolvía cinco ubicaciones de
varios municipios; la consulta Photon con bbox encontraba más puntos con calles.
En Chihuahua, la búsqueda genérica Aurrera tenía dos coincidencias cercanas y
rellenaba la lista con ciudades a cientos de kilómetros. La búsqueda Express
sin coincidencias locales no demuestra que no existan tiendas allí: sólo indica
falta de resultados en esos índices.

## Comportamiento nuevo

- Las búsquedas de nombres con referencia geográfica, sin número de domicilio,
  consultan Pelias y Photon con un área de unos 50 km en paralelo. La caja es un
  filtro de búsqueda; la clasificación final usa distancia en línea recta.
- Se solicitan hasta 20 candidatos locales y se devuelven hasta ocho. Si hay
  resultados a 50 km o menos, no se rellenan espacios con ciudades lejanas.
- Una ciudad indicada expresamente tiene prioridad. Las comas, `en ciudad`,
  código postal y otras calificaciones existentes desactivan el foco; una
  localidad reconocida en los resultados también tiene prioridad sobre cercanía.
- Para la búsqueda explícita de Bodega Aurrera se consultan objetos de tiendas,
  se desactiva la deduplicación remota que agrupa negocios del mismo nombre y
  código postal y se distingue Express de Mi Bodega cuando se pide ese formato.
  El plural Bodegas se normaliza sólo para esa marca reconocida. No se cambia
  el texto/domicilio devuelto por el proveedor ni se inventa la sucursal.
- La deduplicación local conserva negocios con calles o números diferentes,
  incluso si están muy próximos. Para un mismo punto se prefiere la respuesta
  que aporta calle y número. No se promedian coordenadas de proveedores.
- Se rechazan coordenadas nulas, no numéricas y fuera de rango. Un valor nulo
  no se convierte en un punto geográfico cero.
- Consultas idénticas en curso comparten la petición; caché acotada a 200 entradas
  por instancia, durante dos minutos. Se mantienen debounce y cancelación de
  respuestas obsoletas del cliente. No se cachean errores como listas vacías.
- Un fallo de la consulta local no descarta resultados válidos del primer
  proveedor ni provoca reintentos repetidos inmediatos al servicio fallido.
  Si falla todo, se identifica indisponibilidad/límite/timeout de Photon con
  códigos propios; no se atribuye su fallo a una clave de ORS.
- El usuario debe corroborar sucursal y acceso de descarga. El punto del negocio
  puede ser un centroide y no una entrada apta para un camión. Sin coincidencias
  a 50 km se conserva el aviso y el usuario puede desactivar cercanía o elegir
  el punto en el mapa. Las rutas usan sólo la ubicación confirmada.

## Proveedores, datos y límites

No se contrataron servicios ni se añadieron claves. Se conserva Photon como
proveedor compatible existente, con peticiones acotadas/caché. Su instancia
pública permite uso razonable pero no ofrece garantía de disponibilidad y puede
limitar consultas; no se presenta como infraestructura ilimitada. Antes de
escalar se debe evaluar capacidad propia o un proveedor autorizado, sin activar
gastos automáticamente. Se mantiene la atribución de OpenStreetMap del mapa.

Documentación primaria consultada:

- https://github.com/komoot/photon/blob/master/docs/api-v1.md : bbox,
  dedupe, filtros OSM, foco y límite. El filtro osm_tag está documentado como
  compatible aunque deprecado en favor de categorías cuya configuración varía
  por instancia; su funcionamiento debe verificarse en el servidor utilizado.
- https://github.com/komoot/photon/blob/master/README.md : política de la instancia
  pública, uso razonable y ausencia de SLA.
- https://dev.overpass-api.de/overpass-doc/en/preface/commons.html : se evaluó
  Overpass, pero su operador desaconseja usar la instancia pública como backend
  de una aplicación general. No se integró ni se creó una dependencia nueva.

Esta mejora no acredita aperturas, cierres, horarios comerciales, formato oficial
actual, entrada de descarga ni cobertura exhaustiva de establecimientos. No
extrae datos de Google Maps ni sustituye normativa municipal o restricciones HGV.

## Verificación

Las pruebas cubren la consulta local pese a tener una coincidencia previa,
formatos Express/Mi Bodega, deduplicación de tiendas contiguas, coordenadas
malformadas, consulta compartida, recuperación tras fallos, bbox en fronteras
geográficas, ciudad expresa y exclusión de sugerencias lejanas cuando hay locales.
La Web prueba confirmación y conservación de coordenadas con aviso de acceso.
La comprobación de producción y sus SHAs se registran al cerrar el ciclo en
Web/docs/ENGINEERING-STATUS.md. No se declara finalizado el prompt maestro.
