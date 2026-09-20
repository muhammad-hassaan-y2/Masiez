export class MCPServer {
  private tools: any;
  private resources: any;
  private droneCommands: any;
  private telemetryStore: any;

  constructor(tools: any, resources: any, droneCommands: any, telemetryStore: any) {
    this.tools = tools;
    this.resources = resources;
    this.droneCommands = droneCommands;
    this.telemetryStore = telemetryStore;
  }

  public async handleRequest(req: any): Promise<any> {
    if (req.jsonrpc !== '2.0' || !req.method) {
      return { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: req.id };
    }

    try {
      let result;
      switch (req.method) {
        case 'tools/list':
          result = { tools: this.tools.definitions };
          break;
        case 'tools/call':
          result = await this.tools.executeTool(req.params.name, req.params.arguments, this.droneCommands);
          break;
        case 'resources/list':
          result = { resources: this.resources.definitions };
          break;
        case 'resources/read':
          result = await this.resources.readResource(req.params.uri, this.telemetryStore);
          break;
        case 'prompts/list':
          result = { prompts: [] };
          break;
        case 'prompts/get':
          result = { messages: [] };
          break;
        default:
          return { jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' }, id: req.id };
      }
      return { jsonrpc: '2.0', result, id: req.id };
    } catch (e: any) {
      return { jsonrpc: '2.0', error: { code: -32000, message: e.message }, id: req.id };
    }
  }
}
