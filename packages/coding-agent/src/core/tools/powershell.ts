import { getPowerShellConfig } from "../../utils/shell.ts";
import {
	type BashOperations,
	type BashSpawnContext,
	type BashSpawnHook,
	type BashToolDetails,
	type BashToolInput,
	type BashToolOptions,
	type createBashTool,
	createLocalShellOperations,
	createShellToolDefinition,
	type ShellToolConfig,
} from "./bash.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const UTF8_OUTPUT_PREFIX =
	"try { [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[Console]::OutputEncoding } catch {}\n";

// The script arrives on stdin, so the shell cannot derive an exit code from its last statement.
// Report the `-Command` rule instead: 0 when the last statement succeeded, 1 when it failed.
// Windows PowerShell 5.1 also turns redirected native stderr into error records and sets $? to false,
// so `git push 2>&1 | Select-Object -Last 3` exits 1 although git exited 0 (#8842). Exit 0 when the
// last failure is only such a record and the native command exited 0. The lone `;` keeps an unfinished
// last statement, such as `Get-ChildItem |`, a parse error instead of continuing into the suffix and
// running. A command ending in a backtick would continue into the suffix, so it gets no suffix (#8842).
const POWERSHELL_EXIT_SUFFIX =
	'\n;\nif ($?) { exit 0 }\nif (($LASTEXITCODE -eq 0) -and ("$($Error[0].FullyQualifiedErrorId)" -like "NativeCommandError*")) { exit 0 }\nexit 1';

export const powershellToolSystemPromptContribution = {
	snippet: "Execute PowerShell commands",
	guidelines: ["You can inspect PI_* environment variables for current model and session details."],
} as const;

export type PowerShellOperations = BashOperations;
export type PowerShellSpawnContext = BashSpawnContext;
export type PowerShellSpawnHook = BashSpawnHook;
export type PowerShellToolDetails = BashToolDetails;
export type PowerShellToolInput = BashToolInput;

export interface PowerShellToolOptions
	extends Pick<BashToolOptions, "operations" | "exposeSessionEnvironment" | "spawnHook"> {}

export function createLocalPowerShellOperations(): PowerShellOperations {
	return {
		exec: async (command, cwd, options) => {
			const shellConfig = getPowerShellConfig();
			// A final backtick would continue the user's last line into the suffix, so leave such commands unchanged.
			const suffix = command.endsWith("`") ? "" : POWERSHELL_EXIT_SUFFIX;
			return createLocalShellOperations("PowerShell", () => shellConfig).exec(
				`${UTF8_OUTPUT_PREFIX}${command}${suffix}`,
				cwd,
				options,
			);
		},
	};
}

const powershellToolConfig: ShellToolConfig = {
	name: "powershell",
	label: "powershell",
	shellName: "PowerShell",
	prompt: "PS>",
	promptSnippet: powershellToolSystemPromptContribution.snippet,
	promptGuidelines: powershellToolSystemPromptContribution.guidelines,
	tempFilePrefix: "pi-powershell",
};

export function createPowerShellToolDefinition(
	cwd: string,
	options?: PowerShellToolOptions,
): ReturnType<typeof createShellToolDefinition> {
	return createShellToolDefinition(cwd, powershellToolConfig, {
		...options,
		operations: options?.operations ?? createLocalPowerShellOperations(),
	});
}

export function createPowerShellTool(cwd: string, options?: PowerShellToolOptions): ReturnType<typeof createBashTool> {
	const definition = createPowerShellToolDefinition(cwd, options);
	const tool = wrapToolDefinition(definition);
	Object.assign(tool, {
		promptSnippet: definition.promptSnippet,
		promptGuidelines: definition.promptGuidelines,
	});
	return tool;
}
