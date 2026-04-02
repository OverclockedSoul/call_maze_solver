declare module "@telnyx/webrtc" {
  export class TelnyxRTC {
    constructor(options: { login_token: string });
    remoteElement?: string | HTMLAudioElement;
    connect(): void;
    disconnect(): void;
    on(event: string, callback: (...args: any[]) => void): void;
  }
}
