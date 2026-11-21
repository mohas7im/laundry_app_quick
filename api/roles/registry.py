"""
Every permission the system knows about. Code checks these exact strings
(e.g. branch_permission('orders.create')), so they are defined here, not in the DB.
Roles store a list of these codes.

Branch, role and user management are owner-only and are not listed here.
"""

PERMISSION_GROUPS = [
    {
        'module': 'Dashboard',
        'permissions': [
            ('dashboard.view', 'View dashboard'),
        ],
    },
    {
        'module': 'Orders',
        'permissions': [
            ('orders.view', 'View orders'),
            ('orders.create', 'Create orders'),
            ('orders.edit', 'Edit orders'),
            ('orders.delete', 'Delete orders'),
            ('orders.update_status', 'Mark cleaned, ready and collected'),
        ],
    },
    {
        'module': 'Payments',
        'permissions': [
            ('payments.take', 'Take payments'),
            ('payments.discount', 'Give discounts'),
            ('payments.refund', 'Issue refunds'),
        ],
    },
    {
        'module': 'Customers',
        'permissions': [
            ('customers.view', 'View customers'),
            ('customers.create', 'Add customers'),
            ('customers.edit', 'Edit customers'),
            ('customers.delete', 'Delete customers'),
        ],
    },
    {
        'module': 'Products',
        'permissions': [
            ('products.view', 'View products and prices'),
            ('products.manage', 'Add and edit products and prices'),
        ],
    },
    {
        'module': 'Reports',
        'permissions': [
            ('reports.view', 'View reports'),
        ],
    },
]

ALL_PERMISSIONS = frozenset(code for group in PERMISSION_GROUPS for code, _ in group['permissions'])
