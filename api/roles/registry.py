"""
Menus for the pages built into the app ("system menus").

They are written to the `menus` table — with one `permissions` row per action —
by `roles.seed.sync_system_menus` (migration 0003, and `python manage.py sync_rbac`
after you add a page here). The owner can rename, re-icon and reorder them in the
Menus page, but not delete them. Other menus are created in the app.
"""

CRUD = ['view', 'create', 'edit', 'delete']

ACTION_LABELS = {
    'view': 'View',
    'create': 'Create',
    'edit': 'Edit',
    'delete': 'Delete',
}

# code, name, path, icon (lucide name), parent code, sort order, actions
SYSTEM_MENUS = [
    ('dashboard', 'Dashboard', '/', 'layout-dashboard', None, 0, ['view']),
    ('administration', 'Administration', '', 'settings', None, 90, []),
    ('branches', 'Branches', '/branches', 'building-2', 'administration', 1, CRUD),
    ('roles', 'Roles & Permissions', '/roles', 'shield-check', 'administration', 2, CRUD),
    ('users', 'Users', '/users', 'users', 'administration', 3, CRUD),
    ('menus', 'Menus', '/menus', 'list-tree', 'administration', 4, CRUD),
]


def action_label(action):
    return ACTION_LABELS.get(action, action.replace('_', ' ').capitalize())


def permission_description(action, menu_name):
    return f'{action_label(action)} {menu_name}'
