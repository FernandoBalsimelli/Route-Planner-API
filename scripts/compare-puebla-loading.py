"""Compare selected loading provisions; do not generate routing permissions.

python scripts/compare-puebla-loading.py acta.pdf rules.pdf [output.json]
Requires pdfplumber 0.11.9. Unknown PDF bytes stop with SOURCE_CHANGED.
"""
import hashlib
import json
import pathlib
import re
import sys
import pdfplumber

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCES = [
    {'id': 'acta', 'title': 'Acta C26/11 · artículos 11–13', 'url': 'https://gaceta.pueblacapital.gob.mx/publicaciones/actas/cabildo/item/download/1132_565ca888d94782ae1c7b763eb389da28', 'sha256': '0917dc30ac70594a6e954243800bc5219d7ea3f2bc8017f7ea532b8ec510555c', 'pages': [70], 'documentPages': 167},
    {'id': 'published', 'title': 'Reglas adjuntas de RES. 2025/148 · artículos 11–13', 'url': 'https://gaceta.pueblacapital.gob.mx/publicaciones/minutas/item/download/1011_6e30ca00b3bfbe8310ef2f0b1afc1954', 'sha256': '49da56a082baac634fd004f9a24e224dc0eab4d2a532d7ac2d6bc1949532006f', 'pages': [7], 'documentPages': 18}]
EXPECTED = {11: 'a3a803e9821595d63c1377d0b0362d42fb325b2a11ad2800cf560bceda33df1c', 12: 'f878bcb8cb950ef750767e625fe92e06953f4963cb9599e6c279346b2a2b8f7d', 13: '26d549196e031a4d22c16b572e0527aa455de99df8ee52c983cfd75901e6a151'}


def normalize(value):
    return re.sub(r'\s+', ' ', value).strip()


def extract(path, source):
    if hashlib.sha256(path.read_bytes()).hexdigest() != source['sha256']:
        raise ValueError('SOURCE_CHANGED: review selected provisions again')
    with pdfplumber.open(path) as pdf:
        assert len(pdf.pages) == source['documentPages']
        text = pdf.pages[source['pages'][0] - 1].extract_text()
    result = {}
    for article, boundary in [(11, r'ARTÍCULO 12'), (12, r'ARTÍCULO 13'), (13, r'CAPÍTULO SEXTO')]:
        starts = list(re.finditer(r'ARTÍCULO ' + str(article) + r'\s*[.\-]', text))
        assert len(starts) == 1
        start = starts[0].start()
        ends = list(re.finditer(boundary, text[start + 1:]))
        assert len(ends) == 1
        end = ends[0].start() + start + 1
        result[article] = normalize(text[start:end])
        if hashlib.sha256(result[article].encode()).hexdigest() != EXPECTED[article]:
            raise ValueError(f'CONTENT_CHANGED: article {article}')
    return result


def compare(acta_path, rules_path):
    before, after = [extract(path, source) for path, source in zip([acta_path, rules_path], SOURCES)]
    assert before == after
    checks = {11: ['corredores del Programa', 'sustancias restringidas', '08:00 horas hasta las 20:59 horas', 'hasta 3.5 toneladas de capacidad de carga', '21:00 horas hasta las 07:00 horas', 'sobrepasen la capacidad de 3.5 toneladas'], 12: ['Previo al inicio', 'permiso correspondiente', 'Dirección de Movilidad Urbana Sustentable', 'Subsecretaría de Movilidad y Seguridad Vial'], 13: ['tiempo máximo de 20 minutos', 'tolerancia de 10 minutos', 'no contar con el permiso', 'infracción que corresponda']}
    for article, phrases in checks.items():
        assert all(phrase in before[article] for phrase in phrases)
    packages = json.loads((ROOT / 'data/mx/national-references.json').read_text())['packages']
    rules = next(package['rules'] for package in packages if package['municipalityIds'] == ['21114'])
    by_id = {rule['id']: rule for rule in rules}
    small = by_id['pue-rotativo-2025-hasta']; large = by_id['pue-rotativo-2025-mayor']; permit = by_id['pue-rotativo-2025-permiso']
    assert small['vehicleConditions'] == {'payloadCapacityT': {'lte': 3.5}} and (small['window']['start'], small['window']['end']) == ('08:00', '20:59')
    assert large['vehicleConditions'] == {'payloadCapacityT': {'gt': 3.5}} and (large['window']['start'], large['window']['end']) == ('21:00', '07:00') and large['endsNextDay'] is True
    assert permit['requiresPermit'] is True and (permit['operationMinutes'], permit['toleranceMinutes']) == (20, 10)
    assert all(by_id[key]['routingEnforced'] is False for key in [small['id'], large['id'], permit['id']])
    return {'schemaVersion': 1, 'municipalityId': '21114', 'reviewedAt': '2026-11-18',
        'status': 'selected_text_matches_after_whitespace', 'routingEnforced': False, 'legalValidityVerified': False,
        'scope': 'Sólo artículos 11–13 del estacionamiento rotativo: maniobras en corredores del Programa, sustancias restringidas, permiso previo y duración. No todo el municipio ni autorización de circulación.',
        'normalization': 'Sólo espacios y saltos de línea; números, palabras, signos y comparadores se conservan. No es identidad literal de archivos.',
        'documents': [{**source, 'bytes': path.stat().st_size} for source, path in zip(SOURCES, [acta_path, rules_path])],
        'articles': [{'number': number, 'normalizedSha256': EXPECTED[number], 'characters': len(before[number])} for number in [11, 12, 13]],
        'ruleArticles': {small['id']: [11], large['id']: [11], permit['id']: [12, 13]},
        'notices': ['La capacidad de carga citada no es peso bruto. Coincidir con un umbral no acredita permiso ni el acceso de descarga.', 'El permiso debe comprobarse antes de las maniobras; la coincidencia textual no verifica autoridad competente actual, condiciones individuales o excepciones.', 'No resuelve los ámbitos y comparadores de los lineamientos de 2021 ni la prohibición de estacionamiento de COREMUN.', 'Publicación íntegra/consolidación, reformas posteriores de 2026, vigencia actual, días, sustancias, zona y geometrías siguen por corroborar. No se aplica al cálculo.']}


if __name__ == '__main__':
    if len(sys.argv) not in [3, 4]:
        raise SystemExit(__doc__)
    value = compare(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]))
    text = json.dumps(value, ensure_ascii=False, indent=2) + '\n'
    if len(sys.argv) == 4:
        pathlib.Path(sys.argv[3]).write_text(text)
    else:
        print(text, end='')
