# Puebla: artículos 11–13 de maniobras, contraste seleccionado

Consulta y revisión: 18-11-2026. Municipio de Puebla, INEGI 21114.
No certifica vigencia, permiso o circulación y no modifica el cálculo.

Se descargaron otra vez los dos PDF oficiales con HTTP 200 y se inspeccionaron
visualmente sus páginas de evidencia:

| Fuente | Página seleccionada | Tamaño | SHA256 |
| --- | ---: | ---: | --- |
| [Acta C26/11](https://gaceta.pueblacapital.gob.mx/publicaciones/actas/cabildo/item/download/1132_565ca888d94782ae1c7b763eb389da28) | 70 de 167 | 2395402 bytes | 0917dc30ac70594a6e954243800bc5219d7ea3f2bc8017f7ea532b8ec510555c |
| [Reglas adjuntas a RES. 2025/148](https://gaceta.pueblacapital.gob.mx/publicaciones/minutas/item/download/1011_6e30ca00b3bfbe8310ef2f0b1afc1954) | 7 de 18 | 340080 bytes | 49da56a082baac634fd004f9a24e224dc0eab4d2a532d7ac2d6bc1949532006f |

El texto completo seleccionado de los artículos 11, 12 y 13 coincide después de
normalizar exclusivamente espacios y saltos de línea. No se altera puntuación,
palabras, números, magnitudes o comparadores y no se declara identidad literal
de los archivos. Los SHA256 de cada artículo normalizado y sus longitudes quedan
en data/mx/21114-loading-review.json, por separado de los hashes binarios.

El contraste corrobora los textos ya usados por las tres fichas del acta: capacidad
de carga hasta 3.5 t, capacidad superior a 3.5 t y permiso previo/duración. Se
conservan todos sus parámetros, ámbitos, restricciones de sustancias y horarios.
No se confunden capacidad de carga y peso bruto; no se trasladan estos umbrales a
los lineamientos de 2021 o al artículo 323 Sexdecies. Las diferencias de ámbito o
comparador entre fuentes requieren revisión, no una fusión automática.

## Reproducción

Con pdfplumber 0.11.9, como los importadores ya existentes:

```sh
python scripts/compare-puebla-loading.py acta.pdf reglas-adjuntas.pdf /tmp/review.json
cmp data/mx/21114-loading-review.json /tmp/review.json
```

El script no descarga ni publica normas. Exige ambas huellas y número de páginas;
extrae únicamente los límites exactos de los tres artículos. Cambiar bytes detiene
con SOURCE_CHANGED y cambiar texto seleccionado con CONTENT_CHANGED. Comprueba
las expresiones revisadas de horarios, comparadores, sustancias, permiso y tiempo,
y que las fichas existentes mantienen los parámetros antes de emitir el resultado.
Se reprodujo el JSON idéntico y se rechazó un PDF alterado.

## Consulta y límites

La API añade documentReview sólo a las tres fichas pue-rotativo-2025-hasta,
pue-rotativo-2025-mayor y pue-rotativo-2025-permiso. Las dos primeras apuntan al
artículo 11; la tercera, a 12–13. No cambia ninguna propiedad original de esas
fichas ni otras normas. La Web antigua ignora el campo y la nueva admite su ausencia.

La Web muestra «Contrastar esta referencia» plegado, con artículos, ámbito, método,
fecha y enlaces a acta 70/reglas 7. Valida municipio, estado sin aprobación legal,
HTTPS del dominio oficial, páginas y huellas antes de emitir esos enlaces. Un dato
inválido sólo bloquea el contraste nuevo y conserva la fuente original de la ficha.

Coincidencia textual no demuestra publicación íntegra/consolidación, cadena de
reformas posterior de 2026, vigencia hoy, autoridad competente actual, permiso
individual, días, excepciones, sustancias, acceso de descarga o geometría. No se
convierte en horario universal, autorización de circulación/estacionamiento ni
ruta segura/legal para camiones. Continúan 15 municipios parciales, cero completos,
y ningún parámetro municipal nuevo se aplica al motor o se transfiere a Google.

Ambas URL ya están en el monitor. No cambia su registro, frecuencia, límites,
cuotas o estatus legal; su comprobación de disponibilidad es independiente de
esta revisión textual parcial. Pruebas, PR, deployments, verificación pública y
rollback se documentan en ENGINEERING-STATUS.md de Web al cerrar el ciclo.
