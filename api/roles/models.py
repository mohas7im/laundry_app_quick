from django.db import models
from django.db.models.functions import Lower


class Role(models.Model):
    """A named set of permission codes (see roles.registry), shared by all branches."""

    name = models.CharField(max_length=80)
    description = models.CharField(max_length=255, blank=True)
    permissions = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(Lower('name'), name='role_name_unique_ci'),
        ]

    def __str__(self):
        return self.name
