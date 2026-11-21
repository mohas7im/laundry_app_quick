from rest_framework import serializers

from .models import Role
from .registry import ALL_PERMISSIONS


class RoleSerializer(serializers.ModelSerializer):
    permissions = serializers.ListField(child=serializers.CharField(), allow_empty=True)
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = ['id', 'name', 'description', 'permissions', 'user_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user_count', 'created_at', 'updated_at']

    def get_user_count(self, obj):
        return obj.memberships.values('user').distinct().count()

    def validate_name(self, value):
        value = value.strip()
        qs = Role.objects.filter(name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A role with this name already exists.')
        return value

    def validate_permissions(self, value):
        unknown = sorted(set(value) - ALL_PERMISSIONS)
        if unknown:
            raise serializers.ValidationError(f'Unknown permissions: {", ".join(unknown)}')
        return sorted(set(value))
