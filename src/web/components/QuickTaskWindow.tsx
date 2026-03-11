import React, { useEffect, useState } from "react";
import type { Task } from "../../types";
import { apiClient } from "../lib/api";
import { getClipboardImageFiles } from "../utils/clipboard-images";
import { applyScreenshotReviewInstruction, toScreenshotReference } from "../utils/screenshots";

interface QuickTaskWindowProps {
	availableStatuses: string[];
}

const QUICK_TASK_STORAGE_KEY = "backlog:quick-task-created";

const PRIORITY_OPTIONS: Array<{ label: string; value: "" | "high" | "medium" | "low" }> = [
	{ label: "No Priority", value: "" },
	{ label: "High", value: "high" },
	{ label: "Medium", value: "medium" },
	{ label: "Low", value: "low" },
];

const QuickTaskWindow: React.FC<QuickTaskWindowProps> = ({ availableStatuses }) => {
	const [statuses, setStatuses] = useState<string[]>(availableStatuses);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [priority, setPriority] = useState<"" | "high" | "medium" | "low">("");
	const [status, setStatus] = useState(availableStatuses[0] ?? "To Do");
	const [references, setReferences] = useState<string[]>([]);
	const [newReference, setNewReference] = useState("");
	const [isUploadingScreenshot, setIsUploadingScreenshot] = useState(false);
	const [taskIdForScreenshots, setTaskIdForScreenshots] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (availableStatuses.length > 0) {
			setStatuses(availableStatuses);
			setStatus((current) => (availableStatuses.includes(current) ? current : availableStatuses[0] ?? "To Do"));
			return;
		}
		void apiClient
			.fetchStatuses()
			.then((nextStatuses) => {
				setStatuses(nextStatuses);
				setStatus((current) => (nextStatuses.includes(current) ? current : nextStatuses[0] ?? "To Do"));
			})
			.catch(() => {
				setStatuses(["To Do", "In Progress", "Done"]);
				setStatus((current) => current || "To Do");
			});
	}, [availableStatuses]);

	useEffect(() => {
		let cancelled = false;
		void apiClient
			.fetchNextTaskId()
			.then((nextId) => {
				if (!cancelled) {
					setTaskIdForScreenshots(nextId);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setTaskIdForScreenshots(null);
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const addReference = () => {
		const trimmed = newReference.trim();
		if (!trimmed || references.includes(trimmed)) {
			return;
		}
		const nextReferences = [...references, trimmed];
		setReferences(nextReferences);
		setDescription((current) => applyScreenshotReviewInstruction(current, nextReferences));
		setNewReference("");
	};

	const handlePasteScreenshotIntoReferences = async (event: React.ClipboardEvent<HTMLInputElement>) => {
		const pastedImages = getClipboardImageFiles(event.clipboardData);
		if (pastedImages.length === 0) {
			return;
		}
		event.preventDefault();
		setError(null);
		setIsUploadingScreenshot(true);
		try {
			const uploads = await Promise.all(
				pastedImages.map((file, index) =>
					apiClient.uploadScreenshot(file, {
						prefix: "task",
						taskId: taskIdForScreenshots ?? undefined,
						filename: taskIdForScreenshots ? undefined : `quick-task-${Date.now()}-${index + 1}`,
					}),
				),
			);
			const pastedReferences = uploads
				.map((upload) => toScreenshotReference(upload.path))
				.filter((value): value is string => Boolean(value));
			if (pastedReferences.length === 0) {
				return;
			}
			const nextReferences = Array.from(new Set([...references, ...pastedReferences]));
			setReferences(nextReferences);
			setDescription((current) => applyScreenshotReviewInstruction(current, nextReferences));
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to upload pasted screenshot.");
		} finally {
			setIsUploadingScreenshot(false);
		}
	};

	const handleSubmit = async () => {
		if (!title.trim()) {
			setError("Title is required.");
			return;
		}
		setIsSaving(true);
		setError(null);
		try {
			const createdTask = await apiClient.createTask({
				title: title.trim(),
				description,
				references,
				priority: priority || undefined,
				status,
			} as Omit<Task, "id" | "createdDate">);
			setTaskIdForScreenshots(createdTask.id);
			localStorage.setItem(QUICK_TASK_STORAGE_KEY, String(Date.now()));
			window.close();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create quick task.");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
			<div className="mx-auto max-w-lg rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
				<div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
					<h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Quick Task</h1>
				</div>
				<div className="px-4 py-4 space-y-3">
					{error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}

					<div>
						<label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Title</label>
						<input
							type="text"
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							autoFocus
							className="w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="Task title"
						/>
					</div>

					<div>
						<label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Description</label>
						<textarea
							rows={6}
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="Description"
						/>
					</div>

					<div>
						<label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">References</label>
						<div className="flex gap-2">
							<input
								type="text"
								value={newReference}
								onChange={(event) => setNewReference(event.target.value)}
								onPaste={(event) => {
									void handlePasteScreenshotIntoReferences(event);
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										addReference();
									}
								}}
								className="flex-1 h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
								placeholder="URL or file path..."
							/>
							<button
								type="button"
								onClick={addReference}
								className="h-10 px-3 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
							>
								Add
							</button>
						</div>
						<div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
							Paste image from clipboard in the field above to upload and attach.
							{isUploadingScreenshot ? " Uploading..." : ""}
						</div>
						{references.length > 0 ? (
							<ul className="mt-2 space-y-1">
								{references.map((ref) => (
									<li key={ref} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
										<span className="truncate flex-1">{ref}</span>
										<button
											type="button"
											onClick={() => setReferences((current) => current.filter((item) => item !== ref))}
											className="text-red-500 hover:text-red-600"
											aria-label={`Remove ${ref}`}
										>
											×
										</button>
									</li>
								))}
							</ul>
						) : null}
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div>
							<label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Priority</label>
							<select
								value={priority}
								onChange={(event) => setPriority(event.target.value as "" | "high" | "medium" | "low")}
								className="w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
							>
								{PRIORITY_OPTIONS.map((option) => (
									<option key={option.label} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Status</label>
							<select
								value={status}
								onChange={(event) => setStatus(event.target.value)}
								className="w-full h-10 px-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
							>
								{statuses.map((option) => (
									<option key={option} value={option}>
										{option}
									</option>
								))}
							</select>
						</div>
					</div>

					<div className="flex justify-end gap-2 pt-1">
						<button
							type="button"
							onClick={() => window.close()}
							className="h-10 px-4 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={() => void handleSubmit()}
							disabled={isSaving}
							className="h-10 px-4 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
						>
							{isSaving ? "Creating..." : "Create Task"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default QuickTaskWindow;
