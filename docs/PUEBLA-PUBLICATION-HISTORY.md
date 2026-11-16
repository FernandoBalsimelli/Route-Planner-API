# Puebla: publicación de la reforma y fechas históricas de sanciones

Revisión seleccionada: 16-11-2026. Municipio de Puebla, INEGI 21114.
No certifica vigencia actual, permisos o geometrías y no se aplica al ruteo.

## Hallazgo y fuentes

Se descargaron cuatro páginas oficiales reales, todas HTTP 200. Los tomos
municipales identifican sus fechas y enlazan las resoluciones correspondientes.
RES. 2025/162, considerando X, también declara que RES. 2025/148 se publicó
el mismo 14 de agosto de 2025. No se usa la fecha de indexación del buscador,
la de creación del PDF ni la de firma del dictamen en comisión (6 de agosto)
como fecha de aprobación/publicación de la reforma.

| Documento | Fecha documentada | Apartados contrastados |
| --- | --- | --- |
| RES. 2025/148 | Aprobada 14-08-2025 | Certificación final; resolutivos segundo y cuarto; transitorio único |
| Tomo LXXXIII, número 1 | 14-08-2025 | Encabezado del tomo y enlace a RES. 2025/148 |
| RES. 2025/162 | Aprobada 18-09-2025 | Certificación; considerandos X/XII y resolutivo primero |
| Tomo LXXXIV, número 1 | 18-09-2025 | Encabezado y enlace a RES. 2025/162 |

Las URL completas, tamaños, hashes SHA-256 y fecha de consulta quedan en
`data/mx/21114-parking-publications.json` de API. Son huellas técnicas del HTML
consultado, que incluye elementos variables del sitio; no acreditan reformas
por sí solas. No se versiona el HTML completo ni credenciales.

La fecha inicial citada de sanciones del Polígono 5 San Alejandro–Ortopedia era
01-10-2025 en el transitorio de RES. 2025/148. RES. 2025/162 la sustituyó por
01-11-2025. La interfaz marca la primera como sustituida y la segunda como fecha
histórica modificada, sin afirmar vigencia hoy. Ninguna se extiende a los otros
polígonos ni se interpreta como permiso de circulación, estacionamiento o descarga.
No se transforma esa fecha de sanciones en horario diario del estacionamiento.

## Lo comprobado y sus límites

Se corrobora la publicación histórica de la **reforma RES. 2025/148**, no la
publicación íntegra/consolidación de todas las reglas impresas en el acta ni
cada artículo 11–13 o cada corredor del anexo. Por ello el snapshot reproducible
`21114-parking-corridors.json` permanece intacto: la fecha de publicación íntegra
en su `source.entryIntoForce` sigue null. No se le asigna la fecha de otra
resolución. La API añade `publicationReview` como revisión documental separada,
con su ámbito, fecha y fuentes, manteniendo `publicationAndCurrentValidity`
sin verificación integral y todas las geometrías sin validar.

No se ha revisado exhaustivamente la cadena posterior, incluidos actos de 2026.
Las búsquedas dirigidas de resoluciones no demuestran ausencia de otros cambios.
No se resuelve la discrepancia 5/6 del anexo ni se asignan automáticamente fechas
de sanción a registros con esas etiquetas. No se cambia el perfil HGV, Directions,
timeRules, orden de entregas, enlaces Google ni número de municipios cubiertos.
Siguen 15 referencias municipales parciales y cero con validación legal completa.

## Implementación y seguimiento

API publica la revisión sólo junto al anexo de Puebla. La Web añade «Publicación
y cambios revisados» bajo demanda: distingue aprobación, publicación y fecha de
sanciones por resolución, con enlaces propios al acto y su tomo. La Web antigua
ignora el campo nuevo; la nueva conserva el aviso previo si la API no lo incluye.

Se añaden las cuatro URL al monitor existente de Puebla, con evidencia por
página. No se cambia frecuencia, proveedor ni cuota ni se crean servicios.
Un fallo de descarga no invalida retrospectivamente la evidencia histórica;
un cambio de hash exige revisión y no actualiza reglas automáticamente.
La programación puede demorarse y no constituye vigilancia en tiempo real.

Pruebas: API protege fechas, sustitución, ámbitos, procedencia, pertenencia al
monitor y preservación del snapshot, 128 registros y ausencia de ruteo. Web
verifica presencia/ausencia del campo y enlaces sin mezclar vigencia con fechas;
el caso de navegador se ejecuta en 390×844 y 1280×900 con respuestas controladas.
Resultados, commits, despliegues, comprobación pública real, rollback y siguiente
prioridad quedan en ENGINEERING-STATUS.md de Web al cerrar el ciclo.
