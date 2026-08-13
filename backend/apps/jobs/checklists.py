"""Per-stage checklist templates for residential solar + storage.

Data, not code — a new product line means a new dict entry, which is the
"configurable for multiple product lines" story without building a rules engine.
"""

from .constants import Stage

CHECKLIST_TEMPLATES: dict[str, tuple[str, ...]] = {
    Stage.INTAKE: (
        "Signed contract on file",
        "Customer contact details confirmed",
        "Site address verified",
        "Utility account number captured",
        "Roof age and type recorded",
    ),
    Stage.DESIGN: (
        "Site survey completed",
        "Shading analysis run",
        "Array layout drafted",
        "String sizing and inverter selection",
        "Structural load check",
        "Design package approved by customer",
    ),
    Stage.PERMITTING: (
        "AHJ requirements checked",
        "Permit application submitted",
        "Utility interconnection application submitted",
        "Permit approved",
        "Interconnection approval received",
    ),
    Stage.INSTALLATION: (
        "Materials staged on site",
        "Racking installed",
        "Modules mounted",
        "Inverter and rapid shutdown installed",
        "Battery installed and commissioned",
        "DC/AC wiring terminated",
        "Site photos uploaded",
        "Site cleaned and customer walkthrough",
    ),
    Stage.QA: (
        "Internal QA walkthrough",
        "AHJ inspection scheduled",
        "AHJ inspection passed",
        "Utility PTO submitted",
    ),
    Stage.COMPLETE: (
        "Permission to operate received",
        "System monitoring active",
        "As-built documents filed",
        "Customer handover pack sent",
    ),
}


def template_for(stage: str) -> tuple[str, ...]:
    return CHECKLIST_TEMPLATES.get(stage, ())
