from django.conf import settings
from django.contrib.auth.models import update_last_login
from django.middleware.csrf import get_token
from rest_framework import exceptions, permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.settings import api_settings as jwt_settings
from rest_framework_simplejwt.tokens import RefreshToken

from .access import get_access, org_permission
from .cookies import clear_auth_cookies, set_auth_cookies
from .models import User
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    MeSerializer,
    StaffUserSerializer,
    SwitchBranchSerializer,
    is_owner_user,
    other_active_owner_exists,
)
from .tokens import build_tokens, revoke_all_sessions


def _auth_response(request, user, refresh, access_token, access, active):
    """Body = current user (with active branch); cookies = the new token pair."""
    get_token(request)  # make sure the csrftoken cookie is set/rotated
    context = {'access': access, 'active_branch_id': active.branch.id if active else None}
    response = Response({'user': MeSerializer(user, context=context).data})
    return set_auth_cookies(response, access_token, refresh)


def _token_branch_id(request):
    """active_branch_id claim of the request's access token (None if no token)."""
    token = getattr(request, 'auth', None)
    return token.get('active_branch_id') if token is not None else None


def _blacklist_cookie_refresh(request):
    raw = request.COOKIES.get(settings.AUTH_COOKIE['REFRESH_NAME'])
    if raw:
        try:
            RefreshToken(raw).blacklist()
        except TokenError:
            pass


class LoginThrottle(AnonRateThrottle):
    scope = 'login'


class CsrfView(APIView):
    """GET once on app start so the browser has a `csrftoken` cookie."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({'csrfToken': get_token(request)})


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [LoginThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']

        tokens = build_tokens(user, serializer.validated_data.get('branch_id'))
        update_last_login(None, user)
        return _auth_response(request, user, *tokens)


class RefreshView(APIView):
    """
    Rotate the refresh token and re-issue the access token with claims recomputed
    from the RBAC tables, so role/permission/branch changes apply within 15 minutes.
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        raw = request.COOKIES.get(settings.AUTH_COOKIE['REFRESH_NAME'])
        if not raw:
            return Response({'detail': 'Refresh token missing.'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            old = RefreshToken(raw)  # verifies signature, expiry and blacklist
        except TokenError:
            return self._reject()

        user = User.objects.filter(pk=old.get(jwt_settings.USER_ID_CLAIM), is_active=True).first()
        if user is None:
            return self._reject()

        old.blacklist()
        refresh, access_token, _, active = build_tokens(user, old.get('active_branch_id'))
        get_token(request)
        response = Response({
            'detail': 'Token refreshed.',
            'active_branch_id': str(active.branch.id) if active else None,
        })
        return set_auth_cookies(response, access_token, refresh)

    @staticmethod
    def _reject():
        response = Response({'detail': 'Refresh token invalid or expired.'}, status=status.HTTP_401_UNAUTHORIZED)
        return clear_auth_cookies(response)


class SwitchBranchView(APIView):
    """Issue a new token pair scoped to another branch the user can access."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = SwitchBranchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        branch_id = serializer.validated_data['branch_id']

        if get_access(request.user).branch(branch_id) is None:
            return Response({'detail': 'You do not have access to this branch.'}, status=status.HTTP_403_FORBIDDEN)

        _blacklist_cookie_refresh(request)
        tokens = build_tokens(request.user, branch_id)
        return _auth_response(request, request.user, *tokens)


class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        _blacklist_cookie_refresh(request)
        response = Response(status=status.HTTP_204_NO_CONTENT)
        return clear_auth_cookies(response)


class MeView(APIView):
    """The logged-in user, their roles/permissions, branches, and the active one (from the token)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        context = {'active_branch_id': _token_branch_id(request)}
        return Response(MeSerializer(request.user, context=context).data)


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save(update_fields=['password'])

        # Log out other devices, then issue a fresh pair for this session (same branch).
        revoke_all_sessions(request.user)
        refresh, access_token, _, _ = build_tokens(request.user, _token_branch_id(request))
        response = Response({'detail': 'Password changed.'})
        return set_auth_cookies(response, access_token, refresh)


class StaffUserViewSet(viewsets.ModelViewSet):
    """Users with `users.manage` manage accounts. Only owners may change an owner's account."""
    serializer_class = StaffUserSerializer
    permission_classes = [org_permission('users.manage')]

    def get_queryset(self):
        return User.objects.prefetch_related('user_roles__role', 'user_roles__branch')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if not hasattr(self.request, '_access'):
            self.request._access = get_access(self.request.user)
        context['actor_is_owner'] = self.request._access.is_owner
        return context

    def _guard_owner_target(self, target):
        if is_owner_user(target) and not self.request._access.is_owner:
            raise exceptions.PermissionDenied('Only an owner can change an owner account.')

    def perform_update(self, serializer):
        self._guard_owner_target(serializer.instance)
        was_active = serializer.instance.is_active
        user = serializer.save()
        # Deactivated or password reset → end their sessions.
        if (was_active and not user.is_active) or serializer.validated_data.get('password'):
            revoke_all_sessions(user)

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            raise exceptions.ValidationError({'detail': "You can't delete your own account."})
        self._guard_owner_target(instance)
        if is_owner_user(instance) and not other_active_owner_exists(instance):
            raise exceptions.ValidationError({'detail': 'This is the only active owner. Add another owner first.'})
        revoke_all_sessions(instance)
        instance.delete()
