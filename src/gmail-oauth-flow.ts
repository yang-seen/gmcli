import { spawn } from "child_process";
import * as http from "http";
import type { AddressInfo } from "net";
import * as url from "url";
import { OAuth2Client } from "google-auth-library";

const SCOPES = ["https://mail.google.com/"];
const TIMEOUT_MS = 2 * 60 * 1000;

interface AuthResult {
	success: boolean;
	refreshToken?: string;
	error?: string;
}

export class GmailOAuthFlow {
	private oauth2Client: OAuth2Client;
	private server: http.Server | null = null;
	private timeoutId: NodeJS.Timeout | null = null;

	constructor(clientId: string, clientSecret: string) {
		this.oauth2Client = new OAuth2Client(clientId, clientSecret);
	}

	async authorize(): Promise<string> {
		const result = await this.startAuthFlow();
		if (!result.success) {
			throw new Error(result.error || "Authorization failed");
		}
		if (!result.refreshToken) {
			throw new Error("No refresh token received");
		}
		return result.refreshToken;
	}

	private startAuthFlow(): Promise<AuthResult> {
		return new Promise((resolve) => {
			this.server = http.createServer((req, res) => {
				const parsed = url.parse(req.url!, true);
				if (parsed.pathname === "/") {
					this.handleCallback(parsed.query, res, resolve);
				} else {
					res.writeHead(404);
					res.end();
				}
			});

			this.server.listen(0, "localhost", () => {
				const port = (this.server!.address() as AddressInfo).port;
				const redirectUri = `http://localhost:${port}`;

				this.oauth2Client = new OAuth2Client(
					this.oauth2Client._clientId,
					this.oauth2Client._clientSecret,
					redirectUri
				);

				const authUrl = this.oauth2Client.generateAuthUrl({
					access_type: "offline",
					scope: SCOPES,
				});

				console.log(`Starting OAuth flow on port ${port}...`);
				console.log("Opening browser for Gmail authorization...");
				console.log("If browser doesn't open, visit this URL:");
				console.log(authUrl);

				this.openBrowser(authUrl);

				this.timeoutId = setTimeout(() => {
					console.log("Authorization timed out after 2 minutes");
					this.cleanup();
					resolve({ success: false, error: "Authorization timed out" });
				}, TIMEOUT_MS);
			});

			this.server.on("error", (err) => {
				this.cleanup();
				resolve({ success: false, error: err.message });
			});
		});
	}

	private async handleCallback(
		query: any,
		res: http.ServerResponse,
		resolve: (result: AuthResult) => void
	): Promise<void> {
		if (query.error) {
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end("<html><body><h1>Authorization cancelled</h1></body></html>");
			this.cleanup();
			resolve({ success: false, error: query.error });
			return;
		}

		if (!query.code) {
			res.writeHead(400, { "Content-Type": "text/html" });
			res.end("<html><body><h1>No authorization code</h1></body></html>");
			this.cleanup();
			resolve({ success: false, error: "No authorization code" });
			return;
		}

		try {
			const { tokens } = await this.oauth2Client.getToken(query.code as string);
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end("<html><body><h1>Success!</h1><p>You can close this window.</p></body></html>");
			this.cleanup();
			resolve({ success: true, refreshToken: tokens.refresh_token || undefined });
		} catch (e) {
			res.writeHead(500, { "Content-Type": "text/html" });
			res.end(`<html><body><h1>Error</h1><p>${e instanceof Error ? e.message : e}</p></body></html>`);
			this.cleanup();
			resolve({ success: false, error: e instanceof Error ? e.message : String(e) });
		}
	}

	private cleanup(): void {
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
			this.timeoutId = null;
		}
		if (this.server) {
			this.server.close();
			this.server = null;
		}
	}

	private openBrowser(url: string): void {
		const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
		spawn(cmd, [url], { detached: true, stdio: "ignore" });
	}
}
