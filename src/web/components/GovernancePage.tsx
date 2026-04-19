import React, { useEffect, useState } from "react";
import type { GovernanceReport, GovernanceReportId } from "../../types/index.ts";
import { apiClient } from "../lib/api";

const REPORT_OPTIONS: Array<{ id: GovernanceReportId; label: string; description: string }> = [
	{
		id: "missing-documentation",
		label: "Missing documentation",
		description: "Active tasks without documentation references.",
	},
	{
		id: "missing-summary-parent",
		label: "Missing summary parent",
		description: "Milestone tasks that do not belong to a modeled summary parent.",
	},
	{
		id: "invalid-labels",
		label: "Invalid labels",
		description: "Tasks using labels not declared in config.",
	},
	{
		id: "invalid-dependencies",
		label: "Invalid dependencies",
		description: "Tasks with dependencies that do not resolve locally.",
	},
	{
		id: "invalid-milestones",
		label: "Invalid milestones",
		description: "Tasks referencing missing milestone records.",
	},
];

export default function GovernancePage() {
	const [reportId, setReportId] = useState<GovernanceReportId>("missing-documentation");
	const [report, setReport] = useState<GovernanceReport | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);

		void apiClient
			.fetchGovernanceReport(reportId)
			.then((nextReport) => {
				if (!cancelled) {
					setReport(nextReport);
				}
			})
			.catch((nextError: unknown) => {
				console.error("Failed to load governance report:", nextError);
				if (!cancelled) {
					setReport(null);
					setError("Unable to load governance report.");
				}
			})
			.finally(() => {
				if (!cancelled) {
					setLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [reportId]);

	const activeOption = REPORT_OPTIONS.find((option) => option.id === reportId) || REPORT_OPTIONS[0]!;

	return (
		<div className="container mx-auto px-4 py-8 transition-colors duration-200">
			<div className="mb-6 flex flex-col gap-4">
				<div>
					<h1 className="text-2xl font-bold text-gray-900 dark:text-white">Governance Reports</h1>
					<p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
						Repeatable backlog-health reports for documentation, hierarchy, and metadata drift.
					</p>
				</div>

				<div className="max-w-md">
					<label
						htmlFor="governance-report"
						className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
					>
						Report
					</label>
					<select
						id="governance-report"
						value={reportId}
						onChange={(event) => setReportId(event.target.value as GovernanceReportId)}
						className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-stone-400"
					>
						{REPORT_OPTIONS.map((option) => (
							<option key={option.id} value={option.id}>
								{option.label}
							</option>
						))}
					</select>
					<p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{activeOption.description}</p>
				</div>
			</div>

			{loading ? (
				<div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
					Loading governance report...
				</div>
			) : error ? (
				<div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
					{error}
				</div>
			) : report ? (
				<div className="space-y-4">
					<div className="rounded-lg border border-gray-200 bg-white px-4 py-4 dark:border-gray-700 dark:bg-gray-800">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{report.title}</h2>
								<p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{report.description}</p>
							</div>
							<div className="text-right">
								<div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{report.taskCount}</div>
								<div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">matching tasks</div>
							</div>
						</div>
					</div>

					{report.findings.length === 0 ? (
						<div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
							No tasks currently match this report.
						</div>
					) : (
						<div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
							<table className="w-full border-collapse">
								<thead className="bg-gray-50 dark:bg-gray-800/80">
									<tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
										<th className="px-4 py-3">Task</th>
										<th className="px-4 py-3">Finding</th>
										<th className="px-4 py-3">Details</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
									{report.findings.map((finding) => (
										<tr key={finding.taskId} className="align-top">
											<td className="px-4 py-3">
												<div className="font-mono text-xs text-gray-500 dark:text-gray-400">{finding.taskId}</div>
												<div className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{finding.taskTitle}</div>
											</td>
											<td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">{finding.summary}</td>
											<td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
												{finding.details.length > 0 ? finding.details.join(" | ") : "—"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			) : null}
		</div>
	);
}
