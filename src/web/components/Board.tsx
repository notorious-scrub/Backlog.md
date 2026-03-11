import React, { useEffect, useMemo, useState } from "react";
import { type Milestone, type Task } from "../../types";
import { apiClient, type ReorderTaskPayload } from "../lib/api";
import { buildLanes, DEFAULT_LANE_KEY, groupTasksByLaneAndStatus, type LaneMode } from "../lib/lanes";
import { filterBoardTasks, getVisibleBoardStatuses } from "../utils/board-filters";
import { collectArchivedMilestoneKeys, milestoneKey } from "../utils/milestones";
import CleanupModal from "./CleanupModal";
import { SuccessToast } from "./SuccessToast";
import TaskColumn from "./TaskColumn";

interface BoardProps {
	onEditTask: (task: Task) => void;
	onNewTask: () => void;
	onNewQuickTask: () => void;
	highlightTaskId?: string | null;
	tasks: Task[];
	onRefreshData?: () => Promise<void>;
	statuses: string[];
	isLoading: boolean;
	milestones: string[];
	milestoneEntities: Milestone[];
	archivedMilestones: Milestone[];
	laneMode: LaneMode;
	onLaneChange: (mode: LaneMode) => void;
	milestoneFilter?: string | null;
	statusColors?: Record<string, string>;
}

const BOARD_SEARCH_STORAGE_KEY = "backlog.board.search";
const BOARD_HIDDEN_STATUSES_STORAGE_KEY = "backlog.board.hidden-statuses";

const Board: React.FC<BoardProps> = ({
	onEditTask,
	onNewTask,
	onNewQuickTask,
	highlightTaskId,
	tasks,
	onRefreshData,
	statuses,
	isLoading,
	milestoneEntities,
	archivedMilestones,
	laneMode,
	onLaneChange,
	milestoneFilter,
	statusColors,
}) => {
	const [updateError, setUpdateError] = useState<string | null>(null);
	const [dragSourceStatus, setDragSourceStatus] = useState<string | null>(null);
	const [dragSourceLane, setDragSourceLane] = useState<string | null>(null);
	const [showCleanupModal, setShowCleanupModal] = useState(false);
	const [cleanupSuccessMessage, setCleanupSuccessMessage] = useState<string | null>(null);
	const [collapsedLanes, setCollapsedLanes] = useState<Record<string, boolean>>({});
	const [searchQuery, setSearchQuery] = useState("");
	const [hiddenStatuses, setHiddenStatuses] = useState<string[]>([]);

	const archivedMilestoneIds = useMemo(
		() => collectArchivedMilestoneKeys(archivedMilestones, milestoneEntities),
		[archivedMilestones, milestoneEntities],
	);

	const milestoneAliasToCanonical = useMemo(() => {
		const aliasMap = new Map<string, string>();
		const activeTitleCounts = new Map<string, number>();
		const collectIdAliasKeys = (value: string): string[] => {
			const normalized = value.trim();
			const normalizedKey = normalized.toLowerCase();
			if (!normalizedKey) return [];
			const keys = new Set<string>([normalizedKey]);
			if (/^\d+$/.test(normalized)) {
				const numericAlias = String(Number.parseInt(normalized, 10));
				keys.add(numericAlias);
				keys.add(`m-${numericAlias}`);
				return Array.from(keys);
			}
			const idMatch = normalized.match(/^m-(\d+)$/i);
			if (idMatch?.[1]) {
				const numericAlias = String(Number.parseInt(idMatch[1], 10));
				keys.add(`m-${numericAlias}`);
				keys.add(numericAlias);
			}
			return Array.from(keys);
		};
		const reservedIdKeys = new Set<string>();
		for (const milestone of [...milestoneEntities, ...archivedMilestones]) {
			for (const key of collectIdAliasKeys(milestone.id)) {
				reservedIdKeys.add(key);
			}
		}
		const setAlias = (aliasKey: string, id: string, allowOverwrite: boolean) => {
			const existing = aliasMap.get(aliasKey);
			if (!existing) {
				aliasMap.set(aliasKey, id);
				return;
			}
			if (!allowOverwrite) {
				return;
			}
			const existingKey = existing.toLowerCase();
			const nextKey = id.toLowerCase();
			const preferredRawId = /^\d+$/.test(aliasKey) ? `m-${aliasKey}` : /^m-\d+$/.test(aliasKey) ? aliasKey : null;
			if (preferredRawId) {
				const existingIsPreferred = existingKey === preferredRawId;
				const nextIsPreferred = nextKey === preferredRawId;
				if (existingIsPreferred && !nextIsPreferred) {
					return;
				}
				if (nextIsPreferred && !existingIsPreferred) {
					aliasMap.set(aliasKey, id);
				}
				return;
			}
			aliasMap.set(aliasKey, id);
		};
		const addIdAliases = (id: string, options?: { allowOverwrite?: boolean }) => {
			const allowOverwrite = options?.allowOverwrite ?? true;
			const idKey = id.toLowerCase();
			setAlias(idKey, id, allowOverwrite);
			const idMatch = id.match(/^m-(\d+)$/i);
			if (!idMatch?.[1]) return;
			const numericAlias = String(Number.parseInt(idMatch[1], 10));
			const canonicalId = `m-${numericAlias}`;
			setAlias(canonicalId, id, allowOverwrite);
			setAlias(numericAlias, id, allowOverwrite);
		};
		for (const milestone of milestoneEntities) {
			const title = milestone.title.trim();
			if (!title) continue;
			const titleKey = title.toLowerCase();
			activeTitleCounts.set(titleKey, (activeTitleCounts.get(titleKey) ?? 0) + 1);
		}
		const activeTitleKeys = new Set(activeTitleCounts.keys());
		for (const milestone of milestoneEntities) {
			const id = milestone.id.trim();
			const title = milestone.title.trim();
			if (!id) continue;
			addIdAliases(id);
			if (title) {
				const titleKey = title.toLowerCase();
				if (!reservedIdKeys.has(titleKey) && activeTitleCounts.get(titleKey) === 1) {
					if (!aliasMap.has(titleKey)) {
						aliasMap.set(titleKey, id);
					}
				}
			}
		}
		const archivedTitleCounts = new Map<string, number>();
		for (const milestone of archivedMilestones) {
			const title = milestone.title.trim();
			if (!title) continue;
			const titleKey = title.toLowerCase();
			if (activeTitleKeys.has(titleKey)) {
				continue;
			}
			archivedTitleCounts.set(titleKey, (archivedTitleCounts.get(titleKey) ?? 0) + 1);
		}
		for (const milestone of archivedMilestones) {
			const id = milestone.id.trim();
			const title = milestone.title.trim();
			if (!id) continue;
			addIdAliases(id, { allowOverwrite: false });
			if (title) {
				const titleKey = title.toLowerCase();
				if (!activeTitleKeys.has(titleKey) && !reservedIdKeys.has(titleKey) && archivedTitleCounts.get(titleKey) === 1) {
					if (!aliasMap.has(titleKey)) {
						aliasMap.set(titleKey, id);
					}
				}
			}
		}
		return aliasMap;
	}, [milestoneEntities, archivedMilestones]);

	const canonicalizeMilestone = (value?: string | null): string => {
		const normalized = (value ?? "").trim();
		if (!normalized) return "";
		const key = normalized.toLowerCase();
		const direct = milestoneAliasToCanonical.get(key);
		if (direct) {
			return direct;
		}
		const idMatch = normalized.match(/^m-(\d+)$/i);
		if (idMatch?.[1]) {
			const numericAlias = String(Number.parseInt(idMatch[1], 10));
			return milestoneAliasToCanonical.get(`m-${numericAlias}`) ?? milestoneAliasToCanonical.get(numericAlias) ?? normalized;
		}
		if (/^\d+$/.test(normalized)) {
			const numericAlias = String(Number.parseInt(normalized, 10));
			return milestoneAliasToCanonical.get(`m-${numericAlias}`) ?? milestoneAliasToCanonical.get(numericAlias) ?? normalized;
		}
		return normalized;
	};

	const canonicalMilestoneFilter = canonicalizeMilestone(milestoneFilter);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}
		setSearchQuery(window.localStorage.getItem(BOARD_SEARCH_STORAGE_KEY) ?? "");
		try {
			const rawValue = window.localStorage.getItem(BOARD_HIDDEN_STATUSES_STORAGE_KEY);
			const parsed = rawValue ? JSON.parse(rawValue) : [];
			if (Array.isArray(parsed)) {
				setHiddenStatuses(
					parsed.filter((status): status is string => typeof status === "string" && status.trim().length > 0),
				);
			}
		} catch {
			setHiddenStatuses([]);
		}
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}
		window.localStorage.setItem(BOARD_SEARCH_STORAGE_KEY, searchQuery);
	}, [searchQuery]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}
		window.localStorage.setItem(BOARD_HIDDEN_STATUSES_STORAGE_KEY, JSON.stringify(hiddenStatuses));
	}, [hiddenStatuses]);

	useEffect(() => {
		const availableStatuses = new Set(statuses.map((status) => status.trim().toLowerCase()));
		setHiddenStatuses((current) => current.filter((status) => availableStatuses.has(status.trim().toLowerCase())));
	}, [statuses]);

	const milestoneScopedTasks = useMemo(() => {
		if (!milestoneFilter) return tasks;
		return tasks.filter((task) => canonicalizeMilestone(task.milestone) === canonicalMilestoneFilter);
	}, [tasks, milestoneFilter, canonicalMilestoneFilter, milestoneAliasToCanonical]);

	const visibleStatuses = useMemo(
		() => getVisibleBoardStatuses(statuses, hiddenStatuses),
		[statuses, hiddenStatuses],
	);

	const filteredTasks = useMemo(
		() =>
			filterBoardTasks(milestoneScopedTasks, {
				query: searchQuery,
				hiddenStatuses,
			}),
		[milestoneScopedTasks, searchQuery, hiddenStatuses],
	);

	const hasBoardFilters = searchQuery.trim().length > 0 || hiddenStatuses.length > 0;

	useEffect(() => {
		if (highlightTaskId && tasks.length > 0) {
			const taskToHighlight = tasks.find((task) => task.id === highlightTaskId);
			if (taskToHighlight) {
				setTimeout(() => {
					onEditTask(taskToHighlight);
				}, 100);
			}
		}
	}, [highlightTaskId, tasks, onEditTask]);

	const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
		try {
			await apiClient.updateTask(taskId, updates);
			if (onRefreshData) {
				await onRefreshData();
			}
			setUpdateError(null);
		} catch (err) {
			setUpdateError(err instanceof Error ? err.message : "Failed to update task");
		}
	};

	const handleTaskReorder = async (payload: ReorderTaskPayload) => {
		try {
			await apiClient.reorderTask(payload);
			if (onRefreshData) {
				await onRefreshData();
			}
			setUpdateError(null);
		} catch (err) {
			setUpdateError(err instanceof Error ? err.message : "Failed to reorder task");
		}
	};

	const handleCleanupSuccess = async (movedCount: number) => {
		setShowCleanupModal(false);
		setCleanupSuccessMessage(`Successfully moved ${movedCount} task${movedCount !== 1 ? "s" : ""} to completed folder`);

		if (onRefreshData) {
			await onRefreshData();
		}

		setTimeout(() => {
			setCleanupSuccessMessage(null);
		}, 4000);
	};

	const lanes = useMemo(
		() =>
			buildLanes(laneMode, tasks, milestoneEntities.map((milestone) => milestone.id), milestoneEntities, {
				archivedMilestoneIds,
				archivedMilestones,
			}),
		[laneMode, tasks, milestoneEntities, archivedMilestoneIds, archivedMilestones],
	);

	const hasTasksWithMilestones = useMemo(() => {
		if (archivedMilestoneIds.length === 0) {
			return tasks.some((task) => task.milestone && task.milestone.trim() !== "");
		}
		const archivedKeys = new Set(archivedMilestoneIds.map((value) => milestoneKey(value)));
		return tasks.some((task) => {
			const key = milestoneKey(canonicalizeMilestone(task.milestone));
			return key.length > 0 && !archivedKeys.has(key);
		});
	}, [tasks, archivedMilestoneIds, milestoneAliasToCanonical]);

	const filteredTasksByLane = useMemo(
		() =>
			groupTasksByLaneAndStatus(laneMode, lanes, visibleStatuses, filteredTasks, {
				archivedMilestoneIds,
				milestoneEntities,
				archivedMilestones,
			}),
		[laneMode, lanes, visibleStatuses, filteredTasks, archivedMilestoneIds, milestoneEntities, archivedMilestones],
	);

	const getTasksForLane = (laneKey: string, status: string): Task[] => {
		const statusMap = filteredTasksByLane.get(laneKey);
		if (!statusMap) {
			return [];
		}
		return statusMap.get(status) ?? [];
	};

	const laneTaskCount = (laneKey: string): number => {
		const statusMap = filteredTasksByLane.get(laneKey);
		if (!statusMap) return 0;
		let count = 0;
		for (const list of statusMap.values()) {
			count += list.length;
		}
		return count;
	};

	const countDoneTasksInLane = (laneKey: string): number => {
		const statusMap = filteredTasksByLane.get(laneKey);
		if (!statusMap) return 0;
		let count = 0;
		for (const [status, taskList] of statusMap) {
			if (status.toLowerCase().includes("done") || status.toLowerCase().includes("complete")) {
				count += taskList.length;
			}
		}
		return count;
	};

	const getLaneProgress = (laneKey: string): number => {
		const total = laneTaskCount(laneKey);
		if (total === 0) return 0;
		const done = countDoneTasksInLane(laneKey);
		return Math.round((done / total) * 100);
	};

	const visibleLanes = useMemo(() => {
		if (laneMode !== "milestone") return lanes;
		return lanes.filter((lane) => laneTaskCount(lane.key) > 0);
	}, [laneMode, lanes, filteredTasksByLane]);

	const shouldShowLaneHeaders = useMemo(() => {
		if (laneMode !== "milestone") return false;
		return visibleLanes.length > 1;
	}, [laneMode, visibleLanes]);

	const isLaneCollapsed = (laneKey: string, laneMilestone?: string): boolean => {
		if (collapsedLanes[laneKey] !== undefined) {
			return collapsedLanes[laneKey];
		}
		if (milestoneFilter && canonicalizeMilestone(laneMilestone) !== canonicalMilestoneFilter) {
			return true;
		}
		return false;
	};

	const getLaneLabel = (lane: (typeof lanes)[0]): string => {
		if (lane.isNoMilestone || !lane.milestone) {
			return "Unassigned";
		}
		return lane.label;
	};

	const toggleLaneCollapse = (laneKey: string) => {
		setCollapsedLanes((prev) => ({
			...prev,
			[laneKey]: !prev[laneKey],
		}));
	};

	const toggleStatusVisibility = (status: string) => {
		const normalizedStatus = status.trim().toLowerCase();
		setHiddenStatuses((current) => {
			const isHidden = current.some((value) => value.trim().toLowerCase() === normalizedStatus);
			if (isHidden) {
				return current.filter((value) => value.trim().toLowerCase() !== normalizedStatus);
			}
			return [...current, status];
		});
	};

	const clearBoardFilters = () => {
		setSearchQuery("");
		setHiddenStatuses([]);
	};

	if (isLoading && statuses.length === 0) {
		return (
			<div className="flex items-center justify-center py-8">
				<div className="text-lg text-gray-600 dark:text-gray-300 transition-colors duration-200">Loading tasks...</div>
			</div>
		);
	}

	return (
		<div className="w-full">
			{updateError && (
				<div className="mb-4 rounded-md bg-red-100 px-4 py-3 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-200 transition-colors duration-200">
					{updateError}
				</div>
			)}

			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-4">
					<h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 transition-colors duration-200">Kanban Board</h2>
					<div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-1 bg-gray-50 dark:bg-gray-800/50 transition-colors duration-200">
						<button
							type="button"
							onClick={() => onLaneChange("none")}
							className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
								laneMode === "none"
									? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
									: "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
							}`}
						>
							All Tasks
						</button>
						<button
							type="button"
							onClick={() => onLaneChange("milestone")}
							disabled={!hasTasksWithMilestones}
							title={!hasTasksWithMilestones ? "No tasks have milestones. Assign milestones to tasks first." : "Group tasks by milestone"}
							className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
								!hasTasksWithMilestones
									? "text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50"
									: laneMode === "milestone"
										? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
										: "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
							}`}
						>
							Milestone
						</button>
					</div>
				</div>
				<div className="inline-flex items-center gap-2">
					<button
						className="inline-flex items-center px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-400 dark:focus:ring-blue-500 dark:focus:ring-offset-gray-800 transition-colors duration-200"
						onClick={onNewTask}
					>
						+ New Task
					</button>
					<button
						className="inline-flex items-center px-4 py-2 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-sm font-medium rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-400 dark:focus:ring-blue-500 dark:focus:ring-offset-gray-800 transition-colors duration-200"
						onClick={onNewQuickTask}
					>
						+ Quick Task
					</button>
				</div>
			</div>

			<div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-4 transition-colors duration-200">
				<div className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="relative flex-1 min-w-[220px] max-w-md">
							<span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 dark:text-gray-500">
								<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
								</svg>
							</span>
							<input
								type="text"
								value={searchQuery}
								onChange={(event) => setSearchQuery(event.target.value)}
								placeholder="Search cards on the board"
								className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-10 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
							/>
							{searchQuery && (
								<button
									type="button"
									onClick={() => setSearchQuery("")}
									className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
									aria-label="Clear board search"
								>
									<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							)}
						</div>

						<div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
							<span>
								Showing {filteredTasks.length} of {milestoneScopedTasks.length} cards
							</span>
							<button
								type="button"
								onClick={hasBoardFilters ? clearBoardFilters : undefined}
								className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
								style={{ visibility: hasBoardFilters ? "visible" : "hidden" }}
								aria-hidden={!hasBoardFilters}
							>
								Clear filters
							</button>
						</div>
					</div>

					<div className="flex flex-col gap-2">
						<div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Visible columns</div>
						<div className="flex flex-wrap gap-2">
							{statuses.map((status) => {
								const isVisible = visibleStatuses.includes(status);
								return (
									<button
										key={status}
										type="button"
										onClick={() => toggleStatusVisibility(status)}
										className={`rounded-full border px-3 py-1.5 text-sm transition-colors duration-200 ${
											isVisible
												? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200"
												: "border-gray-300 bg-white text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400"
										}`}
										aria-pressed={isVisible}
									>
										{status}
									</button>
								);
							})}
						</div>
					</div>
				</div>
			</div>

			{visibleStatuses.length === 0 ? (
				<div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
					All kanban columns are hidden. Re-enable at least one status above.
				</div>
			) : filteredTasks.length === 0 ? (
				<div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-6 py-12 text-center">
					<div className="text-sm font-medium text-gray-700 dark:text-gray-200">No cards match the current board filters.</div>
					<div className="mt-1 text-sm text-gray-500 dark:text-gray-400">Try a broader search or show more statuses.</div>
				</div>
			) : laneMode === "milestone" ? (
				<div className="space-y-6">
					{visibleLanes.map((lane) => {
						const taskCount = laneTaskCount(lane.key);
						const progress = getLaneProgress(lane.key);
						const isCollapsed = isLaneCollapsed(lane.key, lane.milestone);

						return (
							<div key={lane.key} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/20 overflow-hidden">
								{shouldShowLaneHeaders && (
									<button
										type="button"
										onClick={() => toggleLaneCollapse(lane.key)}
										className={`w-full flex items-center justify-between gap-4 px-4 py-3 bg-gray-100/80 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 group ${!isCollapsed ? "border-b border-gray-200 dark:border-gray-700" : ""}`}
									>
										<div className="flex items-center gap-3 min-w-0">
											<svg
												className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${isCollapsed ? "" : "rotate-90"}`}
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
											</svg>
											<h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 transition-colors duration-200 truncate">
												{getLaneLabel(lane)}
											</h3>
											<span className="shrink-0 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors duration-200">
												{taskCount}
											</span>
										</div>

										<div className="flex items-center gap-2 shrink-0">
											<div className="w-20 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
												<div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
											</div>
											<span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-8 text-right">{progress}%</span>
										</div>
									</button>
								)}

								{!isCollapsed && (
									<div className="p-4">
										<div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${visibleStatuses.length}, minmax(0, 1fr))` }}>
											{visibleStatuses.map((status) => (
												<div key={`${lane.key}-${status}`} className="min-w-0">
													<TaskColumn
														title={status}
														tasks={getTasksForLane(lane.key, status)}
														onTaskUpdate={handleTaskUpdate}
														onEditTask={onEditTask}
														onTaskReorder={handleTaskReorder}
														dragSourceStatus={dragSourceStatus}
														dragSourceLane={dragSourceLane}
														laneId={lane.key}
														targetMilestone={lane.milestone ?? null}
														statusColors={statusColors}
														onDragStart={({ status: draggedStatus, laneId }) => {
															setDragSourceStatus(draggedStatus);
															setDragSourceLane(laneId ?? null);
														}}
														onDragEnd={() => {
															setDragSourceStatus(null);
															setDragSourceLane(null);
														}}
														onCleanup={status.toLowerCase() === "done" ? () => setShowCleanupModal(true) : undefined}
													/>
												</div>
											))}
										</div>
									</div>
								)}
							</div>
						);
					})}
				</div>
			) : (
				<div className="overflow-x-auto pb-2">
					<div className="flex flex-row flex-nowrap gap-4 w-full">
						{visibleStatuses.map((status) => (
							<div key={status} className="flex-1 min-w-[16rem]">
								<TaskColumn
									title={status}
									tasks={getTasksForLane(DEFAULT_LANE_KEY, status)}
									onTaskUpdate={handleTaskUpdate}
									onEditTask={onEditTask}
									onTaskReorder={handleTaskReorder}
									dragSourceStatus={dragSourceStatus}
									dragSourceLane={dragSourceLane}
									laneId={DEFAULT_LANE_KEY}
									statusColors={statusColors}
									onDragStart={({ status: draggedStatus, laneId }) => {
										setDragSourceStatus(draggedStatus);
										setDragSourceLane(laneId ?? null);
									}}
									onDragEnd={() => {
										setDragSourceStatus(null);
										setDragSourceLane(null);
									}}
									onCleanup={status.toLowerCase() === "done" ? () => setShowCleanupModal(true) : undefined}
								/>
							</div>
						))}
					</div>
				</div>
			)}

			<CleanupModal isOpen={showCleanupModal} onClose={() => setShowCleanupModal(false)} onSuccess={handleCleanupSuccess} />

			{cleanupSuccessMessage && (
				<SuccessToast
					message={cleanupSuccessMessage}
					onDismiss={() => setCleanupSuccessMessage(null)}
					icon={
						<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					}
				/>
			)}
		</div>
	);
};

export default Board;
