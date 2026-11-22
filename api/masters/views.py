from rest_framework import permissions, viewsets

from accounts.access import menu_permission
from common.drf import ResultViewSetMixin
from common.results import BaseResult, ErrorCode
from .models import CommonMaster, CommonMasterType
from .registry import FIXED_TYPES
from .serializers import CommonMasterSerializer, CommonMasterTypeSerializer

ManageMasters = menu_permission('common_masters')


class ReadForAllManageWithMenu(permissions.BasePermission):
    """
    Reading is open to every logged-in user: forms and the counter need the lists.
    Adding, changing and deleting values needs the Common Masters menu permissions.
    """

    message = ManageMasters.message

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return ManageMasters().has_permission(request, view)


class CommonMasterTypeViewSet(ResultViewSetMixin, viewsets.ReadOnlyModelViewSet):
    """/api/common-master-types/ — the lists; created by the app (migrations), not by users."""

    queryset = CommonMasterType.objects.prefetch_related('values')
    serializer_class = CommonMasterTypeSerializer
    permission_classes = [ReadForAllManageWithMenu]
    search_fields = ['code', 'name']


class CommonMasterViewSet(ResultViewSetMixin, viewsets.ModelViewSet):
    """
    /api/common-masters/?type=ITEM_CATEGORY[&active=true]
    The values of one list (all lists without ?type). ?active=true for form dropdowns.
    """

    serializer_class = CommonMasterSerializer
    permission_classes = [ReadForAllManageWithMenu]
    search_fields = ['code', 'name']
    referenced_message = 'This value is used by other records. Hide it (make it inactive) instead.'

    def get_queryset(self):
        qs = CommonMaster.objects.select_related('type')
        type_code = self.request.query_params.get('type')
        if type_code:
            qs = qs.filter(type__code=type_code)
        if self.request.query_params.get('active') in ('true', '1'):
            qs = qs.filter(is_active=True)
        return qs

    def destroy(self, request, *args, **kwargs):
        master = self.get_object()
        if master.type.code in FIXED_TYPES:
            return BaseResult.failure(
                ErrorCode.OPERATION_NOT_ALLOWED,
                f"{master.type.name} values are used by the app and can't be deleted. Hide it instead.",
            ).to_response()
        return super().destroy(request, *args, **kwargs)
