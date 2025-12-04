# gmcli

Minimal Gmail CLI for searching, reading threads, managing labels, and drafts. Outputs human-readable text by default, or JSON with `--json` for composability with other tools.

## Quick Start

```bash
# Install
npm install -g @mariozechner/gmcli

# Set OAuth credentials once (see Setup below)
gmcli accounts credentials ~/path/to/credentials.json

# Add account (opens browser for OAuth)
gmcli accounts add you@gmail.com

# Search
gmcli search you@gmail.com "is:unread"

# Get thread
gmcli thread you@gmail.com <threadId>

# JSON output for piping
gmcli --json search you@gmail.com "from:someone@example.com" | jq '.threads[0]'
```

## Setup

Before adding an account, you need OAuth2 credentials from Google Cloud Console:

1. [Create a new project](https://console.cloud.google.com/projectcreate) (or select existing)
2. [Enable the Gmail API](https://console.cloud.google.com/apis/api/gmail.googleapis.com)
3. [Configure OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent):
   - Choose "External" user type
   - Fill in app name and your email
   - Add all Gmail addresses you want to use with gmcli as test users
4. [Create OAuth client](https://console.cloud.google.com/auth/clients):
   - Click "Create Client"
   - Application type: "Desktop app"
   - Download the JSON file

## Commands

### accounts

```bash
# Set OAuth credentials (once, shared by all accounts)
gmcli accounts credentials <credentials.json>

# List configured accounts
gmcli accounts list

# Add account (opens browser for OAuth)
gmcli accounts add <email>

# Remove account
gmcli accounts remove <email>
```

### search

Search threads using Gmail query syntax.

```bash
gmcli search <email> <query> [--max N] [--page TOKEN]
```

Common queries:

```bash
# Inbox
gmcli search you@gmail.com "in:inbox"

# Unread
gmcli search you@gmail.com "is:unread"

# Starred
gmcli search you@gmail.com "is:starred"

# By label
gmcli search you@gmail.com "label:work"

# From sender
gmcli search you@gmail.com "from:boss@company.com"

# With attachment
gmcli search you@gmail.com "has:attachment"

# Date range
gmcli search you@gmail.com "after:2024/01/01 before:2024/12/31"

# Combined
gmcli search you@gmail.com "in:inbox is:unread from:someone@example.com"

# More results
gmcli search you@gmail.com "in:inbox" --max 50
```

### thread

Get a complete thread with all messages.

```bash
gmcli thread <email> <threadId>

# Download all attachments to ~/.gmcli/attachments/
gmcli thread <email> <threadId> --download
```

### labels

Modify labels on threads. Use comma-separated values for multiple labels.

```bash
gmcli labels <email> <threadIds...> [--add LABELS] [--remove LABELS]
```

Common operations:

```bash
# Mark as read
gmcli labels you@gmail.com abc123 --remove UNREAD

# Mark as unread
gmcli labels you@gmail.com abc123 --add UNREAD

# Archive (remove from inbox)
gmcli labels you@gmail.com abc123 --remove INBOX

# Unarchive (move back to inbox)
gmcli labels you@gmail.com abc123 --add INBOX

# Star
gmcli labels you@gmail.com abc123 --add STARRED

# Unstar
gmcli labels you@gmail.com abc123 --remove STARRED

# Add custom label
gmcli labels you@gmail.com abc123 --add Label_123

# Remove custom label
gmcli labels you@gmail.com abc123 --remove Label_123

# Multiple operations
gmcli labels you@gmail.com abc123 --add STARRED --remove UNREAD,INBOX

# Multiple threads
gmcli labels you@gmail.com abc123 def456 ghi789 --remove UNREAD
```

System labels: `INBOX`, `UNREAD`, `STARRED`, `IMPORTANT`, `TRASH`, `SPAM`

### drafts

```bash
# List drafts
gmcli drafts <email> list

# Get draft
gmcli drafts <email> get <draftId>

# Delete draft
gmcli drafts <email> delete <draftId>

# Create draft
gmcli drafts <email> create --to user@example.com --subject "Hello" --body "Content"

# Create with CC/BCC (comma-separated for multiple)
gmcli drafts <email> create --to a@x.com,b@x.com --cc c@x.com --subject "Hi" --body "Text"
```

## JSON Output

Add `--json` before the command for machine-readable output:

```bash
gmcli --json accounts list
gmcli --json search you@gmail.com "is:starred"
gmcli --json thread you@gmail.com abc123
```

## Data Storage

- Credentials: `~/.gmcli/credentials.json`
- Accounts: `~/.gmcli/accounts.json`
- Attachments: `~/.gmcli/attachments/`

## Development

```bash
npm install
npx tsx src/cli.ts accounts list
```

## License

MIT
