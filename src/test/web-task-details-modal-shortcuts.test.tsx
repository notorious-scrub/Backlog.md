import { afterEach, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Task } from "../types/index.ts";
import { TaskDetailsModal } from "../web/components/TaskDetailsModal";
import { ThemeProvider } from "../web/contexts/ThemeContext.tsx";
import { apiClient } from "../web/lib/api.ts";

let activeRoot: Root | null = null;
let originalFetchTasks: typeof apiClient.fetchTasks;

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

const renderModal = async (task: Task): Promise<HTMLElement> => {
	setupDom();
	const container = document.getElementById("root");
	expect(container).toBeTruthy();
	activeRoot = createRoot(container as HTMLElement);
	await act(async () => {
		activeRoot?.render(
			<ThemeProvider>
				<TaskDetailsModal task={task} isOpen={true} onClose={() => {}} />
			</ThemeProvider>,
		);
		await Promise.resolve();
	});
	return container as HTMLElement;
};

const dispatchKey = (key: string) => {
	act(() => {
		window.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true }));
	});
};

afterEach(() => {
	if (activeRoot) {
		act(() => {
			activeRoot?.unmount();
		});
		activeRoot = null;
	}
	if (originalFetchTasks) {
		apiClient.fetchTasks = originalFetchTasks;
	}
});

describe("Web task details modal keyboard shortcuts", () => {
	it("ignores bare e while in preview mode", async () => {
		const task: Task = {
			id: "TASK-1",
			title: "Preview task",
			status: "To Do",
			assignee: [],
			createdDate: "2026-03-11",
			labels: [],
			dependencies: [],
			description: "Body",
		};

		originalFetchTasks = apiClient.fetchTasks.bind(apiClient);
		apiClient.fetchTasks = async () => [];
		const container = await renderModal(task);
		expect(container.textContent).toContain("Edit");
		expect(container.textContent).not.toContain("Cancel");

		dispatchKey("e");

		expect(container.textContent).toContain("Edit");
		expect(container.textContent).not.toContain("Cancel");
	});

	it("ignores bare c for done tasks in preview mode", async () => {
		const task: Task = {
			id: "TASK-2",
			title: "Done task",
			status: "Done",
			assignee: [],
			createdDate: "2026-03-11",
			labels: [],
			dependencies: [],
		};

		let confirmCalls = 0;
		let completeCalls = 0;
		const originalConfirm = window.confirm;
		originalFetchTasks = apiClient.fetchTasks.bind(apiClient);
		const originalCompleteTask = apiClient.completeTask.bind(apiClient);
		apiClient.fetchTasks = async () => [];
		window.confirm = () => {
			confirmCalls += 1;
			return true;
		};
		apiClient.completeTask = async () => {
			completeCalls += 1;
		};

		try {
			const container = await renderModal(task);
			expect(container.textContent).toContain("Completed");

			dispatchKey("c");

			await Promise.resolve();
			expect(confirmCalls).toBe(0);
			expect(completeCalls).toBe(0);
		} finally {
			window.confirm = originalConfirm;
			apiClient.completeTask = originalCompleteTask;
		}
	});
});
