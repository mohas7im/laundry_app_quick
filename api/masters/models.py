"""
Common masters: lookup lists kept in the database instead of the code.

    common_master_types ─< common_masters
    ITEM_CATEGORY          men, women, kids …
    PRICING_TYPE           unit, per_kg, per_m2
    …                      (see masters/registry.py)

Other tables point at a CommonMaster row (e.g. items.category_id); the API speaks
in codes ("men", "per_kg") and shows names.
"""
import uuid

from django.db import models
from django.db.models.functions import Lower


class CommonMasterType(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=80)
    description = models.TextField(blank=True)

    class Meta:
        db_table = 'common_master_types'
        ordering = ['name']

    def __str__(self):
        return self.name


class CommonMaster(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    type = models.ForeignKey(CommonMasterType, on_delete=models.PROTECT, related_name='values')
    code = models.CharField(max_length=50, help_text='Stable key the API and code use, e.g. "per_kg".')
    name = models.CharField(max_length=80)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'common_masters'
        ordering = ['sort_order', 'name']
        constraints = [
            models.UniqueConstraint(fields=['type', 'code'], name='common_masters_type_code_uq'),
            models.UniqueConstraint('type', Lower('name'), name='common_masters_type_name_lower_uq'),
        ]

    def __str__(self):
        return f'{self.type.code}: {self.name}'

    @classmethod
    def of(cls, type_code):
        """The values of one type, e.g. CommonMaster.of('ITEM_CATEGORY')."""
        return cls.objects.filter(type__code=type_code)

    @classmethod
    def get(cls, type_code, code):
        return cls.objects.get(type__code=type_code, code=code)
