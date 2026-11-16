# Puebla: circulación, maniobras y estacionamiento

Consulta: 15 de noviembre de 2026. Municipio de Puebla, INEGI 21114.
Referencia parcial; no se aplica a Directions ni certifica autorización.

## Fuente y trazabilidad

Código Reglamentario para el Municipio de Puebla (COREMUN), PDF enlazado por
el visor oficial municipal:
https://gaceta.pueblacapital.gob.mx/media/k2/attachments/COREMUN.pdf

- La portada indica última reforma del 10-12-2025 y carácter informativo;
  remite al Periódico Oficial del Estado como fuente original.
- Archivo comprobado: 8,017,957 bytes; SHA-256
  `b8015929109522726f95e0d9278564592757bcd2a690abe0a326e898ae1c891f`.
- Se consultaron disposiciones seleccionadas, no los 1,166 folios íntegros.
  `evidence.reviewStatus = selected_provisions_only` y
  `officialGazetteStatus = not_fully_verified`.
- El hash identifica la versión consultada; no acredita vigencia legal. El
  monitor ya comprueba el PDF independientemente de su página HTML.

| Disposición | Actividad y página PDF | Límite de la incorporación |
| --- | --- | --- |
| Art. 298 I–III | Carga/descarga; pp. 158–159, enlace directo a 159 | Remite horas/zonas a la autoridad citada como SEMOVI. No se inventa una ventana universal ni un polígono. |
| Art. 299 I–III | Circulación y autorización del transporte; p. 160 | Conserva la distinción entre bienes particulares y mercancía comercial, requisitos del art. 296 y permisos adicionales. El perfil Camión no acredita autorización. |
| Art. 323 Quindecies | Maniobras en estacionamiento rotativo; p. 176 | Registra 30 minutos y desglose 20+10 de bahías; espacios autorizados si las bahías están ocupadas. Se lee con las demás prohibiciones, incluido Sexdecies. |
| Art. 323 Sexdecies | Prohibición de estacionamiento; p. 176 | Sólo perímetro/horario de operación. El artículo cita más de 3.5 t sin precisar aquí la magnitud; no se sustituye por peso bruto o capacidad de carga del perfil. |

Las anotaciones de reforma de los artículos consultados (2019 y 2022) proceden
del propio PDF; no son una nueva comprobación de cada ejemplar del Periódico
Oficial. Las referencias no contienen exclusiones geométricas, sentidos,
ventanas operativas ni comparadores de dimensiones/peso inferidos. El umbral
exactamente igual a 3.5 t no se interpreta automáticamente.

## Relación con los lineamientos de 2021

Se conservan las cinco referencias previas de RES. 2021/49, con su fuente,
excepciones y advertencias. No se reemplazan por el texto de 2020 que todavía
aparece en buscadores. La ficha OJP ofrece un adjunto con sufijo 31122021;
la descarga volvió a fallar al consultarla (502 en el lector web). No se declara
verificado su contenido íntegro ni el conjunto de reformas/actos posteriores.

Ficha: https://ojp.puebla.gob.mx/normatividad-municipal/item/2396-lineamientos-para-la-operacion-del-transporte-de-carga-y-distribucion-de-mercancias-en-el-municipio-de-puebla

La búsqueda dirigida en portales oficiales localizó publicaciones de 2026;
no constituye revisión exhaustiva de esos actos. Quedan pendientes acuerdos
específicos de horas/zonas, operación actual y geometría del estacionamiento
rotativo, autoridad competente actual, excepciones y permisos individuales.
Ninguna regla de estacionamiento se convierte en prohibición general de
circulación ni los 30 minutos en autorización incondicional de descarga.

## Interfaz y verificación

Cada referencia nueva publica actividad, jurisdicción, ámbito específico,
consulta y consolidación indicada, con enlace a su propia página de COREMUN.
La fecha general de revisión de la fuente de 2021 no se reutiliza como fecha
de las nuevas disposiciones. La información técnica de integridad se conserva
en la API y este documento; no añade parámetros al motor de rutas.

Las pruebas de API protegen límites/horarios desconocidos, procedencia y ausencia
de aplicación automática. Componente y navegador verifican actividad, fechas,
fuente por disposición, alcance y presentación en móvil/escritorio. Esas
pruebas de interfaz utilizan respuestas controladas; la consulta pública de
producción se informa por separado en ENGINEERING-STATUS.md de Web.

Se mantienen 15 municipios con referencia parcial, cero con validación legal
automática completa y las limitaciones de navegación Google/HGV existentes.
No se contratan servicios ni se modifica el esquema alojado.


## Acta C26/11 de 14-08-2025: ventanas de corredores

Se incorporan por separado tres referencias de los artículos 11–13 del texto
contenido en esa acta municipal, página PDF 70. Se descargó el documento oficial
real: HTTP 200, 2,395,402 bytes, SHA-256
`0917dc30ac70594a6e954243800bc5219d7ea3f2bc8017f7ea532b8ec510555c`.
La página 70 se extrajo y se revisó visualmente. La fecha del acto es 14-08-2025;
la fecha de creación técnica del archivo PDF no se usa como publicación legal.

Fuente: https://gaceta.pueblacapital.gob.mx/publicaciones/actas/cabildo/item/download/1132_565ca888d94782ae1c7b763eb389da28

| Referencia del acta | Capacidad de carga | Ventana citada | Condiciones pendientes |
| --- | --- | --- | --- |
| Art. 11 a | Hasta 3.5 t, inclusive | 08:00–20:59, America/Mexico_City | Sólo corredores del programa; excluye sustancias restringidas; permiso previo, días, ámbito y vigencia por comprobar. |
| Art. 11 b | Más de 3.5 t | 21:00–07:00, cruce de medianoche | Mismas condiciones; no acredita derecho de estacionamiento o circulación. |
| Arts. 12–13 | No se crea un comparador adicional | Permiso previo; 20 min y 10 de tolerancia | Autoridad indicada por la fuente; autorización individual y vigencia actual pendientes. |

La comparación inclusiva se añade sólo cuando la referencia declara `lte`.
Capacidad exactamente 3.5 t coincide con ese dato del artículo 11 a. Los
comparadores estrictos de RES. 2021/49 siguen sin resolver ese valor y COREMUN
Sexdecies sigue sin magnitud de tonelaje inferida. No se sustituye capacidad
por peso bruto; coincidir con un dato no otorga permiso.

Los días se conservan en `null`, no como todos los días. Se guardan la excepción
por sustancias, necesidad de permiso y `endsNextDay` de la ventana nocturna.
Ninguna ventana se aplica al ruteo. No se valida íntegramente el acta ni reformas
posteriores, publicación, reglas de entrada en vigor o polígonos. El anexo
contiene corredores y horarios de operación cuya extracción geométrica sigue
pendiente; no se confunde ese horario de estacionamiento con el de maniobras.

Se añade el PDF al mismo monitor oficial de Puebla, con evidencia independiente
y sin servicios o programación adicionales. Su primera descarga vigilada queda
sin revisión legal completa. La interfaz diferencia fecha del acto de fecha de
consolidación; los datos técnicos de integridad se conservan en la API.

Se mantienen 15 municipios con referencia parcial y cero con validación legal
automática completa. La consulta de RES. 2025/88 y el acta de agosto es evidencia
parcial de actos posteriores; falta reconstruir toda la cadena de publicación
y vigencia. No se afirma ausencia de modificaciones de 2026.

Compatibilidad: las fichas de acta usan `actEvidence`, mientras COREMUN conserva
`evidence`. Las pestañas de la Web anterior esperan consolidación en evidence;
no reciben ahí una fecha de acto diferente ni un valor ausente. La nueva Web
lee ambos tipos. Esto permite publicar en pasos y conservar rollback sin
obligar a cerrar pestañas ni inventar una fecha de consolidación del acta.
