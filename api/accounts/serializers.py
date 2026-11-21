from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from branches.models import Branch, UserBranchAssignment
from roles.models import OWNER_ROLE, Role, UserRole
from .access import get_access
from .models import User


# ── Current user (/auth/me, login response) ────────────────────────────────

class MeSerializer(serializers.ModelSerializer):
    """
    Context: 'access' (from get_access) and 'active_branch_id' (from the token).
    `roles`/`permissions` are organization-wide; each branch lists what applies there.
    """
    is_owner = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    active_branch_id = serializers.SerializerMethodField()
    branches = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'full_name', 'phone', 'is_owner', 'roles', 'permissions',
                  'active_branch_id', 'branches', 'date_joined', 'last_login']
        read_only_fields = fields

    def _access(self, user):
        if 'access' not in self.context:
            self.context['access'] = get_access(user)
        return self.context['access']

    def get_is_owner(self, user):
        return self._access(user).is_owner

    def get_roles(self, user):
        return sorted({r.name for r in self._access(user).org_roles})

    def get_permissions(self, user):
        return sorted(self._access(user).org_permissions)

    def get_active_branch_id(self, user):
        value = self.context.get('active_branch_id')
        return str(value) if value else None

    def get_branches(self, user):
        return [
            {
                'id': str(b.branch.id),
                'name': b.branch.name,
                'code': b.branch.code,
                'roles': sorted(({'id': str(r.id), 'name': r.name} for r in {r.id: r for r in b.roles}.values()),
                                key=lambda r: r['name']),
                'permissions': sorted(b.permissions),
            }
            for b in self._access(user).branches
        ]


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    # Optional: the branch used last time on this device. Ignored if no longer accessible.
    branch_id = serializers.UUIDField(required=False, allow_null=True)

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


class SwitchBranchSerializer(serializers.Serializer):
    branch_id = serializers.UUIDField()


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


# ── User management (users.manage) ──────────────────────────────────────────

def is_owner_user(user):
    return UserRole.objects.filter(user=user, branch__isnull=True, role__name=OWNER_ROLE,
                                   role__is_system_role=True).exists()


def other_active_owner_exists(user):
    return UserRole.objects.filter(
        branch__isnull=True, role__name=OWNER_ROLE, role__is_system_role=True, user__is_active=True,
    ).exclude(user=user).exists()


class UserRoleSerializer(serializers.ModelSerializer):
    role = serializers.PrimaryKeyRelatedField(queryset=Role.objects.all())
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.all(), allow_null=True, required=False)
    role_name = serializers.CharField(source='role.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True, default=None)

    class Meta:
        model = UserRole
        fields = ['id', 'role', 'role_name', 'branch', 'branch_name']
        read_only_fields = ['id', 'role_name', 'branch_name']


class StaffUserSerializer(serializers.ModelSerializer):
    """
    Create/edit users with their roles. Each role is organization-wide (branch = null)
    or for one branch. Branch assignments are derived from the branch roles.
    """
    roles = UserRoleSerializer(many=True, source='user_roles')
    password = serializers.CharField(write_only=True, required=False, trim_whitespace=False)
    is_owner = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'full_name', 'phone', 'is_active', 'password', 'is_owner', 'roles',
                  'date_joined', 'last_login']
        read_only_fields = ['id', 'is_owner', 'date_joined', 'last_login']

    def get_is_owner(self, user):
        return any(ur.branch_id is None and ur.role.is_owner_role for ur in user.user_roles.all())

    def validate_email(self, value):
        value = value.strip().lower()
        qs = User.objects.filter(email__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def validate_roles(self, value):
        if not value:
            raise serializers.ValidationError('Give the user at least one role.')
        seen = set()
        for item in value:
            key = (item['role'].id, item.get('branch') and item['branch'].id)
            if key in seen:
                raise serializers.ValidationError('The same role is listed twice for the same branch.')
            seen.add(key)
            if item['role'].is_owner_role and item.get('branch'):
                raise serializers.ValidationError('The Owner role applies to all branches; leave the branch empty.')
        if any(i['role'].is_owner_role for i in value) and not self.context.get('actor_is_owner'):
            raise serializers.ValidationError('Only an owner can give the Owner role.')
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

        # Never leave the business without an active owner.
        if self.instance is not None and is_owner_user(self.instance) and not other_active_owner_exists(self.instance):
            roles = attrs.get('user_roles')
            loses_owner = roles is not None and not any(
                i['role'].is_owner_role and not i.get('branch') for i in roles
            )
            if loses_owner or attrs.get('is_active') is False:
                raise serializers.ValidationError(
                    {'detail': 'This is the only active owner. Add another owner first.'}
                )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        roles = validated_data.pop('user_roles')
        password = validated_data.pop('password')
        user = User.objects.create_user(password=password, **validated_data)
        self._save_roles(user, roles)
        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        roles = validated_data.pop('user_roles', None)
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        if roles is not None:
            self._save_roles(instance, roles)
        return instance

    @staticmethod
    def _save_roles(user, roles):
        """Replace the user's roles; keep branch assignments in step with the branch roles."""
        branch_ids = {i['branch'].id for i in roles if i.get('branch')}

        UserRole.objects.filter(user=user).delete()
        UserBranchAssignment.objects.filter(user=user).exclude(branch_id__in=branch_ids).delete()
        existing = set(UserBranchAssignment.objects.filter(user=user).values_list('branch_id', flat=True))
        UserBranchAssignment.objects.bulk_create(
            UserBranchAssignment(user=user, branch_id=b) for b in branch_ids - existing
        )
        UserRole.objects.bulk_create(
            UserRole(user=user, role=i['role'], branch=i.get('branch')) for i in roles
        )
