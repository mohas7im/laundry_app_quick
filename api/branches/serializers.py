from rest_framework import serializers

from .models import Branch


class BranchSerializer(serializers.ModelSerializer):
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Branch
        fields = ['id', 'name', 'code', 'phone', 'email', 'address', 'is_active', 'user_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user_count', 'created_at', 'updated_at']

    def get_user_count(self, obj):
        return obj.assignments.count()

    def validate_name(self, value):
        value = value.strip()
        qs = Branch.objects.filter(name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A branch with this name already exists.')
        return value

    def validate_code(self, value):
        value = value.strip().upper()
        if not value.replace('-', '').isalnum():
            raise serializers.ValidationError('Use letters, numbers and dashes only.')
        qs = Branch.objects.filter(code__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A branch with this code already exists.')
        return value
