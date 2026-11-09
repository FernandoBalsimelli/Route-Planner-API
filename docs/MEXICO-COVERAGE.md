# Cobertura municipal mexicana y navegación

Revisión: 2026-11-09. Exclusivamente Route Planner. El programa general sigue abierto.

## Qué existe realmente

| Capa | Cobertura de esta versión | Efecto en el cálculo |
| --- | --- | --- |
| Catálogo INEGI | 32 entidades y 2,478 municipios/demarcaciones recuperados del servicio oficial | Selección y consulta; no es una lista de calles permitidas |
| Monterrey, código 19039 | 38 renglones de red troncal y 19 renglones de horarios extraídos de los anexos 1–3 del reglamento oficial | Referencia consultable con página y sentido; no exclusión geométrica |
| Otros municipios | Identidad oficial y estado «reglas pendientes» | Ninguna validación legal añadida |
| Motor ORS / OSM | Parámetros de dimensiones y peso existentes | Aplica los datos disponibles del proveedor; cobertura incompleta |
| Navegación interna | GPS e indicaciones sobre la polilínea del cálculo, sin sustituirla | Conserva ese trazado; no acredita legalidad |

**Cero municipios tienen validación automática completa.** La respuesta de cada
ruta declara `regulatoryCoverage.status = not_verified`, sin fingir que se ha
identificado su cruce con municipios. Fuera de México no hay catálogo incorporado.
No se garantiza evitar infracciones, cierres, señalización nueva ni permisos locales.

## Fuentes y reproducción

API `scripts/sync-mx-catalog.py` consulta exclusivamente el servicio INEGI:
https://gaia.inegi.org.mx/wscatgeo/v2/mgee y `/mgem/{entidad}`.
Valida las 32 entidades, unicidad de códigos y presencia de Monterrey; guarda
fecha y URL. No descarga polígonos ni convierte límites geográficos en permisos.
Documentación: https://www.inegi.org.mx/servicios/catalogounico/.

API `scripts/import-monterrey.py RUTA_PDF` utiliza pdfplumber y las tablas de las
páginas 163–167 del PDF oficial consolidado:
https://www.monterrey.gob.mx/pdf/portaln/reglamentos/Reglamento%20de%20Transito%20y%20Vialidad%20del%20Municipio%20de%20Monterrey.pdf
El JSON conserva el SHA-256 del archivo, fecha de consulta, página y anexo;
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
3. Identificar jurisdicciones cruzadas por cada ruta y mostrar los huecos de
   cobertura; integrar exclusiones al motor solo con datos comprobados.
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
