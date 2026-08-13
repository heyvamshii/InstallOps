from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ("username", "get_full_name", "email", "role", "is_active", "is_staff")
    list_filter = ("role", "is_active", "is_staff")
    search_fields = ("username", "first_name", "last_name", "email")
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("InstallOps", {"fields": ("role", "phone")}),
    )
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (
        ("InstallOps", {"fields": ("role", "phone")}),
    )
