"""Vision microservice.

Joins a LiveKit room as a subscriber, pulls the drone camera track, runs the
detector on each frame, and emits predictions back on the room's data channel.

Environment:
    LIVEKIT_URL        e.g. ws://livekit:7880
    LIVEKIT_API_KEY    API key
    LIVEKIT_API_SECRET API secret
    LIVEKIT_ROOM       room name (default: drone)
    LIVEKIT_IDENTITY   participant identity (default: vision)
    VISION_FPS         max inferences per second (default: 5)
"""

from __future__ import annotations

import asyncio
import json
import os
import time

import numpy as np
from livekit import api, rtc

from model import Detector, load_detector

LIVEKIT_URL = os.environ.get("LIVEKIT_URL", "ws://livekit:7880")
LIVEKIT_API_KEY = os.environ.get("LIVEKIT_API_KEY", "devkey")
LIVEKIT_API_SECRET = os.environ.get("LIVEKIT_API_SECRET", "devsecret_devsecret_devsecret_1234")
LIVEKIT_ROOM = os.environ.get("LIVEKIT_ROOM", "drone")
LIVEKIT_IDENTITY = os.environ.get("LIVEKIT_IDENTITY", "vision")
VISION_FPS = float(os.environ.get("VISION_FPS", "5"))


def _token() -> str:
    return (
        api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(LIVEKIT_IDENTITY)
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=LIVEKIT_ROOM,
                can_publish=False,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
        .to_jwt()
    )


async def _run_video(detector: Detector, track: rtc.Track, room: rtc.Room) -> None:
    stream = rtc.VideoStream(track)
    frame_interval = 1.0 / VISION_FPS
    last = 0.0
    async for event in stream:
        now = time.monotonic()
        if now - last < frame_interval:
            continue
        last = now

        frame = event.frame
        rgb = frame.convert(rtc.VideoBufferType.RGB24)
        image = np.frombuffer(rgb.data, dtype=np.uint8).reshape(
            (rgb.height, rgb.width, 3)
        )

        detections = detector.predict(image)
        payload = {
            "type": "ai:vision_annotations",
            "detections": [d.to_dict() for d in detections],
            "width": rgb.width,
            "height": rgb.height,
            "timestamp": int(time.time() * 1000),
        }
        await room.local_participant.publish_data(
            json.dumps(payload).encode("utf-8"), reliable=True
        )
    await stream.aclose()


async def main() -> None:
    detector = load_detector()
    room = rtc.Room()

    @room.on("track_subscribed")
    def on_track_subscribed(
        track: rtc.Track,
        publication: rtc.RemoteTrackPublication,
        participant: rtc.RemoteParticipant,
    ) -> None:
        if track.kind == rtc.TrackKind.KIND_VIDEO:
            asyncio.create_task(_run_video(detector, track, room))

    await room.connect(LIVEKIT_URL, _token())
    print(f"[vision] connected to {LIVEKIT_URL} room={LIVEKIT_ROOM}")

    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
