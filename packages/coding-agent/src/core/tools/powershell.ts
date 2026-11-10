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

// The script arrives on stdin, so report the `-Command` exit rule manually: 0 on success, 1 on
// failure. `exit` ends the runspace before the console host flushes formatted pipeline output, so
// the suffix reports failure through `$host.SetShouldExit` instead. `$?` is captured first: read
// later in the chain it observes the suffix's own evaluation, not the command. `$LASTEXITCODE` is
// read only when it exists, because `Set-StrictMode` turns an unset variable into an error. The
// native stderr exemption covers records PS 5.1 misreports as failures (#8842). The lone `;` keeps
// an unfinished last statement a parse error; a trailing backtick continues into the suffix, so
// such commands get none (#8842).
const POWERSHELL_EXIT_SUFFIX =
	"\n;\n$__piOk = $?\n" +
	"if (-not $__piOk) {\n" +
	'\tif (-not ((Test-Path variable:LASTEXITCODE) -and ($LASTEXITCODE -eq 0) -and ("$($Error[0].FullyQualifiedErrorId)" -like "NativeCommandError*"))) { $host.SetShouldExit(1) }\n' +
	"}";

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
