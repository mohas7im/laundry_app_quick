from django.db import transaction
from rest_framework import serializers

from .models import Branch, BranchHoliday


class HolidaySerializer(serializers.Serializer):
    date = serializers.DateField()
    name = serializers.CharField(max_length=80, required=False, allow_blank=True, default='')


class BranchSerializer(serializers.ModelSerializer):
    """
    A branch with its hours and ready-by calendar. `holidays` (a list of {date, name})
    replaces the branch's holidays when sent.
    """

    user_count = serializers.SerializerMethodField()
    closed_weekdays = serializers.ListField(child=serializers.IntegerField(min_value=0, max_value=6),
                                            required=False, max_length=6)
    holidays = HolidaySerializer(many=True, required=False)

    class Meta:
        model = Branch
        fields = ['id', 'name', 'code', 'phone', 'email', 'address', 'opens_at', 'closes_at', 'cutoff_time',
                  'closed_weekdays', 'holidays', 'is_active', 'user_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user_count', 'created_at', 'updated_at']

    def to_representation(self, branch):
        data = super().to_representation(branch)
        data['holidays'] = [{'date': h.date.isoformat(), 'name': h.name} for h in branch.holidays.all()]
        return data

    def validate_closed_weekdays(self, value):
        return sorted(set(value))

    def validate_holidays(self, value):
        dates = [h['date'] for h in value]
        if len(dates) != len(set(dates)):
            raise serializers.ValidationError('Each holiday date may be listed once.')
        return value

    def validate(self, attrs):
        opens = attrs.get('opens_at', getattr(self.instance, 'opens_at', None))
        closes = attrs.get('closes_at', getattr(self.instance, 'closes_at', None))
        if opens and closes and closes <= opens:
            raise serializers.ValidationError({'closes_at': 'Closing time must be after opening time.'})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        holidays = validated_data.pop('holidays', None)
        branch = super().create(validated_data)
        self._save_holidays(branch, holidays)
        return branch

    @transaction.atomic
    def update(self, instance, validated_data):
        holidays = validated_data.pop('holidays', None)
        branch = super().update(instance, validated_data)
        self._save_holidays(branch, holidays)
        return branch

    @staticmethod
    def _save_holidays(branch, holidays):
        if holidays is None:
            return
        branch.holidays.all().delete()
        BranchHoliday.objects.bulk_create(
            BranchHoliday(branch=branch, date=h['date'], name=h['name'].strip()) for h in holidays)

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
