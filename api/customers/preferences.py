"""
Customer preferences: one value per preference list (PREF_SHIRT, PREF_STARCH … in
masters/registry.py), kept on the customer as {"PREF_SHIRT": "boxed", …}.
Each new order copies them as text, e.g. "Shirt: Boxed / Starch: No starch".
"""
from masters.models import CommonMaster, CommonMasterType
from masters.registry import PREFERENCE_TYPES


def preference_lists():
    """The preference questions and their active options, in registry order."""
    names = dict(CommonMasterType.objects.filter(code__in=PREFERENCE_TYPES).values_list('code', 'name'))
    options = {}
    for value in CommonMaster.objects.filter(type__code__in=PREFERENCE_TYPES, is_active=True).select_related('type'):
        options.setdefault(value.type.code, []).append({'code': value.code, 'name': value.name})
    return [{'code': code, 'name': names[code], 'options': options.get(code, [])}
            for code in PREFERENCE_TYPES if code in names]


def preferences_text(preferences: dict) -> str:
    """{"PREF_SHIRT": "boxed"} → "Shirt: Boxed" (in registry order; unknown values are skipped)."""
    if not preferences:
        return ''
    rows = CommonMaster.objects.filter(type__code__in=list(preferences)).select_related('type')
    found = {(m.type.code, m.code): (m.type.name, m.name) for m in rows}
    parts = []
    for code in PREFERENCE_TYPES:
        pair = found.get((code, preferences.get(code)))
        if pair:
            parts.append(f'{pair[0]}: {pair[1]}')
    return ' / '.join(parts)
