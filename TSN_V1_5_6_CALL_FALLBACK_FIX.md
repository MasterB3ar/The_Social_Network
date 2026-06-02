# TSN V1.5.6 — Call Fallback Fix

- getUserMedia() failure no longer closes calls automatically.
- If camera fails, video calls fall back to audio-only when possible.
- If microphone/camera both fail, the call continues in fallback mode instead of closing.
- Call UI now shows the real peer name instead of “Den anden person”.
- Mute/camera buttons show a clear message when no local mic/camera track exists.
