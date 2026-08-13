"""Core domain tables.

The lifecycle rules these support live in ``constants.py`` and are enforced in
``services.py`` — never in ``save()``. Keeping transition logic out of the
model means it can be unit-tested without touching the ORM, and means no code path can
quietly move a job by assigning to ``job.stage``.
"""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from django.db import models
from django.utils import timezone

from .constants import Priority, Stage
from .numbering import generate_job_number


class RoofType(models.TextChoices):
    COMP_SHINGLE = "COMP_SHINGLE", "Composition shingle"
    TILE = "TILE", "Tile"
    METAL = "METAL", "Metal"
    FLAT_TPO = "FLAT_TPO", "Flat / TPO"
    GROUND_MOUNT = "GROUND_MOUNT", "Ground mount"


class Customer(models.Model):
    name = models.CharField(max_length=120, db_index=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    billing_address = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("name",)

    def __str__(self) -> str:
        return self.name


class Job(models.Model):
    """One solar installation, from signed contract to closed-out install."""

    job_number = models.CharField(max_length=20, unique=True, editable=False)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="jobs")

    stage = models.CharField(
        max_length=20, choices=Stage.choices, default=Stage.INTAKE, db_index=True
    )
    on_hold = models.BooleanField(default=False, db_index=True)
    hold_reason = models.CharField(max_length=255, blank=True)
    priority = models.CharField(
        max_length=10, choices=Priority.choices, default=Priority.NORMAL, db_index=True
    )

    # Site
    site_address = models.CharField(max_length=255)
    site_city = models.CharField(max_length=80)
    site_state = models.CharField(max_length=2)
    site_postal_code = models.CharField(max_length=10)

    # Solar specifics
    system_size_kw = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    panel_count = models.PositiveIntegerField(null=True, blank=True)
    battery_count = models.PositiveIntegerField(default=0)
    roof_type = models.CharField(max_length=20, choices=RoofType.choices, blank=True)
    utility_company = models.CharField(max_length=120, blank=True)
    ahj = models.CharField(
        max_length=120,
        blank=True,
        verbose_name="Authority having jurisdiction",
        help_text="The permitting body for the site's jurisdiction.",
    )
    permit_number = models.CharField(max_length=60, blank=True)

    # Assignment
    assigned_designer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="designer_jobs",
    )
    assigned_tech = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tech_jobs",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_jobs",
    )

    target_completion_date = models.DateField(null=True, blank=True, db_index=True)
    rework_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            # Queue views: "everything in Permitting, soonest due first"
            models.Index(fields=["stage", "target_completion_date"], name="job_stage_due_idx"),
            # Field Tech scope: "my jobs, by stage"
            models.Index(fields=["assigned_tech", "stage"], name="job_tech_stage_idx"),
            models.Index(fields=["customer", "stage"], name="job_customer_stage_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(rework_count__gte=0), name="job_rework_count_non_negative"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.job_number} — {self.customer.name}"

    def save(self, *args, **kwargs):
        if not self.job_number:
            self.job_number = generate_job_number()
        super().save(*args, **kwargs)

    @property
    def is_terminal(self) -> bool:
        return self.stage == Stage.COMPLETE

    @property
    def is_overdue(self) -> bool:
        if not self.target_completion_date or self.is_terminal:
            return False
        return self.target_completion_date < timezone.now().date()


class StageTransition(models.Model):
    """Append-only audit trail. Rows are never updated or deleted.

    This table is the answer to "where did this job stall?", so it records the actor and
    reason even when the move was an Admin override.
    """

    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name="transitions")
    from_stage = models.CharField(max_length=20, choices=Stage.choices)
    to_stage = models.CharField(max_length=20, choices=Stage.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="transitions",
    )
    reason = models.CharField(max_length=500, blank=True)
    was_forced = models.BooleanField(
        default=False, help_text="Admin overrode the stage-ownership rule."
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("created_at", "id")
        indexes = [models.Index(fields=["job", "created_at"], name="transition_job_time_idx")]

    def __str__(self) -> str:
        return f"{self.job.job_number}: {self.from_stage} → {self.to_stage}"


class DocumentKind(models.TextChoices):
    DESIGN_PACKAGE = "DESIGN_PACKAGE", "Design package"
    PERMIT = "PERMIT", "Permit"
    SITE_PHOTO = "SITE_PHOTO", "Site photo"
    INSPECTION = "INSPECTION", "Inspection report"
    OTHER = "OTHER", "Other"


def validate_document_size(value) -> None:
    """Cap upload size.

    Without this any authenticated user with access to a job could exhaust the
    application's storage a single request at a time.
    """
    limit = settings.MAX_DOCUMENT_SIZE_BYTES
    if value.size > limit:
        raise ValidationError(
            f"File is {value.size // 1024 // 1024} MB; the limit is {limit // 1024 // 1024} MB."
        )


class Document(models.Model):
    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name="documents")
    kind = models.CharField(max_length=20, choices=DocumentKind.choices)
    stage = models.CharField(
        max_length=20,
        choices=Stage.choices,
        help_text="The stage this document was produced for.",
    )
    file = models.FileField(
        upload_to="job-documents/%Y/%m/",
        blank=True,
        validators=[
            FileExtensionValidator(allowed_extensions=list(settings.ALLOWED_DOCUMENT_EXTENSIONS)),
            validate_document_size,
        ],
    )
    original_name = models.CharField(max_length=255)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="uploads"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.get_kind_display()} — {self.original_name}"


class ChecklistItem(models.Model):
    """Per-stage work items. Templates are defined in ``checklists.py``."""

    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name="checklist_items")
    stage = models.CharField(max_length=20, choices=Stage.choices, db_index=True)
    label = models.CharField(max_length=200)
    order = models.PositiveSmallIntegerField(default=0)
    is_done = models.BooleanField(default=False)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="completed_checklist_items",
    )
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("stage", "order", "id")
        constraints = [
            models.UniqueConstraint(
                fields=["job", "stage", "label"], name="checklist_item_unique_per_stage"
            ),
        ]

    def __str__(self) -> str:
        return f"[{'x' if self.is_done else ' '}] {self.label}"


class Note(models.Model):
    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name="notes")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="notes"
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.job.job_number}: {self.body[:40]}"
