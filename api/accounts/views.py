from django.conf import settings
from django.contrib.auth.models import update_last_login
from django.middleware.csrf import get_token
from rest_framework import permissions, status, viewsets
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .access import IsOwner
from .cookies import clear_auth_cookies, set_auth_cookies
from .models import User
from .serializers import ChangePasswordSerializer, LoginSerializer, MeSerializer, StaffUserSerializer
from .tokens import revoke_all_sessions


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

        refresh = RefreshToken.for_user(user)
        update_last_login(None, user)
        get_token(request)  # rotate/set csrftoken cookie

        response = Response({'user': MeSerializer(user).data}, status=status.HTTP_200_OK)
        return set_auth_cookies(response, refresh.access_token, refresh)


class RefreshView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        raw_refresh = request.COOKIES.get(settings.AUTH_COOKIE['REFRESH_NAME'])
        if not raw_refresh:
            return Response({'detail': 'Refresh token missing.'}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = TokenRefreshSerializer(data={'refresh': raw_refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken, AuthenticationFailed):
            response = Response({'detail': 'Refresh token invalid or expired.'}, status=status.HTTP_401_UNAUTHORIZED)
            return clear_auth_cookies(response)

        data = serializer.validated_data
        get_token(request)
        response = Response({'detail': 'Token refreshed.'}, status=status.HTTP_200_OK)
        # With ROTATE_REFRESH_TOKENS=True a new refresh token is issued and the old one blacklisted.
        return set_auth_cookies(response, data['access'], data.get('refresh'))


class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        raw_refresh = request.COOKIES.get(settings.AUTH_COOKIE['REFRESH_NAME'])
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                pass
        response = Response(status=status.HTTP_204_NO_CONTENT)
        return clear_auth_cookies(response)


class MeView(APIView):
    """The logged-in user, with the branches they can access and their permissions in each."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user).data)


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save(update_fields=['password'])

        # Log out other devices, then issue a fresh pair for this session.
        revoke_all_sessions(request.user)
        refresh = RefreshToken.for_user(request.user)
        response = Response({'detail': 'Password changed.'})
        return set_auth_cookies(response, refresh.access_token, refresh)


class StaffUserViewSet(viewsets.ModelViewSet):
    """Owner manages staff accounts. Owner accounts are not listed or editable here."""
    serializer_class = StaffUserSerializer
    permission_classes = [IsOwner]

    def get_queryset(self):
        return (
            User.objects.filter(is_owner=False)
            .prefetch_related('memberships__branch', 'memberships__role')
        )

    def perform_update(self, serializer):
        was_active = serializer.instance.is_active
        user = serializer.save()
        # Deactivated or password reset by the owner → end their sessions.
        if (was_active and not user.is_active) or serializer.validated_data.get('password'):
            revoke_all_sessions(user)

    def perform_destroy(self, instance):
        revoke_all_sessions(instance)
        instance.delete()
