# Puebla: anexo de corredores de estacionamiento

Consulta: 15-11-2026 (Chihuahua). Municipio de Puebla, INEGI 21114.
Referencia parcial de operación del estacionamiento rotativo. No es una red
troncal ni un conjunto de calles autorizadas para camiones.

## Fuente oficial y alcance

[Acta C26/11, 14-08-2025, Anexo Único, páginas 80–88](https://gaceta.pueblacapital.gob.mx/publicaciones/actas/cabildo/item/download/1132_565ca888d94782ae1c7b763eb389da28).
Descarga real HTTP 200: 2,395,402 bytes, 167 páginas; SHA-256
`0917dc30ac70594a6e954243800bc5219d7ea3f2bc8017f7ea532b8ec510555c`.
Recomprobación real del 16-11-2026: HTTP 200, mismo tamaño y hash; el
importador reprodujo el JSON versionado sin diferencias. Se conserva 15-11
como fecha de la revisión inicial. Se extrajo el anexo y se revisaron visualmente sus nueve páginas. La fecha
14-08-2025 corresponde al acto, no a la creación técnica del PDF ni a una
publicación legal comprobada. El Transitorio Primero, página 80, condiciona
la entrada en vigor a la publicación en Gaceta municipal: esa fecha concreta
no se ha verificado. Tampoco se ha reconstruido toda la vigencia posterior.

| Etiqueta literal del anexo | Registros |
| --- | ---: |
| Polígono 1 Centro Histórico | 41 |
| Polígono 2 Carmen- Huexotitla | 27 |
| Polígono 3 Chulavista – Volcanes | 19 |
| Polígono 4 Juárez – Santiago | 29 |
| Polígono 5 San Alejandro - Ortopedia | 8 |
| Polígono 6 San Alejandro - Ortopedia | 4 |

Se conservan 128 registros en el orden de la fuente, no 128 calles únicas.
Los grupos exactamente repetidos son 10/15 y 126/128. No se deduplican ni
se fusionan los polígonos 5/6: el anexo usa ambos números para San Alejandro.
El registro 124 continúa entre páginas 87 y 88; se conservan ambos enlaces.
Los nombres de polígonos son etiquetas documentales, no geometrías.

Los horarios citados de operación son lunes a viernes 08:00–22:00 y sábados
11:00–17:00. Los 41 registros de Centro Histórico citan domingo 11:00–17:00;
los otros 87 dicen «No aplica». Se usa America/Mexico_City. «No aplica» no se
interpreta como libre circulación o permiso de estacionamiento.

Estos horarios NO son las ventanas de carga/descarga de los artículos 11–13,
ni permiten ignorar COREMUN 323 Sexdecies. Las fichas de maniobras, permiso y
prohibición de estacionamiento conservan sus fuentes y ámbitos por separado.
No hay sentidos ni geometrías viales validados; geometry=null,
geometryStatus=not_validated y routingEnforced=false. No se añade ninguna
exclusión a Directions ni se transmiten restricciones HGV a Google Maps.
Siguen 15 municipios con referencia parcial y cero con validación legal completa.

## Extracción reproducible y controles

En Route-Planner-API: `scripts/import-puebla-parking.py` y
`data/mx/21114-parking-corridors.json`. Reproducción local con pdfplumber 0.11.9:

```sh
python scripts/import-puebla-parking.py documento-revisado.pdf /tmp/parking.json
cmp data/mx/21114-parking-corridors.json /tmp/parking.json
```

El importador detiene un hash distinto con SOURCE_CHANGED. No descarga ni
publica normas automáticamente. Valida páginas, cabeceras, secuencia 1–128,
conteos, horarios, duplicados y la continuación del registro 124. Se normalizan
espacios y dos palabras partidas visibles (Septiembre y Compostela). Los
contadores flotantes Calibri que se superponen a horarios se separan del texto
de celdas Sitka para leerlo; las celdas originales permanecen en rawCells.
Los números recortados dentro de la celda del polígono se extraen por posición
sólo para esta versión revisada. No se eliminan sufijos A/B de nombres de calles.

La API publica parkingCorridorReference únicamente en 21114, con procedencia,
horarios y páginas por registro. Omite rawCells/rawPolygonContinuation para
reducir transferencia; la evidencia original queda versionada. No modifica
trunkSegments/timeRules ni los contratos de otros municipios. La Web anterior
ignora el campo adicional y la nueva Web admite su ausencia.

La consulta se despliega bajo demanda en Guía camión → cobertura municipal →
Puebla. Filtra por calle, cruce y etiqueta exacta de polígono, tolerando acentos;
conserva repeticiones y orden, sin solicitudes nuevas por pulsación. Cada
resultado muestra el número original, horarios citados y enlaces a sus páginas.

## Verificación y pendientes

Se comprobó la reproducción idéntica contra el PDF real. Las pruebas API
protegen trazabilidad, 128 registros, horarios/estados desconocidos, duplicados,
páginas partidas, ausencia de geometría y ausencia en otros municipios. Las
pruebas Web protegen búsqueda, filtros, horarios inválidos, detalle plegado y
enlaces; el caso de navegador usa respuestas controladas en 390 y 1280 píxeles.
Resultados de CI y comprobación pública real después del despliegue constan en
ENGINEERING-STATUS.md de Web. Un fixture no acredita navegación real Android.

Pendientes: fecha efectiva de publicación, cadena completa de reformas y actos
posteriores de 2026, resolución oficial de la discrepancia 5/6, ámbitos y sentidos,
geometrías verificadas, excepciones y permisos individuales. El PDF ya pertenece
al monitor de Puebla; no se crea otro servicio, cuota ni programación. El monitor
detecta cambios técnicos por documento, no los aprueba como reformas. Toda
actualización del anexo exige nueva revisión y cambio versionado del hash.
