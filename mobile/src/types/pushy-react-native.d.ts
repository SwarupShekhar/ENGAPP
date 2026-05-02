/**
 * Ambient types for pushy-react-native (package ships incomplete / non-resolved typings when
 * tsconfig "types" is restricted to ["react"]).
 */
declare module "pushy-react-native" {
  export type PushyPayload = Record<string, unknown> & {
    title?: string;
    message?: string;
    body?: string;
    type?: string;
    sessionId?: string;
    conversationId?: string;
  };

  interface PushyStatic {
    listen(): void;
    register(): Promise<string>;
    unregister(): void;
    setNotificationListener(
      callback: (data: PushyPayload) => void | Promise<void>,
    ): void;
    setNotificationClickListener(
      callback: (data: PushyPayload) => void | Promise<void>,
    ): void;
    notify(title: string, message: string, data: PushyPayload): void;
    setBadge(count: number): void;
    getBadge(): Promise<number>;
    checkForUpdate(): Promise<{ available: boolean }>;
  }

  const Pushy: PushyStatic;
  export default Pushy;
}
