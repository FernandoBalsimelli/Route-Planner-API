"""Extract the cited parking annex; never generate HGV permissions or geometry.

Usage: python scripts/import-puebla-parking.py reviewed.pdf [output.json]
Requires pdfplumber (already used by import-monterrey.py). The version/hash gate
intentionally stops a changed government PDF until its annex is reviewed again.
"""
import collections
import hashlib
import json
import pathlib
import re
import sys

import pdfplumber

EXPECTED_SHA = '0917dc30ac70594a6e954243800bc5219d7ea3f2bc8017f7ea532b8ec510555c'
SOURCE = 'https://gaceta.pueblacapital.gob.mx/publicaciones/actas/cabildo/item/download/1132_565ca888d94782ae1c7b763eb389da28'
PAGES = range(80, 89)


def clean(value):
    # Two words are visibly split inside cells in this reviewed PDF. Raw cells
    # remain available. Do not infer other street names or remove suffixes A/B.
    value = re.sub(r'Septiemb\s+re', 'Septiembre', value or '')
    value = re.sub(r'Composte\s+la', 'Compostela', value)
    value = re.sub(r'\s+', ' ', value).strip()
    return re.sub(r'-\s+(?=Oriente|Poniente)', '-', value)


def schedule(value, days, extracted):
    literal = clean(value)
    # The PDF overlays floating Calibri page counters (A, 2/7...) on some
    # Sitka schedule cells. Preserve the raw literal; parse the reviewed cell
    # text after separating those counters by font and normalizing colon spacing.
    parsed = clean(extracted)
    parsed = re.sub(r'(\d{2}):\s+(\d{2})', r'\1:\2', parsed)
    if parsed == 'No aplica':
        return {'days': days, 'status': 'not_applicable_in_source', 'literal': literal}
    match = re.fullmatch(r'(\d{2}:\d{2}) a (\d{2}:\d{2}) hrs', parsed)
    if not match:
        raise ValueError(f'Unreviewed schedule: {literal!r}')
    start, end = match.groups()
    assert start in ['08:00', '11:00'] and end in ['22:00', '17:00']
    return {'days': days, 'status': 'hours_cited', 'start': start, 'end': end, 'literal': literal}


def extract(path):
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != EXPECTED_SHA:
        raise ValueError('SOURCE_CHANGED: review the new PDF before importing')
    rows = []
    with pdfplumber.open(path) as pdf:
        assert len(pdf.pages) == 167
        for number in PAGES:
            page = pdf.pages[number - 1]
            tables = page.find_tables()
            assert len(tables) == 1
            table = tables[0]
            raw = table.extract()
            assert 'Corredor' in clean(raw[0][2]) and 'Domingo' in clean(raw[0][6])
            for index, cells in enumerate(table.rows[1:], 1):
                values = raw[index]
                if not values[2]:
                    # The last polygon label continues onto the next page.
                    fragment = clean(values[1])
                    if fragment:
                        assert number == 88 and rows[-1]['sourceRow'] == 124
                        assert fragment == 'Alejandro - Ortopedia'
                        rows[-1]['polygon'] = clean(rows[-1]['polygon'] + ' ' + fragment)
                        rows[-1]['sourcePages'].append(number)
                        rows[-1]['rawPolygonContinuation'] = values[1]
                    else:
                        assert all(not value or value == 'A' for value in values)
                    continue
                polygon_cell = page.crop(cells.cells[1])
                words = polygon_cell.extract_words()
                # Clipped row numbers are positioned just inside the polygon
                # cell by the PDF. Keep them separate using this version's x.
                index_parts = [word['text'] for word in words if word['x0'] < 142]
                assert index_parts and all(part.isdigit() for part in index_parts)
                source_row = int(''.join(index_parts))
                assert source_row == len(rows) + 1
                polygon = polygon_cell.filter(lambda obj: obj.get('object_type') != 'char' or obj['x0'] >= 142).extract_text()
                polygon = clean(polygon)
                assert re.match(r'^Polígono [1-6] ', polygon)
                row = {
                    'sourceRow': source_row, 'polygon': polygon,
                    'corridor': clean(values[2]), 'betweenStreets': clean(values[3]),
                    'sourcePages': [number], 'rawCells': values[:7],
                    'schedules': [schedule(values[column], days, page.crop(cells.cells[column]).filter(lambda obj: obj.get('object_type') != 'char' or not obj.get('fontname', '').endswith('Calibri')).extract_text()) for column, days in [(4, [1, 2, 3, 4, 5]), (5, [6]), (6, [7])]],
                    'geometry': None, 'geometryStatus': 'not_validated',
                    'directionStatus': 'not_specified_in_annex', 'routingEnforced': False,
                }
                assert row['betweenStreets']
                rows.append(row)
    assert len(rows) == 128
    counts = collections.Counter(row['polygon'] for row in rows)
    assert sorted(counts.values()) == [4, 8, 19, 27, 29, 41]
    assert len({row['polygon'] for row in rows}) == 6
    assert sum(row['schedules'][2]['status'] == 'hours_cited' for row in rows) == 41
    assert rows[123]['sourcePages'] == [87, 88]
    repeated = collections.defaultdict(list)
    for row in rows:
        repeated[(row['polygon'], row['corridor'], row['betweenStreets'])].append(row['sourceRow'])
    duplicate_groups = [group for group in repeated.values() if len(group) > 1]
    assert [126, 128] in duplicate_groups
    return {
        'schemaVersion': 1, 'municipalityId': '21114', 'activity': 'parking_operation',
        'timezone': 'America/Mexico_City', 'status': 'reference_only', 'routingEnforced': False,
        'source': {'url': SOURCE, 'title': 'Acta C26/11 · Anexo Único del estacionamiento rotativo',
                   'sha256': actual, 'approvedAt': '2025-08-14', 'consultedAt': '2026-11-15',
                   'pages': list(PAGES), 'reviewStatus': 'selected_annex_only',
                   'publicationAndCurrentValidity': 'not_fully_verified',
                   'entryIntoForce': {'criterion': 'municipal_gazette_publication', 'sourcePage': 80, 'publicationDate': None, 'status': 'publication_date_not_verified'}},
        'notices': [
            'Son horarios citados de operación del estacionamiento rotativo; no autorizan circulación ni sustituyen las ventanas de maniobras y sus permisos.',
            'La publicación, entrada en vigor y vigencia posterior del anexo no están verificadas íntegramente. No se aplica al trazado.',
            'La fuente usa Polígono 5 y Polígono 6 para San Alejandro - Ortopedia. Se conservan ambos; la discrepancia requiere revisión.',
            'Se conservan los registros repetidos del anexo. “No aplica” en domingo no significa circulación libre ni permiso para estacionarse.',
            'Los nombres y extremos no son geometrías verificadas ni indican un sentido de circulación autorizado.',
        ],
        'duplicateGroups': duplicate_groups, 'rows': rows,
    }


if __name__ == '__main__':
    data = extract(pathlib.Path(sys.argv[1]))
    output = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else 'data/mx/21114-parking-corridors.json')
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'rows': len(data['rows']), 'polygonsAsCited': len({r['polygon'] for r in data['rows']}), 'duplicateGroups': data['duplicateGroups'], 'routingEnforced': False}))
