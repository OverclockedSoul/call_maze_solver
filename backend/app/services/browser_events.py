from __future__ import annotations

from collections import defaultdict

from fastapi import WebSocket


class BrowserEventHub:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, call_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[call_id].add(websocket)

    def disconnect(self, call_id: str, websocket: WebSocket) -> None:
        if call_id in self._connections:
            self._connections[call_id].discard(websocket)
            if not self._connections[call_id]:
                self._connections.pop(call_id, None)

    async def broadcast(self, call_id: str, payload: dict) -> None:
        stale: list[WebSocket] = []
        for websocket in self._connections.get(call_id, set()):
            try:
                await websocket.send_json(payload)
            except Exception:
                stale.append(websocket)
        for websocket in stale:
            self.disconnect(call_id, websocket)


browser_event_hub = BrowserEventHub()
