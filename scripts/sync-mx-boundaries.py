"""Build a compact municipal boundary index from INEGI's official GeoJSON service.

The result is for identifying jurisdictions touched by a route. It is deliberately
separate from traffic permissions: geographic boundaries do not make a road legal.
"""
from __future__ import annotations

import concurrent.futures
import datetime
import json
import math
import pathlib
import time
import urllib.error
import urllib.request

BASE = "https://gaia.inegi.org.mx/wscatgeo/v2/geo/mgem/"
CATALOG = pathlib.Path("data/mx/municipalities.json")
OUTPUT = pathlib.Path("data/mx/municipal-boundaries.json")
TOLERANCE = 0.0005


def fetch(state: str) -> dict:
    error = None
    for attempt in range(6):
        try:
            request = urllib.request.Request(BASE + state, headers={"User-Agent": "Route-Planner-boundary-sync/1.0"})
            with urllib.request.urlopen(request, timeout=90) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as current:
            error = current
            time.sleep(min(2 ** attempt, 20))
    raise RuntimeError(f"INEGI boundary download failed for state {state}: {error}")


def distance_to_line(point: list[float], start: list[float], end: list[float]) -> float:
    dx, dy = end[0] - start[0], end[1] - start[1]
    if dx == 0 and dy == 0:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    return abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / math.hypot(dx, dy)


def rdp(points: list[list[float]], tolerance: float) -> list[list[float]]:
    if len(points) <= 2:
        return points
    distances = [distance_to_line(point, points[0], points[-1]) for point in points[1:-1]]
    maximum = max(distances, default=0)
    if maximum <= tolerance:
        return [points[0], points[-1]]
    index = distances.index(maximum) + 1
    return rdp(points[: index + 1], tolerance)[:-1] + rdp(points[index:], tolerance)


def simplify_ring(raw: list[list[float]]) -> list[list[float]]:
    points = raw[:-1] if raw and raw[0] == raw[-1] else raw[:]
    if len(points) < 4:
        return [[round(x, 5), round(y, 5)] for x, y in raw]
    anchor = max(range(1, len(points)), key=lambda index: (points[index][0] - points[0][0]) ** 2 + (points[index][1] - points[0][1]) ** 2)
    closed = points + [points[0]]
    simplified = rdp(closed[: anchor + 1], TOLERANCE)[:-1] + rdp(closed[anchor:], TOLERANCE)
    simplified = [[round(x, 5), round(y, 5)] for x, y in simplified]
    if simplified[0] != simplified[-1]:
        simplified.append(simplified[0])
    return simplified if len(simplified) >= 4 else [[round(x, 5), round(y, 5)] for x, y in raw]


def normalize_geometry(geometry: dict) -> list[list[list[list[float]]]]:
    coordinates = geometry["coordinates"]
    polygons = [coordinates] if geometry["type"] == "Polygon" else coordinates
    return [[simplify_ring(ring) for ring in polygon] for polygon in polygons]


def encode_number(value: int) -> str:
    value = ~(value << 1) if value < 0 else value << 1
    result = ""
    while value >= 0x20:
        result += chr((0x20 | (value & 0x1F)) + 63)
        value >>= 5
    return result + chr(value + 63)


def encode_ring(ring: list[list[float]]) -> str:
    values = ""
    previous_x = previous_y = 0
    for lng, lat in ring:
        x, y = round(lng * 100000), round(lat * 100000)
        values += encode_number(x - previous_x) + encode_number(y - previous_y)
        previous_x, previous_y = x, y
    return values


def compact(feature: dict) -> dict:
    polygons = normalize_geometry(feature["geometry"])
    points = [point for polygon in polygons for ring in polygon for point in ring]
    properties = feature["properties"]
    return {
        "id": properties["cvegeo"],
        "state": properties["cve_ent"],
        "name": properties["nomgeo"],
        "bbox": [round(min(p[0] for p in points) * 100000), round(min(p[1] for p in points) * 100000), round(max(p[0] for p in points) * 100000), round(max(p[1] for p in points) * 100000)],
        "polygons": [[encode_ring(ring) for ring in polygon] for polygon in polygons],
    }


def main() -> None:
    catalog = json.loads(CATALOG.read_text())
    states = [state["id"] for state in catalog["states"]]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        documents = list(pool.map(fetch, states))
    source_names = sorted({document["metadatos"]["Fuente_informacion_vectorial"] for document in documents})
    boundaries = sorted((compact(feature) for document in documents for feature in document["features"]), key=lambda row: row["id"])
    catalog_ids = {row["id"] for row in catalog["municipalities"]}
    boundary_ids = {row["id"] for row in boundaries}
    if len(boundaries) != len(boundary_ids) or boundary_ids != catalog_ids:
        raise RuntimeError(f"boundary/catalog mismatch: boundaries={len(boundary_ids)} catalog={len(catalog_ids)}")
    data = {
        "source": BASE,
        "sourceDescription": source_names,
        "retrievedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "toleranceDegrees": TOLERANCE,
        "coordinateScale": 100000,
        "use": "jurisdiction_identification_only",
        "municipalities": boundaries,
    }
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    points = sum(len(simplify_ring(ring)) for document in documents for feature in document["features"] for polygon in ([feature["geometry"]["coordinates"]] if feature["geometry"]["type"] == "Polygon" else feature["geometry"]["coordinates"]) for ring in polygon)
    print(json.dumps({"municipalities": len(boundaries), "points": points, "bytes": OUTPUT.stat().st_size, "sources": source_names}))


if __name__ == "__main__":
    main()
