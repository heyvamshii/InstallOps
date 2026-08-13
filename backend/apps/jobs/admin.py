from django.contrib import admin

from .models import ChecklistItem, Customer, Document, Job, Note, StageTransition


class StageTransitionInline(admin.TabularInline):
    model = StageTransition
    extra = 0
    can_delete = False
    readonly_fields = ("from_stage", "to_stage", "actor", "reason", "was_forced", "created_at")

    def has_add_permission(self, request, obj=None) -> bool:
        # The audit trail is written by the transition service, never by hand.
        return False


class ChecklistItemInline(admin.TabularInline):
    model = ChecklistItem
    extra = 0
    fields = ("stage", "order", "label", "is_done", "completed_by", "completed_at")


@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    list_display = (
        "job_number",
        "customer",
        "stage",
        "on_hold",
        "priority",
        "assigned_tech",
        "target_completion_date",
        "rework_count",
    )
    list_filter = ("stage", "on_hold", "priority", "roof_type", "site_state")
    search_fields = ("job_number", "customer__name", "site_address", "permit_number")
    autocomplete_fields = ("customer",)
    readonly_fields = ("job_number", "rework_count", "created_at", "updated_at")
    inlines = (StageTransitionInline, ChecklistItemInline)
    list_select_related = ("customer", "assigned_tech")
    date_hierarchy = "created_at"


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "phone")
    search_fields = ("name", "email", "phone")


@admin.register(StageTransition)
class StageTransitionAdmin(admin.ModelAdmin):
    list_display = ("job", "from_stage", "to_stage", "actor", "was_forced", "created_at")
    list_filter = ("from_stage", "to_stage", "was_forced")
    search_fields = ("job__job_number",)
    list_select_related = ("job", "actor")

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("job", "kind", "stage", "original_name", "uploaded_by", "created_at")
    list_filter = ("kind", "stage")
    search_fields = ("job__job_number", "original_name")


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ("job", "author", "created_at")
    search_fields = ("job__job_number", "body")
