import React, { useEffect, useState } from "react";
import Modal from "./Modal";

interface ReopenTaskModalProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: (details: string, status: string) => Promise<void>;
	taskTitle: string;
	statusOptions: string[];
	defaultStatus: string;
	isSubmitting?: boolean;
}

const ReopenTaskModal: React.FC<ReopenTaskModalProps> = ({
	isOpen,
	onClose,
	onConfirm,
	taskTitle,
	statusOptions,
	defaultStatus,
	isSubmitting = false,
}) => {
	const [details, setDetails] = useState("");
	const [status, setStatus] = useState(defaultStatus);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!isOpen) return;
		setDetails("");
		setStatus(defaultStatus);
		setError(null);
	}, [isOpen, defaultStatus]);

	const handleSubmit = async () => {
		const cleanedDetails = details.trim();
		if (!cleanedDetails) {
			setError("Please provide re-open details.");
			return;
		}
		setError(null);
		await onConfirm(cleanedDetails, status);
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} title="Re-open Task" maxWidthClass="max-w-2xl">
			<div className="space-y-4">
				<p className="text-sm text-gray-700 dark:text-gray-300">
					Re-open <span className="font-semibold text-gray-900 dark:text-gray-100">{taskTitle}</span> with context
					for why this work is active again.
				</p>

				<div>
					<label
						htmlFor="reopen-status"
						className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
					>
						Re-open to status
					</label>
					<select
						id="reopen-status"
						value={status}
						onChange={(event) => setStatus(event.target.value)}
						disabled={isSubmitting}
						className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors duration-200 disabled:opacity-50"
					>
						{statusOptions.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</select>
				</div>

				<div>
					<label
						htmlFor="reopen-details"
						className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
					>
						Re-open details
					</label>
					<textarea
						id="reopen-details"
						value={details}
						onChange={(event) => setDetails(event.target.value)}
						placeholder="Describe why this task is being re-opened."
						rows={4}
						disabled={isSubmitting}
						className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors duration-200 disabled:opacity-50"
					/>
				</div>

				{error && (
					<div className="text-sm text-red-600 dark:text-red-400">
						{error}
					</div>
				)}

				<div className="flex items-center justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						disabled={isSubmitting}
						className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200 disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={() => void handleSubmit()}
						disabled={isSubmitting}
						className="px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors duration-200 disabled:opacity-50"
					>
						{isSubmitting ? "Re-opening..." : "Re-open task"}
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default ReopenTaskModal;
