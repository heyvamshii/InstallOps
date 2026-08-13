from django.db.models import Prefetch, QuerySet
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .filters import JobFilter
from .constants import STAGE_OWNER
from .exceptions import NotStageOwner
from .models import ChecklistItem, Customer, Job, Note, StageTransition
from .pagination import JobPagination
from .permissions import JobPermission

#: Actions whose response is serialized with JobDetailSerializer.
DETAIL_ACTIONS = frozenset({"retrieve", "transition", "hold", "notes", "documents"})
from .serializers import (
    ChecklistItemSerializer,
    CustomerSerializer,
    DocumentSerializer,
    HoldRequestSerializer,
    JobDetailSerializer,
    JobListSerializer,
    JobWriteSerializer,
    NoteSerializer,
    StageTransitionSerializer,
    TransitionRequestSerializer,
)
from .services import add_note, create_job, set_hold, transition_job


class JobViewSet(viewsets.ModelViewSet):
    permission_classes = (JobPermission,)
    pagination_class = JobPagination
    filterset_class = JobFilter
    ordering_fields = (
        "job_number",
        "stage",
        "priority",
        "target_completion_date",
        "updated_at",
        "created_at",
        "rework_count",
    )
    ordering = ("-created_at",)
    search_fields = ()  # search is handled by JobFilter so it can span relations

    def get_queryset(self) -> QuerySet[Job]:
        """Role scoping happens here, not in the UI.

        A Field Tech's token cannot reach another tech's job even by guessing its id,
        because the object was never in the queryset to begin with.
        """
        # assigned_designer is exposed as a raw id, so it needs no JOIN.
        queryset = Job.objects.select_related("customer", "assigned_tech")

        user = self.request.user
        if not user.is_authenticated:
            # Reached only by schema generation, which introspects without a request user.
            return queryset.none()
        if not user.sees_all_jobs:
            queryset = queryset.filter(assigned_tech=user)

        # Every action that responds with JobDetailSerializer needs the same prefetch —
        # not just `retrieve`. Without this, each write action re-queries the actor of
        # every transition and the author of every note.
        if self.action in DETAIL_ACTIONS:
            queryset = queryset.prefetch_related(
                Prefetch("transitions", queryset=StageTransition.objects.select_related("actor")),
                "checklist_items",
                Prefetch("notes", queryset=Note.objects.select_related("author")),
                "documents",
            )
        return queryset

    def get_serializer_class(self):
        if self.action in {"create", "update", "partial_update"}:
            return JobWriteSerializer
        if self.action == "retrieve":
            return JobDetailSerializer
        return JobListSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        job = create_job(actor=request.user, **serializer.validated_data)
        return Response(
            JobDetailSerializer(job, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(request=TransitionRequestSerializer, responses=JobDetailSerializer)
    @action(detail=True, methods=["post"])
    def transition(self, request, pk=None):
        """Advance the job one legal step. Every rejection is a typed error code."""
        serializer = TransitionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        job = self.get_object()
        transition_job(
            job=job,
            to_stage=serializer.validated_data["to_stage"],
            actor=request.user,
            reason=serializer.validated_data.get("reason", ""),
        )
        job.refresh_from_db()
        return Response(JobDetailSerializer(job, context=self.get_serializer_context()).data)

    @extend_schema(request=HoldRequestSerializer, responses=JobDetailSerializer)
    @action(detail=True, methods=["post"])
    def hold(self, request, pk=None):
        serializer = HoldRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        job = set_hold(
            job=self.get_object(),
            actor=request.user,
            on_hold=serializer.validated_data["on_hold"],
            reason=serializer.validated_data.get("reason", ""),
        )
        return Response(JobDetailSerializer(job, context=self.get_serializer_context()).data)

    @extend_schema(request=NoteSerializer, responses=NoteSerializer)
    @action(detail=True, methods=["post"])
    def notes(self, request, pk=None):
        serializer = NoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note = add_note(
            job=self.get_object(), actor=request.user, body=serializer.validated_data["body"]
        )
        return Response(NoteSerializer(note).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=DocumentSerializer, responses=DocumentSerializer)
    @action(detail=True, methods=["post"])
    def documents(self, request, pk=None):
        # Context matters here: DocumentSerializer.validate_kind reads the caller's role.
        serializer = DocumentSerializer(
            data=request.data, context=self.get_serializer_context()
        )
        serializer.is_valid(raise_exception=True)
        document = serializer.save(job=self.get_object(), uploaded_by=request.user)
        return Response(DocumentSerializer(document).data, status=status.HTTP_201_CREATED)


class ChecklistItemViewSet(viewsets.GenericViewSet):
    """Checklist items are only ever toggled, never created or deleted by the client."""

    serializer_class = ChecklistItemSerializer
    permission_classes = (JobPermission,)

    def get_queryset(self) -> QuerySet[ChecklistItem]:
        queryset = ChecklistItem.objects.select_related("job")
        user = self.request.user
        if not user.is_authenticated:
            return queryset.none()
        if not user.sees_all_jobs:
            queryset = queryset.filter(job__assigned_tech=user)
        return queryset

    @action(detail=True, methods=["post"])
    def toggle(self, request, pk=None):
        item = self.get_object()

        # Checklist items for all six stages exist from the moment a job is created, so
        # queryset scoping alone would let a Designer tick off a Coordinator's QA items.
        if STAGE_OWNER[item.stage] != request.user.role and not request.user.is_privileged:
            raise NotStageOwner(
                f"{item.stage} checklist items belong to {STAGE_OWNER[item.stage]}."
            )

        item.is_done = not item.is_done
        item.completed_by = request.user if item.is_done else None
        item.completed_at = timezone.now() if item.is_done else None
        item.save(update_fields=["is_done", "completed_by", "completed_at"])
        return Response(ChecklistItemSerializer(item).data)


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = (JobPermission,)
    search_fields = ("name", "email", "phone")
    ordering_fields = ("name", "created_at")

    def get_queryset(self) -> QuerySet[Customer]:
        """Scoped like jobs are.

        Customers carry email, phone, and billing address. Leaving this unfiltered would
        hand a Field Tech the company's entire customer book through the back door, even
        though the jobs those customers belong to are correctly hidden from them.
        """
        queryset = Customer.objects.all()
        user = self.request.user
        if not user.is_authenticated:
            return queryset.none()
        if not user.sees_all_jobs:
            queryset = queryset.filter(jobs__assigned_tech=user).distinct()
        return queryset
