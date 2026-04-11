import { afterEach, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { BacklogConfig, TaskAuditEventPage } from "../types/index.ts";
import AgentOrchestration from "../web/components/AgentOrchestration";
import Settings from "../web/components/Settings";
import SideNavigation from "../web/components/SideNavigation";
import { apiClient } from "../web/lib/api.ts";

let activeRoot: Root | null = null;
let currentConfig: BacklogConfig;
let originalFetchConfig: typeof apiClient.fetchConfig;
let originalUpdateConfig: typeof apiClient.updateConfig;
let originalFetchAutomatedQa: typeof apiClient.fetchAutomatedQa;
let originalFetchAgentAutomationAuditLog: typeof apiClient.fetchAgentAutomationAuditLog;

const baseConfig = (): BacklogConfig => ({
	projectName: "Backlog QA",
	statuses: ["To Do", "In Progress", "QA", "Done"],
	labels: ["automation"],
	dateFormat: "yyyy-MM-dd",
	defaultStatus: "To Do",
	defaultEditor: "code",
	defaultPort: 6420,
	autoOpenBrowser: false,
	remoteOperations: false,
	autoCommit: false,
	zeroPaddedIds: 0,
	maxColumnWidth: 80,
	taskResolutionStrategy: "most_recent",
	includeDateTimeInDates: false,
	bypassGitHooks: false,
	checkActiveBranches: true,
	activeBranchDays: 30,
	definitionOfDone: ["Tests pass"],
	automatedQa: {
		enabled: true,
		paused: false,
		triggerStatus: "QA",
		codexCommand: "codex",
		agentName: "qa_engineer",
		reviewerAssignee: "QA",
		timeoutSeconds: 180,
	},
	agentAutomations: [
		{
			id: "automated-qa",
			name: "Automated QA",
			enabled: true,
			paused: false,
			trigger: {
				type: "status_transition",
				toStatus: "QA",
			},
			codexCommand: "codex",
			agentName: "qa_engineer",
			reviewerAssignee: "QA",
			timeoutSeconds: 180,
			maxConcurrentRuns: 1,
		},
	],
	prefixes: {
		task: "BACK",
	},
});

const emptyAuditPage = (): TaskAuditEventPage => ({ events: [] });

const setupDom = () => {
	const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost" });
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.window = dom.window as unknown as Window & typeof globalThis;
	globalThis.document = dom.window.document as unknown as Document;
	globalThis.navigator = dom.window.navigator as unknown as Navigator;
	globalThis.localStorage = dom.window.localStorage as unknown as Storage;
	globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) =>
		window.setTimeout(() => callback(0), 0)) as unknown as typeof requestAnimationFrame;
	globalThis.cancelAnimationFrame = ((id: number) => window.clearTimeout(id)) as unknown as typeof cancelAnimationFrame;
	globalThis.MutationObserver = window.MutationObserver;
	globalThis.Event = window.Event as unknown as typeof Event;
	globalThis.CustomEvent = window.CustomEvent as unknown as typeof CustomEvent;

	if (!window.matchMedia) {
		window.matchMedia = () =>
			({
				matches: false,
				media: "",
				onchange: null,
				addListener: () => {},
				removeListener: () => {},
				addEventListener: () => {},
				removeEventListener: () => {},
				dispatchEvent: () => false,
			}) as MediaQueryList;
	}

	const htmlElementPrototype = window.HTMLElement.prototype as unknown as {
		attachEvent?: () => void;
		detachEvent?: () => void;
	};
	if (typeof htmlElementPrototype.attachEvent !== "function") {
		htmlElementPrototype.attachEvent = () => {};
	}
	if (typeof htmlElementPrototype.detachEvent !== "function") {
		htmlElementPrototype.detachEvent = () => {};
	}
};

const renderUi = async (ui: React.ReactElement): Promise<HTMLElement> => {
	setupDom();
	const container = document.getElementById("root");
	expect(container).toBeTruthy();
	activeRoot = createRoot(container as HTMLElement);
	await act(async () => {
		activeRoot?.render(ui);
		await Promise.resolve();
	});
	return container as HTMLElement;
};

const waitForText = async (container: HTMLElement, text: string) => {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if ((container.textContent ?? "").includes(text)) {
			return;
		}
		await act(async () => {
			await Promise.resolve();
		});
	}
	expect(container.textContent).toContain(text);
};

const waitForButtonEnabled = async (button: HTMLButtonElement) => {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (!button.disabled) {
			return;
		}
		await act(async () => {
			await Promise.resolve();
		});
	}
	expect(button.disabled).toBe(false);
};

const changeInputValue = (input: HTMLInputElement, value: string) => {
	const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
	descriptor?.set?.call(input, value);
	act(() => {
		input.dispatchEvent(new window.Event("input", { bubbles: true }));
		input.dispatchEvent(new window.Event("change", { bubbles: true }));
	});
};

const changeCheckboxValue = (input: HTMLInputElement, checked: boolean) => {
	const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "checked");
	descriptor?.set?.call(input, checked);
	act(() => {
		input.dispatchEvent(new window.Event("click", { bubbles: true }));
		input.dispatchEvent(new window.Event("change", { bubbles: true }));
	});
};

const clickElement = (element: Element) => {
	act(() => {
		element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
	});
};

afterEach(() => {
	if (activeRoot) {
		act(() => {
			activeRoot?.unmount();
		});
		activeRoot = null;
	}
	if (originalFetchConfig) {
		apiClient.fetchConfig = originalFetchConfig;
	}
	if (originalUpdateConfig) {
		apiClient.updateConfig = originalUpdateConfig;
	}
	if (originalFetchAutomatedQa) {
		apiClient.fetchAutomatedQa = originalFetchAutomatedQa;
	}
	if (originalFetchAgentAutomationAuditLog) {
		apiClient.fetchAgentAutomationAuditLog = originalFetchAgentAutomationAuditLog;
	}
});

describe("AI agent orchestration UI", () => {
	it("shows AI Agent Orchestration as a primary navigation entry", async () => {
		const container = await renderUi(
			<MemoryRouter>
				<SideNavigation
					tasks={[]}
					docs={[]}
					decisions={[]}
					isLoading={false}
					onRefreshData={async () => {}}
				/>
			</MemoryRouter>,
		);

		expect(container.textContent).toContain("AI Agent Orchestration");
		expect(container.textContent).toContain("Settings");
	});

	it("renders orchestration on its own page and removes it from general settings", async () => {
		currentConfig = baseConfig();
		originalFetchConfig = apiClient.fetchConfig.bind(apiClient);
		originalUpdateConfig = apiClient.updateConfig.bind(apiClient);
		originalFetchAutomatedQa = apiClient.fetchAutomatedQa.bind(apiClient);
		originalFetchAgentAutomationAuditLog = apiClient.fetchAgentAutomationAuditLog.bind(apiClient);
		apiClient.fetchConfig = async () => currentConfig;
		apiClient.updateConfig = async (config) => {
			currentConfig = config;
			return currentConfig;
		};
		apiClient.fetchAutomatedQa = async () => ({
			config: currentConfig.automatedQa ?? baseConfig().automatedQa!,
			automations: currentConfig.agentAutomations ?? [],
			state: { queuedTaskIds: [], activeTaskIds: [] },
			staleThresholdMs: 60000,
			recentRuns: [],
		});
		apiClient.fetchAgentAutomationAuditLog = async () => emptyAuditPage();

		const settingsContainer = await renderUi(<Settings />);
		await waitForText(settingsContainer, "Settings");
		expect(settingsContainer.textContent).toContain("Workflow Settings");
		expect(settingsContainer.textContent).not.toContain("Automated QA");

		if (activeRoot) {
			act(() => {
				activeRoot?.unmount();
			});
			activeRoot = null;
		}

		const automationContainer = await renderUi(<AgentOrchestration />);
		await waitForText(automationContainer, "AI Agent Orchestration");
		expect(automationContainer.textContent).toContain("Automated QA");
		expect(automationContainer.textContent).toContain("Recent QA Runs");
	});

	it("persists orchestration config changes across a reload", async () => {
		currentConfig = baseConfig();
		originalFetchConfig = apiClient.fetchConfig.bind(apiClient);
		originalUpdateConfig = apiClient.updateConfig.bind(apiClient);
		originalFetchAutomatedQa = apiClient.fetchAutomatedQa.bind(apiClient);
		originalFetchAgentAutomationAuditLog = apiClient.fetchAgentAutomationAuditLog.bind(apiClient);
		apiClient.fetchConfig = async () => currentConfig;
		apiClient.updateConfig = async (config) => {
			currentConfig = config;
			return currentConfig;
		};
		apiClient.fetchAutomatedQa = async () => ({
			config: currentConfig.automatedQa ?? baseConfig().automatedQa!,
			automations: currentConfig.agentAutomations ?? [],
			state: { queuedTaskIds: [], activeTaskIds: [] },
			staleThresholdMs: 60000,
			recentRuns: [],
		});
		apiClient.fetchAgentAutomationAuditLog = async () => emptyAuditPage();

		const container = await renderUi(<AgentOrchestration />);
		await waitForText(container, "AI Agent Orchestration");

		const enabledToggle = container.querySelector("input[type='checkbox']");
		expect(enabledToggle).toBeTruthy();
		changeCheckboxValue(enabledToggle as HTMLInputElement, false);

		const saveButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent?.trim() === "Save Changes",
		);
		expect(saveButton).toBeTruthy();
		await waitForButtonEnabled(saveButton as HTMLButtonElement);
		clickElement(saveButton as HTMLButtonElement);
		await waitForText(container, "Settings saved successfully!");
		expect(currentConfig.automatedQa?.enabled).toBe(false);

		if (activeRoot) {
			act(() => {
				activeRoot?.unmount();
			});
			activeRoot = null;
		}

		const reloadedContainer = await renderUi(<AgentOrchestration />);
		await waitForText(reloadedContainer, "AI Agent Orchestration");
		const reloadedInput = reloadedContainer.querySelector("input[type='checkbox']");
		expect(reloadedInput).toBeTruthy();
		expect((reloadedInput as HTMLInputElement).checked).toBe(false);
	});
});
