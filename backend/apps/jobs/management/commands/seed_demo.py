"""Seed a realistic demo dataset.

Deterministic by default (``--seed 42``) so screenshots, tests, and the live demo all
show the same data. Volume matters here: pagination, virtual scroll, and the dashboard
aggregates are meaningless against six rows.
"""

import random
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.constants import Role
from apps.jobs.checklists import template_for
from apps.jobs.constants import STAGE_ORDER, Priority, Stage
from apps.jobs.models import ChecklistItem, Customer, Job, Note, RoofType, StageTransition

User = get_user_model()

DEFAULT_PASSWORD = "InstallOps!2026"

DEMO_USERS = [
    ("admin", "Ada", "Okafor", Role.ADMIN, True),
    ("coordinator", "Priya", "Raman", Role.COORDINATOR, False),
    ("coordinator2", "Marcus", "Bell", Role.COORDINATOR, False),
    ("designer", "Lena", "Fischer", Role.DESIGNER, False),
    ("designer2", "Tomas", "Silva", Role.DESIGNER, False),
    ("tech", "Jordan", "Reyes", Role.FIELD_TECH, False),
    ("tech2", "Sam", "Whitfield", Role.FIELD_TECH, False),
    ("tech3", "Nia", "Bergstrom", Role.FIELD_TECH, False),
]

FIRST_NAMES = [
    "Alan", "Beatriz", "Cheng", "Dana", "Ellis", "Farah", "Gustavo", "Hana", "Ibrahim",
    "Jolene", "Kwame", "Lucia", "Mateo", "Nadia", "Oskar", "Priscilla", "Quinn", "Rosa",
    "Silas", "Tara", "Umar", "Vera", "Wesley", "Ximena", "Yusuf", "Zoë",
]
LAST_NAMES = [
    "Alvarez", "Brennan", "Castellanos", "Duval", "Eriksen", "Fontaine", "Gallagher",
    "Haddad", "Iverson", "Jorgensen", "Kaur", "Lindqvist", "Moreau", "Nakamura",
    "Oyelaran", "Petrov", "Quintero", "Rossi", "Steinberg", "Tanaka", "Ubaldo",
    "Vasquez", "Winters", "Yamada", "Zielinski",
]
STREETS = [
    "Alder", "Bayview", "Cedar Ridge", "Dunhill", "El Camino", "Foothill", "Granite",
    "Harborview", "Ivy", "Juniper", "Kestrel", "Larkspur", "Mesa Verde", "Nightingale",
    "Orchard", "Pinecrest", "Quarry", "Redwood", "Sagebrush", "Tumbleweed",
]
LOCATIONS = [
    ("Fremont", "CA", "94536", "PG&E", "City of Fremont Building Division"),
    ("San Jose", "CA", "95112", "PG&E", "San Jose Dept. of Planning & Building"),
    ("Bakersfield", "CA", "93301", "PG&E", "Kern County Building Inspection"),
    ("Riverside", "CA", "92501", "SCE", "Riverside County Building & Safety"),
    ("Pasadena", "CA", "91101", "SCE", "Pasadena Permit Center"),
    ("Chula Vista", "CA", "91910", "SDG&E", "Chula Vista Development Services"),
    ("Austin", "TX", "78701", "Austin Energy", "Austin Development Services Dept."),
    ("Round Rock", "TX", "78664", "Oncor", "Round Rock Building Inspections"),
    ("Plano", "TX", "75023", "Oncor", "Plano Building Inspections"),
    ("Phoenix", "AZ", "85004", "APS", "Phoenix Planning & Development"),
    ("Tucson", "AZ", "85701", "TEP", "Tucson Development Services"),
    ("Henderson", "NV", "89002", "NV Energy", "Henderson Building & Fire Safety"),
]

# A realistic funnel: work piles up in Permitting, and most historical jobs are closed.
STAGE_DISTRIBUTION = {
    Stage.INTAKE: 18,
    Stage.DESIGN: 26,
    Stage.PERMITTING: 34,
    Stage.INSTALLATION: 27,
    Stage.QA: 16,
    Stage.COMPLETE: 89,
}

NOTE_TEMPLATES = [
    "Customer asked for an update on the timeline.",
    "Left voicemail with the AHJ about plan-check status.",
    "Utility interconnection portal was down; retrying tomorrow.",
    "Homeowner requested the array be shifted off the street-facing plane.",
    "Roof is older than recorded at intake — flagged for the designer.",
    "Crew rescheduled: access blocked by the driveway resurfacing.",
    "Battery lead time pushed out two weeks by the distributor.",
    "Inspector wants the rapid-shutdown label relocated.",
]

REWORK_REASONS = [
    "Inspection failed: rapid shutdown labeling not per NEC 690.56.",
    "Inspection failed: conduit not properly strapped on the south run.",
    "Inspection failed: grounding electrode conductor undersized.",
    "Inspection failed: array setback from ridge below AHJ minimum.",
    "Internal QA rejected: two modules seated on damaged flashing.",
]


class Command(BaseCommand):
    help = "Create demo users, customers, and a realistic spread of solar jobs."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--seed", type=int, default=42, help="RNG seed for reproducibility.")
        parser.add_argument(
            "--password", default=DEFAULT_PASSWORD, help="Password for every demo user."
        )
        parser.add_argument(
            "--flush",
            action="store_true",
            help="Delete existing jobs, customers, and demo users first.",
        )

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        rng = random.Random(options["seed"])

        if options["flush"]:
            self.stdout.write("Flushing existing demo data...")
            Job.objects.all().delete()
            Customer.objects.all().delete()
            User.objects.filter(username__in=[u[0] for u in DEMO_USERS]).delete()

        users = self._create_users(options["password"])
        customers = self._create_customers(rng)
        self._create_jobs(rng, users, customers)

        self.stdout.write(
            self.style.SUCCESS(
                f"\nSeeded {Job.objects.count()} jobs, {Customer.objects.count()} customers, "
                f"{User.objects.count()} users, "
                f"{StageTransition.objects.count()} stage transitions."
            )
        )
        self.stdout.write(f"\nDemo logins (password: {options['password']}):")
        for username, _, _, role, _ in DEMO_USERS[:6]:
            self.stdout.write(f"  {username:<14} {role}")

    # ------------------------------------------------------------------ users

    def _create_users(self, password: str) -> dict[str, list]:
        by_role: dict[str, list] = {role: [] for role in Role.values}

        for username, first, last, role, is_super in DEMO_USERS:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "first_name": first,
                    "last_name": last,
                    "email": f"{username}@installops.demo",
                    "role": role,
                    "is_staff": is_super,
                    "is_superuser": is_super,
                },
            )
            if created:
                user.set_password(password)
                user.save(update_fields=["password"])
            by_role[user.role].append(user)

        return by_role

    # -------------------------------------------------------------- customers

    def _create_customers(self, rng: random.Random) -> list[Customer]:
        existing = list(Customer.objects.all())
        if existing:
            return existing

        customers = []
        for index in range(90):
            first = rng.choice(FIRST_NAMES)
            last = rng.choice(LAST_NAMES)
            customers.append(
                Customer(
                    name=f"{first} {last}",
                    email=f"{first.lower()}.{last.lower()}{index}@example.com",
                    phone=f"({rng.randint(200, 989)}) {rng.randint(200, 999)}-{rng.randint(1000, 9999)}",
                    billing_address=f"{rng.randint(100, 9899)} {rng.choice(STREETS)} St",
                )
            )
        return Customer.objects.bulk_create(customers)

    # ------------------------------------------------------------------- jobs

    def _create_jobs(self, rng: random.Random, users: dict, customers: list[Customer]) -> None:
        coordinators = users[Role.COORDINATOR]
        designers = users[Role.DESIGNER]
        techs = users[Role.FIELD_TECH]
        now = timezone.now()

        for stage, count in STAGE_DISTRIBUTION.items():
            for _ in range(count):
                city, state, postal, utility, ahj = rng.choice(LOCATIONS)
                stage_index = STAGE_ORDER.index(stage)

                # Older jobs sit further along the pipeline.
                age_days = rng.randint(5 + stage_index * 12, 30 + stage_index * 25)
                created_at = now - timedelta(days=age_days)

                panel_count = rng.randint(12, 42)
                job = Job(
                    customer=rng.choice(customers),
                    stage=stage,
                    priority=rng.choices(
                        [Priority.LOW, Priority.NORMAL, Priority.HIGH, Priority.URGENT],
                        weights=[10, 60, 22, 8],
                    )[0],
                    on_hold=stage != Stage.COMPLETE and rng.random() < 0.07,
                    site_address=f"{rng.randint(100, 9899)} {rng.choice(STREETS)} {rng.choice(['St', 'Ave', 'Dr', 'Ct'])}",
                    site_city=city,
                    site_state=state,
                    site_postal_code=postal,
                    utility_company=utility,
                    ahj=ahj,
                    panel_count=panel_count,
                    system_size_kw=Decimal(panel_count) * Decimal("0.41"),
                    battery_count=rng.choices([0, 1, 2], weights=[55, 35, 10])[0],
                    roof_type=rng.choice(RoofType.values),
                    created_by=rng.choice(coordinators),
                    assigned_designer=rng.choice(designers) if stage_index >= 1 else None,
                    assigned_tech=rng.choice(techs) if stage_index >= 2 else None,
                    permit_number=(
                        f"{state}-{rng.randint(100000, 999999)}" if stage_index >= 3 else ""
                    ),
                    target_completion_date=(created_at + timedelta(days=rng.randint(45, 120))).date(),
                )
                if job.on_hold:
                    job.hold_reason = rng.choice(
                        [
                            "Awaiting customer decision on battery add-on",
                            "Utility interconnection queue backlog",
                            "Roof repair required before install",
                        ]
                    )
                job.save()

                Job.objects.filter(pk=job.pk).update(created_at=created_at)

                self._create_history(rng, job, stage_index, created_at, coordinators, designers, techs)
                self._create_checklist(job, stage, stage_index, rng)

                for _ in range(rng.choices([0, 1, 2, 3], weights=[40, 30, 20, 10])[0]):
                    Note.objects.create(
                        job=job,
                        author=rng.choice(coordinators + techs),
                        body=rng.choice(NOTE_TEMPLATES),
                    )

    def _create_history(
        self,
        rng: random.Random,
        job: Job,
        stage_index: int,
        created_at,
        coordinators: list,
        designers: list,
        techs: list,
    ) -> None:
        """Backfill the audit trail so the timeline on the detail screen is real."""
        actor_for = {
            Stage.INTAKE: coordinators,
            Stage.DESIGN: designers,
            Stage.PERMITTING: coordinators,
            Stage.INSTALLATION: techs,
            Stage.QA: coordinators,
            Stage.COMPLETE: coordinators,
        }

        moment = created_at
        rework_count = 0

        for index in range(stage_index):
            from_stage = STAGE_ORDER[index]
            to_stage = STAGE_ORDER[index + 1]
            moment += timedelta(days=rng.randint(2, 18), hours=rng.randint(0, 20))

            transition = StageTransition.objects.create(
                job=job,
                from_stage=from_stage,
                to_stage=to_stage,
                actor=rng.choice(actor_for[from_stage]),
                was_forced=rng.random() < 0.03,
            )
            StageTransition.objects.filter(pk=transition.pk).update(created_at=moment)

            # ~15% of jobs that reached QA failed inspection once and went back.
            if from_stage == Stage.QA and to_stage == Stage.COMPLETE and rng.random() < 0.15:
                moment += timedelta(days=rng.randint(1, 6))
                failed = StageTransition.objects.create(
                    job=job,
                    from_stage=Stage.QA,
                    to_stage=Stage.INSTALLATION,
                    actor=rng.choice(coordinators),
                    reason=rng.choice(REWORK_REASONS),
                )
                StageTransition.objects.filter(pk=failed.pk).update(created_at=moment)
                rework_count += 1

        if rework_count:
            Job.objects.filter(pk=job.pk).update(rework_count=rework_count)

    def _create_checklist(self, job: Job, stage: str, stage_index: int, rng: random.Random) -> None:
        items = []
        for index, current_stage in enumerate(STAGE_ORDER):
            for order, label in enumerate(template_for(current_stage)):
                if index < stage_index:
                    is_done = True  # completed stages are fully checked off
                elif index == stage_index:
                    is_done = rng.random() < 0.45  # current stage is partly done
                else:
                    is_done = False
                items.append(
                    ChecklistItem(
                        job=job,
                        stage=current_stage,
                        label=label,
                        order=order,
                        is_done=is_done,
                        completed_at=timezone.now() if is_done else None,
                    )
                )
        ChecklistItem.objects.bulk_create(items)
