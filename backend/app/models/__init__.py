from importlib import import_module


__all__ = ["Call", "CallEvent", "OperatorSession", "Recording", "TranscriptEntry"]

_MODEL_MODULES = {
    "Call": "app.models.call",
    "CallEvent": "app.models.call_event",
    "OperatorSession": "app.models.operator_session",
    "Recording": "app.models.recording",
    "TranscriptEntry": "app.models.transcript",
}


def __getattr__(name: str):
    if name not in _MODEL_MODULES:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module = import_module(_MODEL_MODULES[name])
    return getattr(module, name)
