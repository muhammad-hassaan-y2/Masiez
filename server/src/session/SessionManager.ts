export class SessionManager {
  private sessions = new Map<string, any>();

  public createSession(): string {
    const id = Math.random().toString(36).substring(7);
    this.sessions.set(id, { id, startTime: Date.now(), commands: [], telemetry: [] });
    return id;
  }

  public endSession(id: string) {
    this.sessions.delete(id);
  }

  public getSession(id: string) {
    return this.sessions.get(id);
  }

  public logCommand(id: string, command: any, response: any) {
    const session = this.sessions.get(id);
    if (session) {
      session.commands.push({ time: Date.now(), command, response });
    }
  }

  public logTelemetry(id: string, telemetry: any) {
    const session = this.sessions.get(id);
    if (session) {
      if (session.telemetry.length === 0 || Date.now() - session.telemetry[session.telemetry.length - 1].time > 1000) {
        session.telemetry.push({ time: Date.now(), telemetry });
      }
    }
  }
}
