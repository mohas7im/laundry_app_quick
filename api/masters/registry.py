"""
The common master types the app uses, and their starting values.

- Open types: admins may add, rename, reorder, hide and delete values
  (they are only shown to people, e.g. item categories, order note chips).
- Fixed types: the code calculates or decides on each value (per kg multiplies by
  weight, cash means money was taken now), so values can be renamed, reordered and
  hidden but not added or deleted, and their codes never change.

A migration writes these rows; to add a type, add it here and in a new migration.
"""

ITEM_CATEGORY = 'ITEM_CATEGORY'
PRICING_TYPE = 'PRICING_TYPE'
UPCHARGE_TYPE = 'UPCHARGE_TYPE'
DISCOUNT_TYPE = 'DISCOUNT_TYPE'
PAYMENT_METHOD = 'PAYMENT_METHOD'
ORDER_NOTE = 'ORDER_NOTE'

MASTER_TYPES = {
    ITEM_CATEGORY: {
        'name': 'Item category', 'fixed': False,
        'description': 'Groups items, e.g. Men, Women, Household.',
        'values': [('men', 'Men'), ('women', 'Women'), ('kids', 'Kids'), ('household', 'Household'),
                   ('other', 'Other')],
    },
    PRICING_TYPE: {
        'name': 'Charged', 'fixed': True,
        'description': 'How an item is priced: per piece, by weight or by area.',
        'values': [('unit', 'Per item'), ('per_kg', 'Per kg'), ('per_m2', 'Per m²')],
    },
    UPCHARGE_TYPE: {
        'name': 'Upcharge type', 'fixed': True,
        'description': 'A fixed amount, or a percent of the order line.',
        'values': [('fixed', 'Fixed amount (AED)'), ('percent', 'Percent of the line (%)')],
    },
    DISCOUNT_TYPE: {
        'name': 'Discount type', 'fixed': True,
        'description': 'An amount off, or a percent of the subtotal.',
        'values': [('amount', 'Amount (AED)'), ('percent', 'Percent (%)')],
    },
    PAYMENT_METHOD: {
        'name': 'Payment method', 'fixed': True,
        'description': 'How a customer pays. Cash, card and bank mean the money was taken.',
        'values': [('on_collection', 'Pay on collection'), ('cash', 'Cash'), ('card', 'Card'),
                   ('bank', 'Bank transfer'), ('on_account', 'On account')],
    },
    ORDER_NOTE: {
        'name': 'Order note', 'fixed': False,
        'description': 'Quick notes the counter adds to an order with one tap.',
        'values': [('no_starch', 'No starch'), ('light_starch', 'Light starch'), ('heavy_starch', 'Heavy starch'),
                   ('on_hanger', 'On hanger'), ('folded', 'Folded')],
    },
}

FIXED_TYPES = frozenset(code for code, spec in MASTER_TYPES.items() if spec['fixed'])
