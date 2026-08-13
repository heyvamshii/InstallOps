"""Filters backing the job table. Each one maps to a control in the Angular UI and to a
query parameter that is persisted in the URL.
"""

import django_filters
from django.db.models import Q, QuerySet
from django.utils import timezone

from .constants import Priority, Stage
from .models import Job


class JobFilter(django_filters.FilterSet):
    stage = django_filters.MultipleChoiceFilter(choices=Stage.choices)
    priority = django_filters.MultipleChoiceFilter(choices=Priority.choices)
    on_hold = django_filters.BooleanFilter()
    assigned_tech = django_filters.NumberFilter()
    assigned_designer = django_filters.NumberFilter()
    site_state = django_filters.CharFilter(lookup_expr="iexact")
    due_before = django_filters.DateFilter(field_name="target_completion_date", lookup_expr="lte")
    due_after = django_filters.DateFilter(field_name="target_completion_date", lookup_expr="gte")
    overdue = django_filters.BooleanFilter(method="filter_overdue")
    has_rework = django_filters.BooleanFilter(method="filter_has_rework")
    search = django_filters.CharFilter(method="filter_search")

    class Meta:
        model = Job
        fields = ("stage", "priority", "on_hold", "assigned_tech", "assigned_designer")

    def filter_overdue(self, queryset: QuerySet, name: str, value: bool) -> QuerySet:
        today = timezone.now().date()
        overdue = Q(target_completion_date__lt=today) & ~Q(stage=Stage.COMPLETE)
        return queryset.filter(overdue) if value else queryset.exclude(overdue)

    def filter_has_rework(self, queryset: QuerySet, name: str, value: bool) -> QuerySet:
        lookup = Q(rework_count__gt=0)
        return queryset.filter(lookup) if value else queryset.exclude(lookup)

    def filter_search(self, queryset: QuerySet, name: str, value: str) -> QuerySet:
        term = value.strip()
        if not term:
            return queryset
        return queryset.filter(
            Q(job_number__icontains=term)
            | Q(customer__name__icontains=term)
            | Q(site_address__icontains=term)
            | Q(site_city__icontains=term)
            | Q(permit_number__icontains=term)
        )
