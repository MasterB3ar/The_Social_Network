# TSN V1.5.4 — Voice/Video Calls

This update adds private voice/video calls between online TSN users.

## Added

- Voice call button in private chat.
- Video call button in private chat.
- Incoming call popup with accept/decline.
- WebRTC peer-to-peer media connection.
- Socket.IO signalling for call offer/answer/ICE candidates.
- Mute microphone button.
- Toggle camera button for video calls.
- End-call button.
- Mobile-friendly call overlay.

## Notes

Calls require HTTPS and browser permission for microphone/camera. Render HTTPS works. On some strict school/mobile networks, WebRTC can be blocked by the network.

No new environment variables are required.
