#!/usr/bin/env node

import * as fs from "fs";
import { parseArgs } from "util";
import { GmailService } from "./gmail-service.js";

const service = new GmailService();

function usage(): never {
	console.log(`gmcli - Gmail CLI

Usage: gmcli [--json] <command> [options]

Commands:
  accounts credentials <file.json>  Set OAuth credentials (once)
  accounts list                     List configured accounts
  accounts add <email>              Add account
  accounts remove <email>           Remove account

  search <email> <query> [--max N] [--page TOKEN]
                                    Search threads (Gmail query syntax)

  thread <email> <threadId> [--download]
                                    Get thread (--download saves attachments)

  labels <email> <threadIds...> [--add LABELS] [--remove LABELS]
                                    Modify thread labels (comma-separated)

  drafts <email> list               List drafts
  drafts <email> get <draftId>      Get draft
  drafts <email> delete <draftId>   Delete draft
  drafts <email> create --to <emails> --subject <subj> --body <body>
                                    Create draft

Options:
  --json                            Output JSON (default: minimal text)
  --help                            Show this help`);
	process.exit(1);
}

function output(data: any, json: boolean): void {
	if (json) {
		console.log(JSON.stringify(data, null, 2));
	} else if (typeof data === "string") {
		console.log(data);
	} else {
		console.log(JSON.stringify(data, null, 2));
	}
}

function error(msg: string, json: boolean): never {
	if (json) {
		console.log(JSON.stringify({ error: msg }));
	} else {
		console.error("Error:", msg);
	}
	process.exit(1);
}

async function main() {
	const args = process.argv.slice(2);
	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		usage();
	}

	const jsonFlag = args.includes("--json");
	const filteredArgs = args.filter((a) => a !== "--json");

	const command = filteredArgs[0];
	const rest = filteredArgs.slice(1);

	try {
		switch (command) {
			case "accounts":
				await handleAccounts(rest, jsonFlag);
				break;
			case "search":
				await handleSearch(rest, jsonFlag);
				break;
			case "thread":
				await handleThread(rest, jsonFlag);
				break;
			case "labels":
				await handleLabels(rest, jsonFlag);
				break;
			case "drafts":
				await handleDrafts(rest, jsonFlag);
				break;
			default:
				error(`Unknown command: ${command}`, jsonFlag);
		}
	} catch (e) {
		error(e instanceof Error ? e.message : String(e), jsonFlag);
	}
}

async function handleAccounts(args: string[], json: boolean) {
	const action = args[0];
	if (!action) error("Missing action: list|add|remove|credentials", json);

	switch (action) {
		case "list": {
			const accounts = service.listAccounts();
			if (json) {
				output(accounts.map((a) => a.email), json);
			} else if (accounts.length === 0) {
				console.log("No accounts configured");
			} else {
				for (const a of accounts) {
					console.log(a.email);
				}
			}
			break;
		}
		case "credentials": {
			const credFile = args[1];
			if (!credFile) error("Usage: accounts credentials <credentials.json>", json);
			const creds = JSON.parse(fs.readFileSync(credFile, "utf8"));
			const installed = creds.installed || creds.web;
			if (!installed) error("Invalid credentials file", json);
			service.setCredentials(installed.client_id, installed.client_secret);
			output(json ? { success: true } : "Credentials saved", json);
			break;
		}
		case "add": {
			const email = args[1];
			if (!email) {
				error("Usage: accounts add <email>", json);
			}
			const creds = service.getCredentials();
			if (!creds) {
				error("No credentials configured. Run: gmcli accounts credentials <credentials.json>", json);
			}
			await service.addGmailAccount(email, creds.clientId, creds.clientSecret);
			output(json ? { success: true, email } : `Account '${email}' added`, json);
			break;
		}
		case "remove": {
			const email = args[1];
			if (!email) error("Usage: accounts remove <email>", json);
			const deleted = service.deleteAccount(email);
			output(json ? { success: deleted, email } : (deleted ? `Removed '${email}'` : `Not found: ${email}`), json);
			break;
		}
		default:
			error(`Unknown action: ${action}`, json);
	}
}

async function handleSearch(args: string[], json: boolean) {
	const { values, positionals } = parseArgs({
		args,
		options: {
			max: { type: "string", short: "m" },
			page: { type: "string", short: "p" },
		},
		allowPositionals: true,
	});

	const [account, ...queryParts] = positionals;
	const query = queryParts.join(" ");
	if (!account || !query) error("Usage: search <account> <query>", json);

	const results = await service.searchThreads(account, query, Number(values.max) || 10, values.page);

	if (json) {
		output(results, json);
	} else {
		if (results.threads.length === 0) {
			console.log("No results");
		} else {
			console.log("ID\tDATE\tFROM\tSUBJECT");
			for (const t of results.threads) {
				const msg = t.messages[0];
				const date = msg?.date ? new Date(msg.date).toISOString().slice(0, 16).replace("T", " ") : "";
				const from = msg?.from?.replace(/\t/g, " ") || "";
				const subject = msg?.subject?.replace(/\t/g, " ") || "(no subject)";
				console.log(`${t.id}\t${date}\t${from}\t${subject}`);
			}
			if (results.nextPageToken) {
				console.log(`\n# Next page: --page ${results.nextPageToken}`);
			}
		}
	}
}

async function handleThread(args: string[], json: boolean) {
	const download = args.includes("--download");
	const filtered = args.filter((a) => a !== "--download");
	const [account, threadId] = filtered;

	if (!account || !threadId) error("Usage: thread <account> <threadId>", json);

	const result = await service.getThread(account, threadId, download);

	if (json) {
		output(result, json);
	} else if (download) {
		const attachments = result as any[];
		if (attachments.length === 0) {
			console.log("No attachments");
		} else {
			console.log("FILENAME\tPATH\tSIZE");
			for (const a of attachments) {
				console.log(`${a.filename}\t${a.path}\t${a.size}`);
			}
		}
	} else {
		const thread = result as any;
		for (const msg of thread.messages || []) {
			const headers = msg.payload?.headers || [];
			const getHeader = (name: string) => headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
			console.log(`From: ${getHeader("from")}`);
			console.log(`To: ${getHeader("to")}`);
			console.log(`Date: ${getHeader("date")}`);
			console.log(`Subject: ${getHeader("subject")}`);
			console.log("");
			console.log(decodeBody(msg.payload));
			console.log("");
			const attachments = getAttachments(msg.payload);
			if (attachments.length > 0) {
				console.log("Attachments: " + attachments.join(", "));
				console.log("");
			}
			console.log("---");
		}
	}
}

function decodeBody(payload: any): string {
	if (!payload) return "";
	if (payload.body?.data) {
		return Buffer.from(payload.body.data, "base64url").toString();
	}
	if (payload.parts) {
		for (const part of payload.parts) {
			if (part.mimeType === "text/plain" && part.body?.data) {
				return Buffer.from(part.body.data, "base64url").toString();
			}
		}
		for (const part of payload.parts) {
			const nested = decodeBody(part);
			if (nested) return nested;
		}
	}
	return "";
}

function getAttachments(payload: any): string[] {
	const attachments: string[] = [];
	if (!payload?.parts) return attachments;
	for (const part of payload.parts) {
		if (part.filename && part.body?.attachmentId) {
			attachments.push(part.filename);
		}
		attachments.push(...getAttachments(part));
	}
	return attachments;
}

async function handleLabels(args: string[], json: boolean) {
	const { values, positionals } = parseArgs({
		args,
		options: {
			add: { type: "string", short: "a" },
			remove: { type: "string", short: "r" },
		},
		allowPositionals: true,
	});

	const [account, ...threadIds] = positionals;
	if (!account || threadIds.length === 0) {
		error("Usage: labels <account> <threadIds...> [--add LABELS] [--remove LABELS]", json);
	}

	const addLabels = values.add ? values.add.split(",") : [];
	const removeLabels = values.remove ? values.remove.split(",") : [];

	const results = await service.modifyLabels(account, threadIds, addLabels, removeLabels);

	if (json) {
		output(results, json);
	} else {
		for (const r of results) {
			console.log(`${r.threadId}: ${r.success ? "ok" : r.error}`);
		}
	}
}

async function handleDrafts(args: string[], json: boolean) {
	const [account, action, ...rest] = args;
	if (!account || !action) error("Usage: drafts <account> <action>", json);

	switch (action) {
		case "list": {
			const drafts = await service.listDrafts(account);
			output(drafts, json);
			break;
		}
		case "get": {
			const draftId = rest[0];
			if (!draftId) error("Usage: drafts <account> get <draftId>", json);
			const draft = await service.getDraft(account, draftId);
			output(draft, json);
			break;
		}
		case "delete": {
			const draftId = rest[0];
			if (!draftId) error("Usage: drafts <account> delete <draftId>", json);
			await service.deleteDraft(account, draftId);
			output(json ? { success: true } : "Deleted", json);
			break;
		}
		case "create": {
			const { values } = parseArgs({
				args: rest,
				options: {
					to: { type: "string" },
					cc: { type: "string" },
					bcc: { type: "string" },
					subject: { type: "string" },
					body: { type: "string" },
					thread: { type: "string" },
				},
			});
			if (!values.to || !values.subject || !values.body) {
				error("Usage: drafts <account> create --to <emails> --subject <subj> --body <body>", json);
			}
			const draft = await service.createDraft(
				account,
				values.to.split(","),
				values.subject,
				values.body,
				{
					cc: values.cc?.split(","),
					bcc: values.bcc?.split(","),
					threadId: values.thread,
				}
			);
			output(draft, json);
			break;
		}
		default:
			error(`Unknown action: ${action}`, json);
	}
}

main();
