import http from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { registerTools } from './tools';

const MCP_PORT = 2525;
let httpServer: http.Server | null = null;

export function activate()
{
	// Stateless mode: every request gets a fresh McpServer + transport, so any
	// number of MCP clients can connect, disconnect, and reconnect independently.
	// A single shared transport would reject every client after the first with
	// "Server already initialized".
	httpServer = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) =>
	{
		try
		{
			const mcpServer = new McpServer({ name: 'mailspring', version: '2.0.0' });
			registerTools(mcpServer);

			const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

			res.on('close', () =>
			{
				transport.close();
				mcpServer.close();
			});

			await mcpServer.connect(transport);
			await transport.handleRequest(req, res);
		}
		catch (error)
		{
			console.error('[mailspring-mcp] Error handling request:', error);
			if (!res.headersSent)
			{
				res.writeHead(500, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({
					jsonrpc: '2.0',
					error: { code: -32603, message: 'Internal server error' },
					id: null,
				}));
			}
		}
	});

	httpServer.on('error', (err: NodeJS.ErrnoException) =>
	{
		if (err.code === 'EADDRINUSE')
		{
			console.log('[mailspring-mcp] Port already in use, server likely running in another window');
			return;
		}
		console.error('[mailspring-mcp] Server error:', err);
	});

	httpServer.listen(MCP_PORT, '127.0.0.1', () =>
	{
		console.log(`[mailspring-mcp] MCP server listening on http://127.0.0.1:${MCP_PORT}/mcp`);
	});
}

export function serialize() { }

export function deactivate()
{
	if (httpServer)
	{
		httpServer.close();
		httpServer = null;
	}
}
