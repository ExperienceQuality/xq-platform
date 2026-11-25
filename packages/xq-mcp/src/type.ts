import { z } from 'zod'

export const HANDLER_OUTPUT_SCHEMA = z.object({
  instruction: z.string().describe('The instruction that hint LLM to do next'),
  response: z
    .record(z.string(), z.any())
    .optional()
    .describe('The response from handler of the tool'),
})

export type ToolHandlerOutput = z.infer<typeof HANDLER_OUTPUT_SCHEMA>
export type ToolHandler = (input: any) => Promise<ToolHandlerOutput>

export type ToolDefinition = {
  name: string
  description: string
  inputSchema: z.ZodObject<any>
  handler: ToolHandler
}

/**
 * An interface represents a provider of XQ tools that can be registered with an MCP server.
 */
export interface XQToolProvider {
  provide(): ToolDefinition[]
}
