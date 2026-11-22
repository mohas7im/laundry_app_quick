"""
Built-in definitions written to the database by `roles.seed`
(migration 0004, and `python manage.py sync_rbac` after you change this file).

- SYSTEM_ACTIONS: the permission grid's columns. Every menu gets one
  permission per action, e.g. `orders.print`.
- SYSTEM_MENUS: the pages built into the app. The owner can rename, re-icon and
  reorder them in the Menus page, but not delete them or change their links.
"""

# code, name, sort order
SYSTEM_ACTIONS = [
    ('create', 'Create', 1),
    ('edit', 'Edit', 2),
    ('delete', 'Delete', 3),
    ('view', 'View', 4),
    ('print', 'Print', 5),
]

SYSTEM_MENUS = [
    {
        'code': 'dashboard', 'name': 'Dashboard', 'icon': 'layout-dashboard', 'sort_order': 0,
        'router_name': 'dashboard', 'router_link': '/',
    },
    {
        'code': 'orders', 'name': 'Orders', 'icon': 'receipt', 'sort_order': 5,
        'router_name': 'orders', 'router_link': '/orders',
    },
    {
        'code': 'production', 'name': 'Production', 'icon': 'washing-machine', 'sort_order': 6,
        'router_name': 'production', 'router_link': '/production',
    },
    {
        'code': 'collection', 'name': 'Collection', 'icon': 'package-check', 'sort_order': 7,
        'router_name': 'collection', 'router_link': '/collection',
    },
    {
        'code': 'payments', 'name': 'Payments', 'icon': 'wallet', 'sort_order': 8,
        'router_name': 'payments', 'router_link': '/payments',
    },
    {
        'code': 'shifts', 'name': 'Cash-up', 'icon': 'credit-card', 'sort_order': 9,
        'router_name': 'shifts', 'router_link': '/shifts',
    },
    {
        'code': 'reports', 'name': 'Reports', 'icon': 'file-text', 'sort_order': 11,
        'router_name': 'reports', 'router_link': '/reports',
    },
    {
        'code': 'customers', 'name': 'Customers', 'icon': 'contact-round', 'sort_order': 10,
        'router_name': 'customers', 'router_link': '/customers',
    },
    {
        'code': 'catalogue', 'name': 'Catalogue', 'icon': 'tags', 'sort_order': 20, 'is_header': True,
    },
    {
        'code': 'services', 'name': 'Services', 'icon': 'washing-machine', 'sort_order': 1, 'parent': 'catalogue',
        'router_name': 'services', 'router_link': '/services',
    },
    {
        'code': 'items', 'name': 'Items', 'icon': 'shirt', 'sort_order': 2, 'parent': 'catalogue',
        'router_name': 'items', 'router_link': '/items',
    },
    {
        'code': 'price_lists', 'name': 'Price Lists', 'icon': 'clipboard-list', 'sort_order': 3, 'parent': 'catalogue',
        'router_name': 'price-lists', 'router_link': '/price-lists',
    },
    {
        'code': 'prices', 'name': 'Prices', 'icon': 'circle-dollar-sign', 'sort_order': 4, 'parent': 'catalogue',
        'router_name': 'prices', 'router_link': '/prices',
    },
    {
        'code': 'upcharges', 'name': 'Upcharges', 'icon': 'badge-percent', 'sort_order': 5, 'parent': 'catalogue',
        'router_name': 'upcharges', 'router_link': '/upcharges',
    },
    {
        'code': 'administration', 'name': 'Administration', 'icon': 'settings', 'sort_order': 90,
        'is_header': True,
    },
    {
        'code': 'branches', 'name': 'Branches', 'icon': 'building-2', 'sort_order': 1, 'parent': 'administration',
        'router_name': 'branches', 'router_link': '/branches',
    },
    {
        'code': 'roles', 'name': 'Roles', 'icon': 'shield-check', 'sort_order': 2,
        'parent': 'administration', 'router_name': 'roles', 'router_link': '/roles',
    },
    {
        'code': 'permissions', 'name': 'Permissions', 'icon': 'key-round', 'sort_order': 3,
        'parent': 'administration', 'router_name': 'permissions', 'router_link': '/permissions',
    },
    {
        'code': 'users', 'name': 'Users', 'icon': 'users', 'sort_order': 4, 'parent': 'administration',
        'router_name': 'users', 'router_link': '/users',
    },
    {
        'code': 'common_masters', 'name': 'Common Masters', 'icon': 'folder', 'sort_order': 6,
        'parent': 'administration', 'router_name': 'common-masters', 'router_link': '/common-masters',
    },
    {
        'code': 'menus', 'name': 'Menus', 'icon': 'list-tree', 'sort_order': 5, 'parent': 'administration',
        'router_name': 'menus', 'router_link': '/menus',
    },
]


def permission_description(action_name, menu_name):
    return f'{action_name} {menu_name}'

# menus the app's own pages rely on: can't be deleted or restructured
SYSTEM_MENU_CODES = frozenset(m['code'] for m in SYSTEM_MENUS)
