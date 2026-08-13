"""Two read shapes on purpose.

``JobListSerializer`` is deliberately lean — it is what the paginated table renders, and
every extra field is paid for 25 rows at a time. ``JobDetailSerializer`` is the
expensive one and is only used for a single job.
"""

from rest_framework import serializers

from apps.accounts.constants import Role

from .constants import STAGE_ORDER, Stage
from .models import ChecklistItem, Customer, Document, DocumentKind, Job, Note, StageTransition
from .services import available_transitions


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ("id", "name", "email", "phone", "billing_address")


class StageTransitionSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.get_full_name", default="", read_only=True)

    class Meta:
        model = StageTransition
        fields = (
            "id",
            "from_stage",
            "to_stage",
            "actor",
            "actor_name",
            "reason",
            "was_forced",
            "created_at",
        )
        read_only_fields = fields


class ChecklistItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChecklistItem
        fields = ("id", "stage", "label", "order", "is_done", "completed_by", "completed_at")
        read_only_fields = ("id", "stage", "label", "order", "completed_by", "completed_at")


class NoteSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.get_full_name", default="", read_only=True)

    class Meta:
        model = Note
        fields = ("id", "body", "author", "author_name", "created_at")
        read_only_fields = ("id", "author", "author_name", "created_at")


#: Document kinds only certain roles may produce. Absent kinds are open to any role
#: that can already see the job.
DOCUMENT_KIND_ROLES: dict[str, frozenset[str]] = {
    DocumentKind.DESIGN_PACKAGE: frozenset({Role.DESIGNER, Role.ADMIN}),
    DocumentKind.PERMIT: frozenset({Role.COORDINATOR, Role.ADMIN}),
    DocumentKind.INSPECTION: frozenset({Role.COORDINATOR, Role.ADMIN}),
}


class DocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Document
        fields = (
            "id",
            "kind",
            "stage",
            "file",
            "original_name",
            "uploaded_by",
            "created_at",
        )
        read_only_fields = ("id", "uploaded_by", "created_at")

    def validate_kind(self, value: str) -> str:
        """A Field Tech may upload site photos, not a design package.

        The permission class gates *whether* a role may upload at all; this gates
        *what* they may claim the upload is.
        """
        allowed = DOCUMENT_KIND_ROLES.get(value)
        if allowed is None:
            return value

        request = self.context.get("request")
        role = getattr(request.user, "role", None) if request else None
        if role not in allowed:
            raise serializers.ValidationError(
                f"Your role cannot upload documents of kind {value}."
            )
        return value


class JobListSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    assigned_tech_name = serializers.CharField(
        source="assigned_tech.get_full_name", default="", read_only=True
    )
    is_overdue = serializers.BooleanField(read_only=True)
    stage_index = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = (
            "id",
            "job_number",
            "customer_name",
            "stage",
            "stage_index",
            "on_hold",
            "priority",
            "site_city",
            "site_state",
            "system_size_kw",
            "panel_count",
            "assigned_tech",
            "assigned_tech_name",
            "target_completion_date",
            "is_overdue",
            "rework_count",
            "updated_at",
        )

    def get_stage_index(self, obj: Job) -> int:
        return STAGE_ORDER.index(obj.stage)


class JobDetailSerializer(serializers.ModelSerializer):
    customer = CustomerSerializer(read_only=True)
    transitions = StageTransitionSerializer(many=True, read_only=True)
    checklist_items = ChecklistItemSerializer(many=True, read_only=True)
    notes = NoteSerializer(many=True, read_only=True)
    documents = DocumentSerializer(many=True, read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    available_transitions = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = (
            "id",
            "job_number",
            "customer",
            "stage",
            "on_hold",
            "hold_reason",
            "priority",
            "site_address",
            "site_city",
            "site_state",
            "site_postal_code",
            "system_size_kw",
            "panel_count",
            "battery_count",
            "roof_type",
            "utility_company",
            "ahj",
            "permit_number",
            "assigned_designer",
            "assigned_tech",
            "created_by",
            "target_completion_date",
            "rework_count",
            "is_overdue",
            "available_transitions",
            "transitions",
            "checklist_items",
            "notes",
            "documents",
            "created_at",
            "updated_at",
        )

    def get_available_transitions(self, obj: Job) -> list[str]:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return []
        return available_transitions(job=obj, actor=request.user)


class JobWriteSerializer(serializers.ModelSerializer):
    """Stage is absent by design — it only moves through the transition endpoint."""

    class Meta:
        model = Job
        fields = (
            "customer",
            "priority",
            "site_address",
            "site_city",
            "site_state",
            "site_postal_code",
            "system_size_kw",
            "panel_count",
            "battery_count",
            "roof_type",
            "utility_company",
            "ahj",
            "permit_number",
            "assigned_designer",
            "assigned_tech",
            "target_completion_date",
        )


class TransitionRequestSerializer(serializers.Serializer):
    to_stage = serializers.ChoiceField(choices=Stage.choices)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)


class HoldRequestSerializer(serializers.Serializer):
    on_hold = serializers.BooleanField()
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)
