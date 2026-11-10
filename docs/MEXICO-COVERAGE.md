# Cobertura municipal mexicana y navegación

Revisión: 2026-11-09. Exclusivamente Route Planner. El programa general sigue abierto.

## Qué existe realmente

| Capa | Cobertura de esta versión | Efecto en el cálculo |
| --- | --- | --- |
| Catálogo y límites INEGI | 32 entidades y 2,478 municipios/demarcaciones; límites oficiales de diciembre de 2025 simplificados y versionados | Identifica aproximadamente qué jurisdicciones toca la polilínea; no es una lista de calles permitidas |
| Monterrey, código 19039 | 38 renglones de red troncal y 19 renglones de horarios extraídos de los anexos 1–3 del reglamento oficial | Referencia consultable con página y sentido; no exclusión geométrica |
| Otros municipios | Nuevas referencias parciales y estados pendientes; ver ciclo nacional más abajo | Ninguna validación legal añadida |
| Motor ORS / OSM | Parámetros de dimensiones y peso existentes | Aplica los datos disponibles del proveedor; cobertura incompleta |
| Navegación interna | GPS e indicaciones sobre la polilínea del cálculo, sin sustituirla | Conserva ese trazado; no acredita legalidad |

**Cero municipios tienen validación automática completa.** La respuesta de cada
ruta declara `regulatoryCoverage.status = not_verified`. Desde este ciclo sí
identifica jurisdicciones aproximadas, separando «referencia cargada» de «reglas
pendientes», pero no aplica esas referencias al motor. Fuera de México no hay catálogo incorporado.
No se garantiza evitar infracciones, cierres, señalización nueva ni permisos locales.

## Fuentes y reproducción

API `scripts/sync-mx-catalog.py` consulta exclusivamente el servicio INEGI:
https://gaia.inegi.org.mx/wscatgeo/v2/mgee y `/mgem/{entidad}`.
Valida las 32 entidades, unicidad de códigos y presencia de Monterrey; guarda
fecha y URL. No descarga polígonos ni convierte límites geográficos en permisos.
Documentación: https://www.inegi.org.mx/servicios/catalogounico/.

API `scripts/sync-mx-boundaries.py` descarga desde el servicio vectorial oficial
las 2,478 áreas geoestadísticas municipales del Marco Geoestadístico de diciembre
de 2025. Valida que sus claves coincidan exactamente con el catálogo, simplifica
los límites con tolerancia de 0.0005 grados (aproximadamente 56 m) y los codifica
en un índice local reproducible. La API intersecta la polilínea con ese índice;
no depende de que INEGI esté disponible durante un cálculo ni transmite la ruta.
La aproximación puede clasificar con incertidumbre un trayecto pegado al límite.

API `scripts/import-monterrey.py RUTA_PDF` utiliza pdfplumber y las tablas de las
páginas 163–167 del PDF oficial consolidado:
https://www.monterrey.gob.mx/pdf/portaln/reglamentos/Reglamento%20de%20Transito%20y%20Vialidad%20del%20Municipio%20de%20Monterrey.pdf
El JSON conserva el SHA-256 del archivo, fecha de consulta, página y anexo. El
9 de noviembre de 2026 se comprobó que el PDF consolidado incluye la reforma
publicada el 24 de abril de 2026 y conserva los artículos 37–43 y anexos 1–3;
no se publica una copia del documento. Exige 38 renglones troncales y 19 de horarios.
Se conservan duplicados de la fuente. Los horarios incluyen America/Monterrey.
La relación entre el artículo 39, excepciones por ejes y anexos de fin de semana
requiere revisión: los registros correspondientes lo advierten. No aplicar esa
interpretación automáticamente. Revisar reformas y vigencia antes de activarla.

Los nombres de una vialidad no bastan para excluir toda la calle. Cada futuro
registro aplicable deberá tener geometría y sentido validados, jurisdicción,
fuente oficial/versionada, vigencia, vehículo/carga, horarios y zona horaria,
excepciones y permisos. Una fuente faltante o dudosa conserva estado pendiente.
La Red Nacional de Caminos y Sakbé de INEGI son fuentes a evaluar; no se han
integrado como motor ni como certificación legal nacional en esta versión.

## API pública de consulta

- `GET /v1/regulations/municipalities?state=19&limit=600`: catálogo paginado,
  estados, procedencia y cobertura real. Filtro `q`, `offset`, límite hasta 600.
- `GET /v1/regulations/municipalities/19039`: referencia de Monterrey.
- Códigos conocidos sin fuente devuelven `not_loaded`, listas vacías y advertencia;
  códigos desconocidos devuelven 404. Los parámetros inválidos devuelven 400.
- `POST /v1/routes/plan`: `regulatoryCoverage.municipalitiesIdentified` ordena
  aproximadamente las jurisdicciones tocadas, con clave INEGI, entidad y estado
  de cobertura. `municipalGeometryEnforced` continúa en `false`.

## Navegar el trazado

Después de calcular, «Iniciar navegación en la app» solicita seguimiento GPS.
Para camiones exige reconocer que se revisaron accesos/permisos y que falta
cobertura municipal. No cambia la polilínea ni pide recalcular al desviarse.

- Proyección sobre el trazado con progreso acotado para evitar saltos a futuros
  cruces o puentes. Las maniobras usan los índices de geometría del proveedor.
- Lecturas con precisión peor que 80 m no avanzan las instrucciones. Posiciones
  antiguas, permiso denegado o falta de GPS ocultan la guía; un desvío avisa y
  exige revisar el recorrido, sin inventar maniobras para reincorporarse.
- GPS/voz se detienen al cambiar el recorrido, cuenta, sección o desmontar.
  Ocultar la app pausa el seguimiento; volver reinicia la adquisición.
- Voz opcional del dispositivo y solicitud de pantalla encendida cuando el
  navegador lo permita. Requiere la app visible; no ofrece navegación en segundo
  plano ni mapas sin conexión. No se guarda ni transmite el seguimiento GPS.
- «Reubicar mi avance» conserva el trazado y reinicia su proyección. Evita
  manipular la app conduciendo; revisar el recorrido en un lugar permitido.
- Las rutas guardadas antiguas sin índices muestran el trazado y GPS, pero
  requieren recalcular para instrucciones ligadas a las maniobras.

Google Maps sigue recibiendo puntos; recalcula con su propio motor y no recibe
la polilínea ORS, dimensiones HGV ni permisos municipales. Maps URLs no permite
prometer esa transferencia exacta. La navegación interna implementa la opción
solicitada de conservar el recorrido. Documento oficial:
https://developers.google.com/maps/documentation/urls/get-started.

## Próximo avance del programa nacional

1. Revisar vigencia e interpretación municipal y georreferenciar los tramos de
   Monterrey por sentido/acceso; pruebas de intersección y vehículos/horarios.
2. Incorporar reglamentos y corredores de otros municipios desde sus portales y
   publicaciones oficiales, con versiones y geometrías verificadas. No extrapolar
   el reglamento de Monterrey a toda la zona metropolitana ni al país.
3. Usar las jurisdicciones ya identificadas para priorizar fuentes faltantes e
   integrar exclusiones al motor solo cuando su geometría y aplicación estén comprobadas.
4. Verificar GPS, voz, consumo, pantalla y accesos reales en Android físico antes
   de considerar navegación de campo validada. Pendientes generales adicionales
   siguen en ENGINEERING-STATUS.md; el prompt maestro no se declara terminado.

## Validación y recuperación

Se usan rutas, sesión de autenticación y posiciones sintéticas en pruebas;
ninguna prueba de navegador se presenta como ensayo de un camión real.
CI compila con configuración pública ficticia de Supabase, interceptada en E2E;
no usa credenciales ni cuentas de producción. Producción conserva su configuración.
Datos nuevos son JSON versionados. No hay migración de base de datos ni
modificaciones a Gestión, planes, credenciales o servicios contratados. Recuperar
los despliegues anteriores de Web/API revierte esta versión.

## Ciclo nacional y enlaces con puntos guía · 9 de noviembre de 2026

El recuadro destacado de Monterrey se retira. El catálogo comienza sin entidad
preseleccionada; estados y municipios se ordenan por nombre antes de paginar.

La API incorpora referencias **parciales para 13 municipios**, contando Monterrey:
9 del AMG comparten una referencia del polígono metropolitano de Jalisco;
Guachochi (arts. 89–91), Juárez (documento histórico de 2003) y Cuauhtémoc
(sólo perímetro A del Centro Histórico). No se afirma vigencia consolidada de
las nuevas referencias ni cobertura de toda su superficie. El portal actual de
Jalisco distingue C2/C3, remolques/sencillos y dobles; no aplicar el horario
06:00–09:00 de dobles indiscriminadamente a todos los vehículos. La guía CDMX
conserva 6 ejes de prohibición de maniobras y 15 vías principales con tramos;
prohibición de descarga no equivale a prohibición de circulación.

`data/mx/national-references.json` versiona fuente, ámbito, revisión, condiciones
vehiculares, zona horaria, interpretación y geometrías pendientes. Los horarios
con días no confirmados mantienen `days: null`. Ninguna referencia nueva altera
el cálculo ni autoriza automáticamente la ruta; siguen **0 municipios con
validación legal completa** y 2,465 municipios sin referencia cargada.

`official-sources.yml` comprueba cinco fuentes oficiales cada seis horas, también
al cambiar su registro/script en main. Sólo utiliza un runner público estándar
y el token temporal del propio repositorio. No instala servicios ni activa pagos.
Guarda hashes, última descarga correcta y errores; mantiene evidencia previa
cuando falla una consulta. En páginas SPA comprueba también el bundle principal;
en Juárez y CDMX vigila además la publicación/registro relacionado. Cambios,
indisponibilidad o más de 18 h sin ejecución se muestran separadamente de la
vigencia jurídica. El monitor **no descubre automáticamente todos los decretos**,
no convierte cambios en reglas aplicables y no garantiza actualización en tiempo
real. La actualización de estado usa una condición SHA para no pisar otra edición.
`GET /v1/regulations/source-status` lee el reporte público versionado con caché
15 min y fallback local; no transmite recorridos, cuentas ni ubicaciones.

Los resultados incluyen `waypoints[].geometryIndex` sólo si el mapeo completo
que entrega ORS es válido y monotónico. La Web prepara puntos guía 25 m después
de maniobras y cada 1.5 km en tramos largos, conservando cada entrega exacta,
incluso en bucles/paradas repetidas. Los enlaces mantienen límites 9/3 y 2048
caracteres, compartiendo extremos y mostrando etiquetas Guía/Entrega. Las rutas
antiguas sin mapeo piden recalcular para habilitar guías. El usuario puede
quitar las guías. `dir_action=navigate` solicita navegación cuando Google la
soporta y el origen coincide con la posición; en otro caso puede abrir vista previa.

**Límite de integración confirmado:** los enlaces de Google Maps no aceptan una
polilínea externa, dimensiones ni permisos de camión. Los puntos guía influyen
pero no bloquean el trazado ni garantizan las calles entre ellos. Google tiene
Large Vehicle Routing limitado a clientes provisionados y cobertura declarada en
los 48 estados contiguos de EE. UU. y Japón; no México. El token se consume en
Navigation SDK dentro de una app integrada, no transfiere ORS a la app de Google
Maps. No se activó ningún producto comercial. Fuentes técnicas primarias:
https://developers.google.com/maps/documentation/routes/lvr-routes-etas
https://developers.google.com/maps/documentation/navigation/android-sdk/large-vehicle-navigation
https://developers.google.com/maps/documentation/urls/get-started

Pendiente obligatorio del programa: cobertura nacional legal/geométrica completa,
validación de vigencia, excepciones y permisos por jurisdicción, acuerdos nuevos
y cierres temporales. No se encontró una fuente oficial única mantenida que
resuelva todos esos campos para los 2,478 municipios. INEGI/RNC no sustituye a
los reglamentos. Priorizar las jurisdicciones de los recorridos reales y revisar
cada fuente antes de activar una exclusión. No declarar finalizado el prompt maestro.


## Puebla · referencia parcial revisada el 10 de noviembre de 2026

Se añade Puebla (INEGI 21114): 14 municipios con alguna referencia parcial y
2,464 sin referencia; siguen cero municipios con validación legal automática.
La fuente es RES. 2021/49 en la Gaceta municipal, aprobada el 28-12-2021.
La ficha del Orden Jurídico Poblano ofrece texto consolidado, pero su descarga
respondió 503 en la revisión local; no se inventa un hash del PDF ni se declara
comprobada la publicación o vigencia actual de todas sus disposiciones.

Se conserva una advertencia explícita sobre la derogación de Octavo, Noveno y
Decimotercero: los horarios de esos apartados de 2020 no se activan como reglas.
La referencia distingue capacidad de carga menor/mayor de 3.5 t de peso bruto,
ventanas de maniobras con cruce de medianoche y días desconocidos, condiciones
de instalaciones, autorizaciones, límites C2 de Zona de Monumentos Históricos
y longitud de Centro Histórico. El caso exactamente 3.5 t queda sin resolver.
Ningún límite se extiende a todo el municipio ni al estado. No hay geometrías
legales, sentido, excepciones ni permisos individuales verificados para enrutar.

Se incorpora una sexta fuente al monitor: reforma municipal, página COREMUN y
ficha OJP. Vigilar documentos no descubre todos los acuerdos ni certifica vigencia.
Los datos y comparadores son sólo referencia; no se incorporan a Directions.
Fuente primaria y enlaces de contraste quedan versionados en national-references.
