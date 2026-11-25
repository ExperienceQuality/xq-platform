import type { XQToolProvider, ToolDefinition } from '../type.js'
import { z } from 'zod'

class Ping implements XQToolProvider {
  provide(): ToolDefinition[] {
    return [
      {
        name: 'ping',
        description: 'Ping the server',
        inputSchema: z.object({ message: z.string().describe('The message to ping the server') }),
        handler: async (input: any) => {
          return {
            instruction: `server received your message: ${input.message}`,
            response: { message: `ping ${input.message}` },
          }
        },
      },
    ]
  }
}

export default new Ping()
