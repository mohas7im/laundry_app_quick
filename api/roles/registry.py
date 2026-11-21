"""
Source of truth for permissions.

Code checks these permission codes, so they are defined here and written to the
`permissions` table by `roles.seed.sync_permissions` (run by a migration, and by
`python manage.py sync_rbac` after you add a code here). Roles are created by
the owner in the app; only the Owner role is built in (see create_owner).
"""

PERMISSION_GROUPS = [
    ('Administration', [
        ('branches.manage', 'Create, edit and deactivate branches'),
        ('users.manage', 'Create and edit staff accounts and their access'),
        ('roles.manage', 'Create and edit roles and their permissions'),
    ]),
    ('Dashboard', [
        ('dashboard.view', 'View dashboard'),
    ]),
    ('Orders', [
        ('orders.view', 'View orders'),
        ('orders.create', 'Create orders'),
        ('orders.edit', 'Edit orders'),
        ('orders.delete', 'Delete orders'),
        ('orders.update_status', 'Mark cleaned, ready and collected'),
    ]),
    ('Payments', [
        ('payments.take', 'Take payments'),
        ('payments.discount', 'Give discounts'),
        ('payments.refund', 'Issue refunds'),
    ]),
    ('Customers', [
        ('customers.view', 'View customers'),
        ('customers.create', 'Add customers'),
        ('customers.edit', 'Edit customers'),
        ('customers.delete', 'Delete customers'),
    ]),
    ('Products', [
        ('products.view', 'View products and prices'),
        ('products.manage', 'Add and edit products and prices'),
    ]),
    ('Deliveries', [
        ('deliveries.view', 'View pickups and deliveries'),
        ('deliveries.update', 'Update pickup and delivery status'),
    ]),
    ('Reports', [
        ('reports.view', 'View reports'),
    ]),
]

ALL_PERMISSIONS = frozenset(code for _, perms in PERMISSION_GROUPS for code, _ in perms)
