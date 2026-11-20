import "server-only";

// Interface for a "bot joins a live meeting and records it" provider (Recall.ai style).
// NOT implemented and no vendor is subscribed: see docs/qa/zoom.md and the decision note
// in docs/recordings.md. A future adapter creates a bot for a meeting URL, receives a
// webhook when the recording is ready, and feeds the file/URL into createRecordingFromLink().
export interface MeetingBotProvider {
  id: string;
  // Send a bot to a Zoom/Meet/Teams URL; returns the vendor's bot id.
  joinMeeting(input: { meetingUrl: string; botName: string; webhookUrl: string }): Promise<{ botId: string }>;
  // Called from the vendor webhook: where to download the finished recording.
  getRecording(botId: string): Promise<{ downloadUrl: string; durationSeconds?: number } | null>;
}
