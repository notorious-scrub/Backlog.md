#!/usr/bin/env node

const { existsSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawn } = require("node:child_process");
const { resolveBinaryPath } = require("./resolveBinary.cjs");

function cleanCliArgs(rawArgs, binaryPath) {
	return rawArgs.filter((arg) => {
		if (arg === binaryPath) return false;
		try {
			const pattern = /node_modules[/\\]backlog\.md-(darwin|linux|windows)-[^/\\]+[/\\]backlog(\.exe)?$/i;
			return !pattern.test(arg);
		} catch {
			return true;
		}
	});
}

function resolveLaunchCommand(options = {}) {
	const repoRoot = options.repoRoot ? resolve(options.repoRoot) : resolve(__dirname, "..");
	const env = options.env || process.env;
	const sourceCliPath = join(repoRoot, "src", "cli.ts");
	const preferSource = existsSync(sourceCliPath) && env.BACKLOG_DISABLE_SOURCE_CLI !== "1";
	if (preferSource) {
		return {
			command: "bun",
			args: [sourceCliPath],
			mode: "source",
			binaryPath: null,
		};
	}

	const binaryPath = resolveBinaryPath();
	return {
		command: binaryPath,
		args: [],
		mode: "binary",
		binaryPath,
	};
}

function handleLaunchError(error, launchCommand) {
	if (launchCommand.mode === "source" && error.code === "ENOENT") {
		console.error("Failed to start backlog source CLI because bun was not found in PATH.");
		console.error("Install Bun or set BACKLOG_DISABLE_SOURCE_CLI=1 to force the packaged binary.");
		return;
	}
	if (error.code === "ENOENT") {
		console.error(`Binary not found: ${launchCommand.binaryPath ?? launchCommand.command}`);
		console.error(`Please ensure you have the correct version for your platform (${process.platform}-${process.arch})`);
		return;
	}
	console.error("Failed to start backlog:", error);
}

function main() {
	let launchCommand;
	try {
		launchCommand = resolveLaunchCommand();
	} catch {
		console.error(`Binary package not installed for ${process.platform}-${process.arch}.`);
		process.exit(1);
	}

	const rawArgs = process.argv.slice(2);
	const cleanedArgs = cleanCliArgs(rawArgs, launchCommand.binaryPath);
	const child = spawn(launchCommand.command, [...launchCommand.args, ...cleanedArgs], {
		stdio: "inherit",
		windowsHide: true,
	});

	child.on("exit", (code) => {
		process.exit(code || 0);
	});

	child.on("error", (error) => {
		handleLaunchError(error, launchCommand);
		process.exit(1);
	});
}

if (require.main === module) {
	main();
}

module.exports = {
	cleanCliArgs,
	handleLaunchError,
	main,
	resolveLaunchCommand,
};
