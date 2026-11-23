"""
The common master types the app uses, and their starting values.

- Open types: admins may add, rename, reorder, hide and delete values
  (they are only shown to people, e.g. item categories, order note chips).
- Fixed types: the code calculates or decides on each value (per kg multiplies by
  weight, cash means money was taken now), so values can be renamed, reordered and
  hidden but not added or deleted, and their codes never change.

A migration writes these rows; to add a type, add it here and in a new migration.
"""
import re

ITEM_CATEGORY = 'ITEM_CATEGORY'
PRICING_TYPE = 'PRICING_TYPE'
UPCHARGE_TYPE = 'UPCHARGE_TYPE'
DISCOUNT_TYPE = 'DISCOUNT_TYPE'
PAYMENT_METHOD = 'PAYMENT_METHOD'
ORDER_NOTE = 'ORDER_NOTE'
PRODUCTION_STAGE = 'PRODUCTION_STAGE'

# per-piece item notes (the counter tags each piece)
ITEM_COLOUR = 'ITEM_COLOUR'
ITEM_DAMAGE = 'ITEM_DAMAGE'
ITEM_STAIN = 'ITEM_STAIN'

# customer preferences: one list per question; a customer picks one value of each
PREF_SHIRT = 'PREF_SHIRT'
PREF_TROUSER = 'PREF_TROUSER'
PREF_STARCH = 'PREF_STARCH'
PREF_DETERGENT = 'PREF_DETERGENT'
PREF_SCENT = 'PREF_SCENT'
PREF_SOFTENER = 'PREF_SOFTENER'
PREFERENCE_TYPES = (PREF_SHIRT, PREF_TROUSER, PREF_STARCH, PREF_DETERGENT, PREF_SCENT, PREF_SOFTENER)

COLOURS = ['Beige', 'Black', 'Brown', 'Blue', 'Blue (Light)', 'Blue (Royal)', 'Burgundy', 'Check', 'Cream', 'Dark',
           'Dot', 'Floral', 'Gold', 'Gray', 'Gray (Light)', 'Green', 'Green (Light)', 'Hawaiian', 'Ivory', 'Khaki',
           'Lemon', 'Light', 'Mixed', 'Multi', 'Navy', 'Off White', 'Orange', 'Peach', 'Plaid', 'Plain', 'Plum',
           'Pink', 'Print', 'Purple', 'Red', 'Silver', 'Striped', 'Tan', 'Teal', 'White', 'Yellow']
DAMAGE = ['Bubble', 'Button broken', 'Button missing', 'Collar torn', 'Colour loss', 'Cuff torn', 'Hole', 'Torn',
          'Zip broken', 'Faded', 'Shrunk', 'Burn mark']


def _code(name):
    """"Blue (Light)" → "blue_light" (same rule as masters.serializers.code_from)."""
    return re.sub(r'_+', '_', re.sub(r'[^a-z0-9]+', '_', name.lower())).strip('_')


STAINS = ['Oil', 'Ink', 'Food', 'Tea / coffee', 'Blood', 'Sweat', 'Make-up', 'Mud', 'Rust', 'Unknown']

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
    PRODUCTION_STAGE: {
        'name': 'Production stage', 'fixed': False,
        'description': 'The workshop steps between Received and Ready, in order.',
        'values': [('washing', 'Washing'), ('ironing', 'Ironing'), ('packing', 'Packing')],
    },
    ORDER_NOTE: {
        'name': 'Order note', 'fixed': False,
        'description': 'Quick notes the counter adds to an order with one tap.',
        'values': [('no_starch', 'No starch'), ('light_starch', 'Light starch'), ('heavy_starch', 'Heavy starch'),
                   ('on_hanger', 'On hanger'), ('folded', 'Folded')],
    },
    ITEM_COLOUR: {'name': 'Item colour', 'fixed': False, 'description': 'Colours the counter tags a piece with.',
                  'values': [(_code(n), n) for n in COLOURS]},
    ITEM_DAMAGE: {'name': 'Item damage', 'fixed': False,
                  'description': 'Damage noted on a piece when it is handed in.',
                  'values': [(_code(n), n) for n in DAMAGE]},
    ITEM_STAIN: {'name': 'Item stain', 'fixed': False, 'description': 'Stains noted on a piece.',
                 'values': [(_code(n), n) for n in STAINS]},
    PREF_SHIRT: {'name': 'Shirt', 'fixed': False, 'description': 'Customer preference: how shirts come back.',
                 'values': [('hanger', 'Hanger'), ('boxed', 'Boxed'), ('folded', 'Folded')]},
    PREF_TROUSER: {'name': 'Trouser', 'fixed': False, 'description': 'Customer preference: how trousers come back.',
                   'values': [('hanger', 'Hanger'), ('boxed', 'Boxed'), ('folded', 'Folded')]},
    PREF_STARCH: {'name': 'Starch', 'fixed': False, 'description': 'Customer preference: starch (nesha).',
                  'values': [('none', 'No starch'), ('light', 'Light'), ('normal', 'Normal'), ('heavy', 'Heavy')]},
    PREF_DETERGENT: {'name': 'Detergent', 'fixed': False, 'description': 'Customer preference: detergent type.',
                     'values': [('standard', 'Standard'), ('premium', 'Premium')]},
    PREF_SCENT: {'name': 'Scent', 'fixed': False, 'description': 'Customer preference: detergent scent.',
                 'values': [('none', 'No scent'), ('light', 'Light'), ('medium', 'Medium'), ('heavy', 'Heavy'),
                            ('sensitive', 'Sensitive skin')]},
    PREF_SOFTENER: {'name': 'Softener', 'fixed': False, 'description': 'Customer preference: fabric softener.',
                    'values': [('none', 'No softener'), ('standard', 'Standard'), ('premium', 'Premium')]},
}

# Production stage codes can't be these: the board uses them for its first and last columns.
RESERVED_STAGE_CODES = frozenset({'received', 'ready', 'collected', 'cancelled'})

FIXED_TYPES = frozenset(code for code, spec in MASTER_TYPES.items() if spec['fixed'])
