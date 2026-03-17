from django.contrib import admin
from .models import ReferralProspect


@admin.register(ReferralProspect)
class ReferralProspectAdmin(admin.ModelAdmin):
    list_display = ('fname', 'lname', 'email', 'phone', 'referrer', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('fname', 'lname', 'email', 'phone', 'referrer__fname', 'referrer__lname', 'referrer__email')

