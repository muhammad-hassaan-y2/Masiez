export class Tools {
  public definitions = [
    { name: 'arm_and_takeoff', description: 'Arm and takeoff drone', inputSchema: { type: 'object', properties: { altitude: { type: 'number' } }, required: ['altitude'] } },
    { name: 'land', description: 'Land drone', inputSchema: { type: 'object', properties: {} } },
    { name: 'return_to_launch', description: 'Return to launch', inputSchema: { type: 'object', properties: {} } }
  ];

  public async executeTool(name: string, params: any, droneCommands: any) {
    let command;
    switch (name) {
      case 'arm_and_takeoff': command = { type: 'ARM_AND_TAKEOFF', params }; break;
      case 'land': command = { type: 'LAND', params }; break;
      case 'return_to_launch': command = { type: 'RETURN_TO_LAUNCH', params }; break;
      default: throw new Error('Tool not found');
    }
    const response = await droneCommands.execute(command);
    return { content: [{ type: 'text', text: JSON.stringify(response) }] };
  }
}
