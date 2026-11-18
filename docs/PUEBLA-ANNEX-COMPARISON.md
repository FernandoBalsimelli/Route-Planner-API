# Puebla: contraste reproducible de dos anexos

Revisión seleccionada: 18-11-2026. Municipio de Puebla, INEGI 21114.
Alcance: campos citados del estacionamiento rotativo. No aplica al motor ni valida
vigencia actual, permisos, sentidos o geometrías.

## Fuentes y hallazgo

Se descargaron de nuevo los dos PDF oficiales reales, con HTTP 200. Sus huellas
coinciden con las versiones ya identificadas. No se atribuye una fecha legal al
archivo por su fecha técnica o de rastreo.

| Fuente | Anexo contrastado | Tamaño | SHA256 |
| --- | --- | ---: | --- |
| [Acta C26/11](https://gaceta.pueblacapital.gob.mx/publicaciones/actas/cabildo/item/download/1132_565ca888d94782ae1c7b763eb389da28) | Páginas 80–88 de 167 | 2395402 bytes | 0917dc30ac70594a6e954243800bc5219d7ea3f2bc8017f7ea532b8ec510555c |
| [Adjunto de RES. 2025/148](https://gaceta.pueblacapital.gob.mx/publicaciones/minutas/item/download/1010_de64725dc771e51346629bf7150420d4) | Páginas 1–7 | 339465 bytes | 1244f0f66db366f8b0f4612c32b64a6a857bc5d9f41c5117843448e95088a8a8 |

Los 128 registros coinciden en número y orden, etiqueta de polígono, nombre del
corredor, extremos y horarios citados, después de la normalización descrita abajo.
No se afirma que los archivos o todos sus textos sean idénticos.

Hay 29 registros con diferencias en el texto extraído: 38 y 41 (espacios alrededor
del guion de Norte-Sur), y 42–68 (espacios alrededor del guion de Carmen-Huexotitla).
Se conservan ambos valores extraídos en el JSON de comparación. No se colapsan
acentos, números, sufijos A/B o palabras para obtener una coincidencia.

El adjunto también muestra ocho registros de Polígono 5 y cuatro de Polígono 6
para San Alejandro–Ortopedia. Se revisó visualmente la página 7 y la página 88
del acta. La ambigüedad persiste en ambas fuentes: no se renumeran ni se deduce
su resolución. Se conservan las repeticiones 10/15 y 126/128. El registro 124
corresponde a páginas 87/88 del acta y 7 del adjunto, sin duplicar el registro.

## Reproducción y controles

`scripts/compare-puebla-parking.py` y `data/mx/21114-parking-comparison.json`.
Usa el importador previo del acta, que debe reproducir íntegramente su snapshot.

```sh
python scripts/compare-puebla-parking.py acta.pdf anexo-publicado.pdf /tmp/comparison.json
cmp data/mx/21114-parking-comparison.json /tmp/comparison.json
```

Se requiere pdfplumber (misma dependencia del importador existente). Las huellas
de ambos PDF son obligatorias: cambiar bytes detiene con SOURCE_CHANGED. Un
cambio de campo comparado detiene con CONTENT_CHANGED. Los archivos no se descargan
ni se publican automáticamente. Se verifican cabeceras, números 1–128, páginas,
conteos, duplicados y cada horario por días/estado/hora. La comparación se reprodujo
idéntica y un PDF alterado fue rechazado.

La normalización reutiliza los espacios/palabras partidas revisados del importador
original y elimina sólo espacios alrededor del guion ASCII. Los horarios comparan
valores citados, excluyendo los contadores flotantes del acta, sin convertir «No
aplica» en autorización. Se inspeccionaron las siete páginas renderizadas del
adjunto y las páginas de evidencia crítica del acta. No se interpretan marcas
tipográficas como reformas ni se sustituye una validación legal por igualdad textual.

## Implementación y límites

La API añade annexComparison únicamente en la referencia de Puebla. Las 128 filas
originales siguen intactas y reciben publishedSourcePages para abrir la contraparte.
La respuesta omite los valores extraídos de las 29 diferencias y la tabla redundante
de correspondencia completa; quedan versionados en Git. La Web antigua ignora los
campos nuevos; la nueva admite su ausencia y mantiene su consulta anterior.

La Web muestra el contraste plegado y añade el enlace a la página del adjunto en
cada corredor, conservando los enlaces del acta, filtros, números y repeticiones.
Los enlaces de contraparte exigen HTTPS del dominio oficial, página validada,
conteo coincidente y estados sin aplicación al ruteo ni validación legal.

No cambia source.entryIntoForce.publicationDate del snapshot ni se certifica la
publicación íntegra/consolidación y cadena posterior de reformas, incluido 2026.
No se fusionan etiquetas 5/6 ni se asignan permisos o sanciones por equivalencia
textual. No hay nuevas geometrías, reglas HGV, timeRules o restricciones para
Google Maps; 15 municipios siguen parciales y cero plenamente verificados.

Las dos URL ya pertenecen al monitor existente; no se modifica el registro,
frecuencia, cuotas, límites ni reportes de disponibilidad. El estatus técnico
unreviewed del monitor no se cambia a aprobación legal por este contraste.
Pruebas, PR, producción, comprobaciones reales y rollback se registran al cerrar
el ciclo en docs/ENGINEERING-STATUS.md de Web.
