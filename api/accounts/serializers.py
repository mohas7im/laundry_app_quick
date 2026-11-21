from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from branches.models import Branch, BranchMembership
from roles.models import Role
from .access import accessible_branches
from .models import User


# ── Current user (/auth/me, login response) ────────────────────────────────

class MeSerializer(serializers.ModelSerializer):
    branches = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'full_name', 'phone', 'is_owner', 'branches', 'date_joined', 'last_login']
        read_only_fields = fields

    def get_branches(self, user):
        return [
            {
                'id': b.id,
                'name': b.name,
                'code': b.code,
                'role': {'id': b.role.id, 'name': b.role.name} if b.role else None,
                'permissions': sorted(b.permission_set),
            }
            for b in accessible_branches(user)
        ]


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get('request'),
            email=attrs['email'].lower(),
            password=attrs['password'],
        )
        if user is None:
            raise serializers.ValidationError('Invalid email or password.', code='authorization')
        attrs['user'] = user
        return attrs


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False, min_length=8)

    def validate_current_password(self, value):
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

    def validate_new_password(self, value):
        try:
            validate_password(value, self.context['request'].user)
        except DjangoValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return value


# ── Staff management (owner only) ───────────────────────────────────────────

class MembershipSerializer(serializers.ModelSerializer):
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.all())
    role = serializers.PrimaryKeyRelatedField(queryset=Role.objects.all())
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    role_name = serializers.CharField(source='role.name', read_only=True)

    class Meta:
        model = BranchMembership
        fields = ['id', 'branch', 'branch_name', 'role', 'role_name']
        read_only_fields = ['id', 'branch_name', 'role_name']


class StaffUserSerializer(serializers.ModelSerializer):
    """Create/edit staff users with their branch + role assignments."""

    memberships = MembershipSerializer(many=True)
    password = serializers.CharField(write_only=True, required=False, trim_whitespace=False)

    class Meta:
        model = User
        fields = ['id', 'email', 'full_name', 'phone', 'is_active', 'password',
                  'memberships', 'date_joined', 'last_login']
        read_only_fields = ['id', 'date_joined', 'last_login']

    def validate_email(self, value):
        value = value.strip().lower()
        qs = User.objects.filter(email__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def validate_memberships(self, value):
        if not value:
            raise serializers.ValidationError('Assign at least one branch and role.')
        branch_ids = [m['branch'].id for m in value]
        if len(branch_ids) != len(set(branch_ids)):
            raise serializers.ValidationError('Each branch can only be assigned once.')
        return value

    def validate(self, attrs):
        password = attrs.get('password')
        if self.instance is None and not password:
            raise serializers.ValidationError({'password': 'Password is required.'})
        if password:
            probe = self.instance or User(email=attrs.get('email', ''), full_name=attrs.get('full_name', ''))
            try:
                validate_password(password, probe)
            except DjangoValidationError as e:
                raise serializers.ValidationError({'password': list(e.messages)})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        memberships = validated_data.pop('memberships')
        password = validated_data.pop('password')
        user = User.objects.create_user(password=password, **validated_data)
        self._save_memberships(user, memberships)
        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        memberships = validated_data.pop('memberships', None)
        password = validated_data.pop('password', None)

        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()

        if memberships is not None:
            instance.memberships.all().delete()
            self._save_memberships(instance, memberships)
        return instance

    @staticmethod
    def _save_memberships(user, memberships):
        BranchMembership.objects.bulk_create(
            BranchMembership(user=user, branch=m['branch'], role=m['role']) for m in memberships
        )
