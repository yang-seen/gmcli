#!/usr/bin/env npx tsx

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { GmailService } from './gmail-service.js';

const server = new Server(
  {
    name: 'mailcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const gmailService = new GmailService();

const tools: Tool[] = [
  {
    name: 'gmail_accounts',
    description:
      'Manage Gmail accounts: list, add, or remove accounts. Add account with automatic OAuth2 setup.\n\n**IMPORTANT FOR LLMs**: When adding an account, you MUST first instruct the user to:\n\n1. **Create Google Cloud Project**:\n   - Go to https://console.cloud.google.com/\n   - Create new project or select existing\n   - Enable Gmail API (search "Gmail API" and click Enable)\n\n2. **Create OAuth2 Credentials**:\n   - Go to Credentials → Create Credentials → OAuth 2.0 Client ID\n   - Choose "Desktop application" as application type\n   - **DOWNLOAD the JSON file** (preferred for security)\n   - OR copy Client ID and Client Secret (less secure)\n\n3. **Required OAuth2 Scopes**: https://www.googleapis.com/auth/gmail.modify\n\n4. **Provide to this tool**:\n   - Account name (your choice)\n   - Gmail address\n   - **PREFERRED**: Path to downloaded JSON credentials file\n   - **ALTERNATIVE**: Client ID and Client Secret directly\n\n**JSON file is PREFERRED** because it keeps credentials out of command history and context.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'add', 'remove'],
          description: 'Action to perform on accounts',
        },
        name: {
          type: 'string',
          description: 'Account name/identifier (required for add/remove)',
        },
        username: {
          type: 'string',
          description: 'Gmail address (required for add)',
        },
        credentialsFile: {
          type: 'string',
          description: 'Path to downloaded Google Cloud Console credentials JSON file (PREFERRED - keeps secrets secure)',
        },
        clientId: {
          type: 'string',
          description: 'OAuth2 client ID from Google Cloud Console (only if not using credentialsFile)',
        },
        clientSecret: {
          type: 'string',
          description: 'OAuth2 client secret from Google Cloud Console (only if not using credentialsFile)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'gmail_search',
    description:
      'Search Gmail threads with pagination. Uses Gmail query syntax (from:someone@gmail.com, is:unread, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Account name to search in',
        },
        query: {
          type: 'string',
          description: 'Gmail search query (supports Gmail query syntax)',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results (default: 10)',
        },
        pageToken: {
          type: 'string',
          description: 'Page token for pagination (optional)',
        },
      },
      required: ['account', 'query'],
    },
  },
  {
    name: 'gmail_thread',
    description: 'Get complete Gmail thread with all messages and attachment metadata. If downloadAttachments=true, returns ONLY the downloaded attachments (not the thread data).',
    inputSchema: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Account name',
        },
        threadId: {
          type: 'string',
          description: 'Thread ID to retrieve',
        },
        downloadAttachments: {
          type: 'boolean',
          description: 'If true, download all attachments and return ONLY attachment metadata (not thread data)',
        },
      },
      required: ['account', 'threadId'],
    },
  },
  {
    name: 'gmail_attachments',
    description: 'Batch download Gmail attachments. Downloads to ~/.mailcp/attachments/',
    inputSchema: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Account name',
        },
        attachments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              messageId: {
                type: 'string',
                description: 'Message ID containing the attachment',
              },
              attachmentId: {
                type: 'string',
                description: 'Attachment ID from Gmail API',
              },
              filename: {
                type: 'string',
                description: 'Attachment filename',
              },
            },
            required: ['messageId', 'attachmentId', 'filename'],
          },
          description: 'Array of attachments to download',
        },
      },
      required: ['account', 'attachments'],
    },
  },
  {
    name: 'gmail_labels',
    description:
      'Universal label operations: apply/remove labels (read/unread, archive, star, custom labels) to multiple threads',
    inputSchema: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Account name',
        },
        threadIds: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Array of thread IDs to modify',
        },
        addLabels: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Labels to add (UNREAD, STARRED, INBOX, custom labels)',
        },
        removeLabels: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Labels to remove (UNREAD, STARRED, INBOX, custom labels)',
        },
      },
      required: ['account', 'threadIds'],
    },
  },
  {
    name: 'gmail_drafts',
    description: 'Manage Gmail drafts: create, update, get, list, or delete drafts',
    inputSchema: {
      type: 'object',
      properties: {
        account: {
          type: 'string',
          description: 'Account name',
        },
        action: {
          type: 'string',
          enum: ['create', 'update', 'get', 'list', 'delete'],
          description: 'Action to perform on drafts',
        },
        draftId: {
          type: 'string',
          description: 'Draft ID (required for update/get/delete)',
        },
        threadId: {
          type: 'string',
          description: 'Thread ID for reply (optional for create)',
        },
        to: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Recipients (required for create)',
        },
        cc: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'CC recipients (optional)',
        },
        bcc: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'BCC recipients (optional)',
        },
        subject: {
          type: 'string',
          description: 'Email subject (required for create)',
        },
        body: {
          type: 'string',
          description: 'Email body content (required for create/update)',
        },
      },
      required: ['account', 'action'],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error('Missing arguments');
  }

  try {
    switch (name) {
      case 'gmail_accounts': {
        const action = args.action as string;

        switch (action) {
          case 'list': {
            const accounts = gmailService.listAccounts();
            return {
              content: [
                {
                  type: 'text',
                  text:
                    accounts.length > 0
                      ? `Configured Gmail accounts:\n${accounts.map((acc) => `- ${acc.name} (${acc.username})`).join('\n')}`
                      : 'No Gmail accounts configured',
                },
              ],
            };
          }

          case 'add': {
            if (!args.name || !args.username) {
              throw new Error('name and username are required for add action');
            }

            let clientId: string;
            let clientSecret: string;

            if (args.credentialsFile) {
              // Load credentials from file
              try {
                const credentialsPath = args.credentialsFile as string;
                const credentialsContent = fs.readFileSync(credentialsPath, 'utf8');
                const credentials = JSON.parse(credentialsContent);
                
                if (credentials.installed) {
                  clientId = credentials.installed.client_id;
                  clientSecret = credentials.installed.client_secret;
                } else if (credentials.web) {
                  clientId = credentials.web.client_id;
                  clientSecret = credentials.web.client_secret;
                } else {
                  throw new Error('Invalid credentials file format. Expected "installed" or "web" OAuth2 credentials.');
                }
              } catch (error) {
                throw new Error(`Failed to load credentials file: ${error instanceof Error ? error.message : String(error)}`);
              }
            } else if (args.clientId && args.clientSecret) {
              // Use provided clientId/clientSecret
              clientId = args.clientId as string;
              clientSecret = args.clientSecret as string;
            } else {
              throw new Error('Either credentialsFile or both clientId and clientSecret are required for add action');
            }

            await gmailService.addGmailAccount(
              args.name as string,
              args.username as string,
              clientId,
              clientSecret
            );
            return {
              content: [
                {
                  type: 'text',
                  text: `Gmail account '${args.name}' added successfully with OAuth2 authentication`,
                },
              ],
            };
          }

          case 'remove': {
            if (!args.name) {
              throw new Error('name is required for remove action');
            }

            const deleted = gmailService.deleteAccount(args.name as string);
            return {
              content: [
                {
                  type: 'text',
                  text: deleted
                    ? `Account '${args.name}' deleted successfully`
                    : `Account '${args.name}' not found`,
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown action: ${action}`);
        }
      }

      case 'gmail_search': {
        const results = await gmailService.searchThreads(
          args.account as string,
          args.query as string,
          (args.maxResults as number) || 10,
          args.pageToken as string
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'gmail_thread': {
        const thread = await gmailService.getThread(
          args.account as string,
          args.threadId as string,
          args.downloadAttachments as boolean || false
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(thread, null, 2),
            },
          ],
        };
      }

      case 'gmail_attachments': {
        const results = await gmailService.downloadAttachments(
          args.account as string,
          args.attachments as Array<{
            messageId: string;
            attachmentId: string;
            filename: string;
          }>
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'gmail_labels': {
        const results = await gmailService.modifyLabels(
          args.account as string,
          args.threadIds as string[],
          (args.addLabels as string[]) || [],
          (args.removeLabels as string[]) || []
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'gmail_drafts': {
        const action = args.action as string;

        switch (action) {
          case 'list': {
            const drafts = await gmailService.listDrafts(args.account as string);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(drafts, null, 2),
                },
              ],
            };
          }

          case 'create': {
            if (!args.to || !args.subject || !args.body) {
              throw new Error('to, subject, and body are required for create action');
            }

            const draft = await gmailService.createDraft(
              args.account as string,
              args.to as string[],
              args.subject as string,
              args.body as string,
              {
                cc: args.cc as string[],
                bcc: args.bcc as string[],
                threadId: args.threadId as string,
              }
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(draft, null, 2),
                },
              ],
            };
          }

          case 'update': {
            if (!args.draftId || !args.body) {
              throw new Error('draftId and body are required for update action');
            }

            const draft = await gmailService.updateDraft(
              args.account as string,
              args.draftId as string,
              args.body as string
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(draft, null, 2),
                },
              ],
            };
          }

          case 'get': {
            if (!args.draftId) {
              throw new Error('draftId is required for get action');
            }

            const draft = await gmailService.getDraft(
              args.account as string,
              args.draftId as string
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(draft, null, 2),
                },
              ],
            };
          }

          case 'delete': {
            if (!args.draftId) {
              throw new Error('draftId is required for delete action');
            }

            await gmailService.deleteDraft(args.account as string, args.draftId as string);
            return {
              content: [
                {
                  type: 'text',
                  text: `Draft '${args.draftId}' deleted successfully`,
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown action: ${action}`);
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
