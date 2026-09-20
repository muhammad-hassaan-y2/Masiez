export class Resources {
  public definitions = [
    { uri: 'drone://telemetry/position', name: 'Position Telemetry', description: 'Drone GPS position', mimeType: 'application/json' },
    { uri: 'drone://telemetry/battery', name: 'Battery Telemetry', description: 'Drone battery status', mimeType: 'application/json' }
  ];

  public async readResource(uri: string, telemetryStore: any) {
    const latest = telemetryStore.getLatest();
    let data;
    switch (uri) {
      case 'drone://telemetry/position': data = latest?.position || {}; break;
      case 'drone://telemetry/battery': data = latest?.battery || {}; break;
      default: throw new Error('Resource not found');
    }
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data) }] };
  }
}
