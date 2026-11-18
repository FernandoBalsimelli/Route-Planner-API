"""Compare two reviewed Puebla annex PDFs; never amend routing or legal validity.

python scripts/compare-puebla-parking.py acta.pdf annex.pdf [output.json]
Requires pdfplumber 0.11.9. Changed PDF bytes stop with SOURCE_CHANGED.
"""
import collections
import hashlib
import importlib.util
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('acta_importer', ROOT / 'scripts/import-puebla-parking.py')
acta = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acta)
ANNEX_SHA = '1244f0f66db366f8b0f4612c32b64a6a857bc5d9f41c5117843448e95088a8a8'
ANNEX_URL = 'https://gaceta.pueblacapital.gob.mx/publicaciones/minutas/item/download/1010_de64725dc771e51346629bf7150420d4'


def normalized(value):
    # Only reviewed typographical normalization. Keep accents, numbers, suffixes,
    # words and punctuation other than whitespace around this hyphen unchanged.
    return re.sub(r'\s*-\s*', '-', acta.clean(value))


def hours(row):
    return [{key: value for key, value in item.items() if key != 'literal'} for item in row['schedules']]


def compare(acta_path, annex_path):
    baseline = json.loads((ROOT / 'data/mx/21114-parking-corridors.json').read_text())
    extracted_acta = acta.extract(acta_path)
    if extracted_acta != baseline:
        raise ValueError('BASELINE_CHANGED: review original extraction before comparing')
    if hashlib.sha256(annex_path.read_bytes()).hexdigest() != ANNEX_SHA:
        raise ValueError('SOURCE_CHANGED: review the published annex before comparing')
    published = []
    with acta.pdfplumber.open(annex_path) as pdf:
        assert len(pdf.pages) == 7
        for page_number, page in enumerate(pdf.pages, 1):
            tables = page.extract_tables()
            assert len(tables) == 1
            table = tables[0]
            assert table[0] == ['No.', 'Polígono', 'Corredor', 'Entre Calles', 'Horario L-V', 'Horario Sábado', 'Horario Domingo']
            for cells in table[1:]:
                assert len(cells) == 7 and all(cells)
                number = int(cells[0])
                assert number == len(published) + 1
                published.append({'sourceRow': number, 'polygon': acta.clean(cells[1]),
                    'corridor': acta.clean(cells[2]), 'betweenStreets': acta.clean(cells[3]),
                    'sourcePages': [page_number], 'schedules': [acta.schedule(cells[column], days, cells[column])
                        for column, days in [(4, [1, 2, 3, 4, 5]), (5, [6]), (6, [7])]]})
    assert len(published) == len(baseline['rows']) == 128
    rows, differences = [], []
    for before, after in zip(baseline['rows'], published):
        assert before['sourceRow'] == after['sourceRow']
        fields = []
        for field in ['polygon', 'corridor', 'betweenStreets']:
            if normalized(before[field]) != normalized(after[field]):
                raise ValueError(f'CONTENT_CHANGED: row {before["sourceRow"]} {field}')
            if before[field] != after[field]:
                fields.append({'field': field, 'acta': before[field], 'published': after[field]})
        if hours(before) != hours(after):
            raise ValueError(f'CONTENT_CHANGED: row {before["sourceRow"]} schedules')
        if fields:
            differences.append({'sourceRow': before['sourceRow'], 'fields': fields})
        rows.append({'sourceRow': before['sourceRow'], 'actaPages': before['sourcePages'], 'publishedPages': after['sourcePages']})
    counts = collections.Counter(row['polygon'] for row in published)
    assert sorted(counts.values()) == [4, 8, 19, 27, 29, 41]
    duplicates = collections.defaultdict(list)
    for row in published:
        duplicates[(row['polygon'], row['corridor'], row['betweenStreets'])].append(row['sourceRow'])
    groups = [group for group in duplicates.values() if len(group) > 1]
    assert groups == [[10, 15], [126, 128]]
    assert len(differences) == 29
    return {
        'schemaVersion': 1, 'municipalityId': '21114', 'reviewedAt': '2026-11-18',
        'status': 'selected_fields_match_after_normalization', 'routingEnforced': False,
        'legalValidityVerified': False,
        'scope': 'Contraste documental de 128 registros: número, etiqueta de polígono, corredor, extremos y horarios citados. No comprueba permisos, vigencia, sentidos o geometrías.',
        'normalization': ['Espacios repetidos y palabras partidas según el importador revisado del acta.', 'Espacios alrededor del guion ASCII; se conservan números, sufijos, acentos y las demás palabras.', 'Horarios comparados por días, estado y horas, sin contadores flotantes de página del acta.'],
        'documents': [
            {'id': 'acta', 'title': 'Acta C26/11 · anexo', 'url': acta.SOURCE, 'sha256': acta.EXPECTED_SHA, 'bytes': acta_path.stat().st_size, 'pages': list(acta.PAGES)},
            {'id': 'published', 'title': 'Adjunto de RES. 2025/148 · anexo', 'url': ANNEX_URL, 'sha256': ANNEX_SHA, 'bytes': annex_path.stat().st_size, 'pages': list(range(1, 8))}],
        'matchedRows': len(rows), 'extractedTextDifferenceCount': len(differences),
        'extractedTextDifferences': differences, 'duplicateGroups': groups,
        'polygonCounts': [{'label': key, 'count': value} for key, value in counts.items()],
        'rows': rows,
        'notices': [
            'Los campos citados coinciden tras la normalización descrita; no se afirma identidad literal de los PDF.',
            'Ambos anexos conservan ocho registros con etiqueta 5 y cuatro con etiqueta 6 para San Alejandro–Ortopedia. La ambigüedad no queda resuelta.',
            'Se conservan los 128 registros y sus duplicados; el registro 124 ocupa páginas 87/88 del acta y 7 del adjunto.',
            'Los horarios son de operación del estacionamiento, no ventanas de maniobras ni permisos de circulación.',
            'Publicación íntegra/consolidación, reformas posteriores, vigencia, permisos, sentidos y geometrías siguen pendientes; no se aplica al motor.']}


if __name__ == '__main__':
    if len(sys.argv) not in [3, 4]:
        raise SystemExit(__doc__)
    result = compare(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]))
    text = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if len(sys.argv) == 4:
        pathlib.Path(sys.argv[3]).write_text(text)
    else:
        print(text, end='')
