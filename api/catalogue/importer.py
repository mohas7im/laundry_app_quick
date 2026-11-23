"""
Price list import from CSV (build pack data/price-list-default.csv):

    section,product,price_aed,express_price_aed,pieces,active,online
    Dry Cleaning,Abaya,13.65,27.30,1,Y,

- each section is a service; "online" sections (Dryclean online …) are the same services
  in the Online price list, so they are mapped onto the matching normal section;
- each product is an item (shared by every service); pieces = tags per item;
- rows with active = N are skipped; the `online` column is not used.

Two steps: a preview (what would be created and changed, with warnings), then the
import with the section mapping the person confirmed. Prices go through set_price(),
so every change is in the price history.
"""
import csv
import io
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from django.db import transaction

from masters.models import CommonMaster
from masters.registry import ITEM_CATEGORY, PRICING_TYPE
from .models import Item, PriceChange, PriceList, Service
from .prices import CHANGED, NEW, SAME, set_price

MAIN, ONLINE = 'main', 'online'
REQUIRED = ('section', 'product', 'price_aed')
MAX_ROWS = 5000


class ImportError_(Exception):
    """The file can't be read at all (wrong columns, not a CSV)."""


@dataclass
class Row:
    line: int
    section: str
    product: str
    price: Decimal
    express_price: Decimal | None
    pieces: int


@dataclass
class Plan:
    sections: list = field(default_factory=list)  # [{section, rows, service, price_list}]
    rows: list = field(default_factory=list)       # [Row] to import
    errors: list = field(default_factory=list)     # [{line, message}]
    warnings: list = field(default_factory=list)   # [{line, message}]
    skipped_inactive: int = 0


def _money(value, line, column, errors, required=True):
    value = (value or '').strip()
    if not value:
        if required:
            errors.append({'line': line, 'message': f'{column} is empty.'})
        return None
    try:
        amount = Decimal(value)
    except InvalidOperation:
        errors.append({'line': line, 'message': f'{column} "{value}" is not a number.'})
        return None
    if amount < 0:
        errors.append({'line': line, 'message': f'{column} can\'t be negative.'})
        return None
    return amount.quantize(Decimal('0.01'))


def read(text: str) -> Plan:
    """Read the CSV; rows with problems become errors, repeated rows warnings."""
    text = text.lstrip('﻿')
    reader = csv.DictReader(io.StringIO(text))
    columns = [(c or '').strip().lower() for c in (reader.fieldnames or [])]
    missing = [c for c in REQUIRED if c not in columns]
    if missing:
        raise ImportError_(f'The file needs the columns {", ".join(REQUIRED)} (missing: {", ".join(missing)}).')
    reader.fieldnames = columns

    plan, seen = Plan(), {}
    for line, raw in enumerate(reader, start=2):  # line 1 is the header
        if line > MAX_ROWS + 1:
            raise ImportError_(f'The file has more than {MAX_ROWS} rows.')
        get = lambda key: (raw.get(key) or '').strip()  # noqa: E731
        section, product = get('section'), get('product')
        if not section and not product:
            continue  # blank line
        if not section or not product:
            plan.errors.append({'line': line, 'message': 'Section and product are both needed.'})
            continue
        if get('active').upper() in ('N', 'NO', 'FALSE', '0'):
            plan.skipped_inactive += 1
            continue
        price = _money(get('price_aed'), line, 'price_aed', plan.errors)
        express = _money(get('express_price_aed'), line, 'express_price_aed', plan.errors, required=False)
        pieces_text = get('pieces') or '1'
        if not pieces_text.isdigit() or not 1 <= int(pieces_text) <= 20:
            plan.errors.append({'line': line, 'message': f'pieces "{pieces_text}" should be 1 to 20.'})
            continue
        if price is None:
            continue
        key = (section.lower(), product.lower())
        if key in seen:
            plan.warnings.append({'line': line, 'message': f'{product} is listed twice in {section} '
                                                           f'(line {seen[key]}); the first one is used.'})
            continue
        seen[key] = line
        plan.rows.append(Row(line, section, product[:80], price, express, int(pieces_text)))
    return plan


def _tokens(name):
    return [t for t in re.split(r'[^a-z]+', name.lower()) if len(t) > 1 and t != 'online']


def _similar(a, b):
    """Words sharing a 3-letter start: "dryclean" ~ "dry", "ironing" ~ "ironed"."""
    return sum(1 for x in _tokens(a) for y in _tokens(b) if x[:3] == y[:3])


def suggest_sections(plan: Plan):
    """Each section in file order, with its suggested service and price list."""
    order, counts = [], {}
    for row in plan.rows:
        if row.section not in counts:
            order.append(row.section)
        counts[row.section] = counts.get(row.section, 0) + 1
    services = {s.name.lower(): s.name for s in Service.objects.all()}
    normal = [s for s in order if 'online' not in s.lower()]
    suggestions = []
    for section in order:
        online = 'online' in section.lower()
        target = section
        if online:
            best = max(normal, key=lambda n: _similar(section, n), default=None)
            if best and _similar(section, best) > 0:
                target = best
        target = services.get(target.lower(), target)  # an existing service keeps its spelling
        suggestions.append({'section': section, 'rows': counts[section], 'service': target,
                            'price_list': ONLINE if online else MAIN,
                            'service_exists': target.lower() in services})
    return suggestions


def _mapping(plan, sections):
    """{section: (service name, MAIN | ONLINE)} from the person's choices (or the suggestions)."""
    chosen = {s['section']: s for s in (sections or [])}
    result = {}
    for suggestion in suggest_sections(plan):
        pick = chosen.get(suggestion['section'], suggestion)
        name = (pick.get('service') or '').strip()[:80]
        if not name:
            plan.errors.append({'line': None, 'message': f'Choose a service for the section {suggestion["section"]}.'})
            continue
        result[suggestion['section']] = (name, ONLINE if pick.get('price_list') == ONLINE else MAIN)
    return result


def preview_or_import(text, *, sections=None, main_list=None, online_list_name='Online', user=None, commit=False):
    """
    The preview (commit=False) or the import itself. main_list: the price list for normal
    sections (default: the default price list). Returns
    {sections, summary, errors, warnings, imported}.
    """
    plan = read(text)
    mapping = _mapping(plan, sections)
    online_list_name = (online_list_name or 'Online').strip()[:80]

    # the same item in one service of one price list from two sections (e.g. two online sections → one service)
    taken = {}
    rows = []
    for row in plan.rows:
        if row.section not in mapping:
            continue
        service, target = mapping[row.section]
        key = (service.lower(), target, row.product.lower())
        if key in taken:
            plan.warnings.append({'line': row.line, 'message': f'{row.product} in {service} is already priced '
                                                               f'from line {taken[key]}; this row is skipped.'})
            continue
        taken[key] = row.line
        rows.append((row, service, target))

    services = {s.name.lower(): s for s in Service.objects.all()}
    items = {i.name.lower(): i for i in Item.objects.all()}
    main = main_list or PriceList.objects.filter(is_default=True).first()
    online = PriceList.objects.filter(name__iexact=online_list_name).first()
    if online is not None and main is not None and online.pk == main.pk:
        plan.errors.append({'line': None, 'message': f'"{online_list_name}" is the default price list; '
                                                     'choose another name for online prices.'})

    pieces = {}
    for row, _, _ in rows:
        pieces[row.product.lower()] = max(pieces.get(row.product.lower(), 1), row.pieces)
    new_services = sorted({s for _, s, _ in rows if s.lower() not in services})
    new_items = sorted({r.product for r, _, _ in rows if r.product.lower() not in items}, key=str.lower)
    pieces_changed = sum(1 for name, n in pieces.items() if name in items and items[name].pieces != n)

    summary = {
        'rows': len(plan.rows), 'skipped_inactive': plan.skipped_inactive,
        'new_services': new_services, 'new_items': len(new_items), 'items_pieces_changed': pieces_changed,
        'main_price_list': main.name if main else 'Walk-in (new, default)',
        'online_price_list': online_list_name + ('' if online else ' (new)'),
        'prices': {MAIN: {NEW: 0, CHANGED: 0, SAME: 0}, ONLINE: {NEW: 0, CHANGED: 0, SAME: 0}},
    }

    if not commit or plan.errors:
        # count what would change, without writing
        lists = {MAIN: main, ONLINE: online}
        for row, service_name, target in rows:
            service, item, price_list = services.get(service_name.lower()), items.get(row.product.lower()), lists[target]
            current = None
            if service and item and price_list:
                current = price_list.prices.filter(item=item, service=service).first()
            if current is None:
                outcome = NEW
            elif current.price == row.price and current.express_price == row.express_price:
                outcome = SAME
            else:
                outcome = CHANGED
            summary['prices'][target][outcome] += 1
        return {'sections': suggest_sections(plan), 'summary': summary, 'errors': plan.errors,
                'warnings': plan.warnings, 'imported': False}

    with transaction.atomic():
        if main is None:
            main = PriceList.objects.create(name='Walk-in', is_default=True)
        if online is None:
            online = PriceList.objects.create(name=online_list_name)
        lists = {MAIN: main, ONLINE: online}
        other = CommonMaster.get(ITEM_CATEGORY, 'other')
        unit = CommonMaster.get(PRICING_TYPE, Item.PricingType.UNIT)
        next_sort = (Service.objects.order_by('-sort_order').values_list('sort_order', flat=True).first() or 0)
        for name in [s for _, s, _ in rows]:
            if name.lower() not in services:
                next_sort += 1
                services[name.lower()] = Service.objects.create(name=name, sort_order=next_sort)
        for row, _, _ in rows:
            key = row.product.lower()
            if key not in items:
                items[key] = Item.objects.create(name=row.product, category=other, pricing_type=unit,
                                                 pieces=pieces[key])
            elif items[key].pieces != pieces[key]:
                items[key].pieces = pieces[key]
                items[key].save(update_fields=['pieces'])
        for row, service_name, target in rows:
            service, item, price_list = services[service_name.lower()], items[row.product.lower()], lists[target]
            current = price_list.prices.filter(item=item, service=service).first()
            outcome = set_price(price_list, item, service, price=row.price, express_price=row.express_price,
                                min_price=current.min_price if current else None,
                                extra_days=current.extra_days if current else 0,
                                user=user, source=PriceChange.Source.IMPORT)
            summary['prices'][target][outcome if outcome != 'removed' else CHANGED] += 1
    return {'sections': suggest_sections(plan), 'summary': summary, 'errors': [], 'warnings': plan.warnings,
            'imported': True}
