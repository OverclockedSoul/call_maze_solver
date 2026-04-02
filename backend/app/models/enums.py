from enum import Enum


class CallStatus(str, Enum):
    QUEUED = "queued"
    DIALING = "dialing"
    IVR = "ivr"
    AGENT_ACTIVE = "agent_active"
    HANDOFF_REQUESTED = "handoff_requested"
    HUMAN_JOINING = "human_joining"
    HUMAN_ACTIVE = "human_active"
    COMPLETED = "completed"
    FAILED = "failed"


class DisclosurePolicy(str, Enum):
    ALWAYS = "always"
    CONDITIONAL = "conditional"
    NEVER_WITHOUT_REVIEW = "never_without_review"


class UISupportedLanguage(str, Enum):
    EN = "en"
    ES = "es"


class CallLanguage(str, Enum):
    EN_US = "en-US"
    ES_ES = "es-ES"
