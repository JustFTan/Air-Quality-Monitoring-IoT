"""Aturan kualitas udara: level per parameter dan indeks ISPU PM2.5.

Ambang CO2, suhu, dan kelembapan bersifat indikatif (pedoman umum ruangan),
bukan standar resmi. ISPU PM2.5 mengikuti breakpoint ISPU (Permen LHK P.14/2020).
Semua ambang dikirim ke frontend lewat /api/config, jadi hanya ada satu sumber.
"""

LEVELS = [
    {"key": "good", "label": "Baik"},
    {"key": "moderate", "label": "Sedang"},
    {"key": "unhealthy", "label": "Tidak sehat"},
    {"key": "very_unhealthy", "label": "Sangat tidak sehat"},
    {"key": "hazardous", "label": "Berbahaya"},
]


def _r(lo, hi, level):
    return {"from": lo, "to": hi, "level": level}


# Aturan rentang: lo < nilai <= hi  (None = tak terbatas)
PARAMS = {
    "co2": {
        "label": "CO₂", "unit": "ppm", "digits": 0, "min_zero": True,
        "ranges": [_r(None, 800, 0), _r(800, 1000, 1), _r(1000, 1500, 2),
                   _r(1500, 2500, 3), _r(2500, None, 4)],
    },
    "pm25": {
        "label": "PM2.5", "unit": "µg/m³", "digits": 1, "min_zero": True,
        "ranges": [_r(None, 15.5, 0), _r(15.5, 55.4, 1), _r(55.4, 150.4, 2),
                   _r(150.4, 250.4, 3), _r(250.4, None, 4)],
    },
    "temp": {
        "label": "Suhu", "unit": "°C", "digits": 1, "min_zero": False,
        "labels": ["Nyaman", "Cukup nyaman", "Tidak nyaman", "Ekstrem"],
        "ranges": [_r(None, 20, 2), _r(20, 22, 1), _r(22, 28, 0),
                   _r(28, 30, 1), _r(30, 34, 2), _r(34, None, 3)],
    },
    "rh": {
        "label": "Kelembapan", "unit": "%RH", "digits": 1, "min_zero": True,
        "labels": ["Nyaman", "Cukup nyaman", "Tidak nyaman"],
        "ranges": [_r(None, 30, 2), _r(30, 40, 1), _r(40, 70, 0),
                   _r(70, 80, 1), _r(80, None, 2)],
    },
}

PARAM_KEYS = tuple(PARAMS)

# (batas bawah, batas atas, ISPU bawah, ISPU atas)
PM25_BP = [(0, 15.5, 0, 50), (15.5, 55.4, 50, 100), (55.4, 150.4, 100, 200),
           (150.4, 250.4, 200, 300), (250.4, 500, 300, 500)]


def level_of(param, v):
    if v is None:
        return None
    for r in PARAMS[param]["ranges"]:
        if (r["from"] is None or v > r["from"]) and (r["to"] is None or v <= r["to"]):
            return r["level"]
    return None


def label_of(param, level):
    if level is None:
        return "—"
    custom = PARAMS[param].get("labels")
    if custom and level < len(custom):
        return custom[level]
    return LEVELS[level]["label"]


def ispu_pm25(v):
    if v is None:
        return None
    v = max(0.0, v)
    for lo, hi, ilo, ihi in PM25_BP:
        if v <= hi:
            return round(ilo + (v - lo) * (ihi - ilo) / (hi - lo))
    return 500


def ispu_level(index):
    if index is None:
        return None
    for i, top in enumerate((50, 100, 200, 300)):
        if index <= top:
            return i
    return 4


def config():
    return {
        "levels": LEVELS,
        "params": PARAMS,
        "ispu": {"breakpoints": PM25_BP, "max": 500},
        "interval_s": 120,
    }
