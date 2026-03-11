import React, { useEffect } from 'react';

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	title: React.ReactNode;
	children: React.ReactNode;
	maxWidthClass?: string; // e.g., "max-w-4xl"
	heightClass?: string; // e.g., "h-[94vh]" or "max-h-[94vh]"
	disableEscapeClose?: boolean; // when true, Escape won't close the modal (child can handle it)
	actions?: React.ReactNode; // optional actions rendered in header before close
}

const Modal: React.FC<ModalProps> = ({
	isOpen,
	onClose,
	title,
	children,
	maxWidthClass = "max-w-2xl",
	heightClass = "max-h-[94vh]",
	disableEscapeClose,
	actions,
}) => {
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && !disableEscapeClose) {
				onClose();
			}
		};

		if (isOpen) {
			if (!disableEscapeClose) {
				document.addEventListener('keydown', handleEscape);
			}
			document.body.style.overflow = 'hidden';
		}

		return () => {
			if (!disableEscapeClose) {
				document.removeEventListener('keydown', handleEscape);
			}
			document.body.style.overflow = 'unset';
		};
	}, [isOpen, onClose, disableEscapeClose]);

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 overflow-hidden bg-black/40 p-4 dark:bg-black/60">
			<div className="flex h-full items-start justify-center">
				<div
					className={`flex h-full min-h-0 max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-lg bg-white shadow-2xl transition-colors duration-200 dark:bg-gray-800 ${maxWidthClass} ${heightClass}`}
					onClick={(e) => e.stopPropagation()}
					role="dialog"
					aria-modal="true"
					aria-labelledby="modal-title"
				>
				<div className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b border-gray-200 bg-white/95 px-6 pt-4 pb-3 backdrop-blur dark:border-gray-700 dark:bg-gray-800/95 supports-[backdrop-filter]:bg-white/75 supports-[backdrop-filter]:dark:bg-gray-800/75">
					<div id="modal-title" className="min-w-0 flex-1 pr-4 text-base font-semibold text-gray-900 dark:text-gray-100">
						{title}
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{actions}
							<button
								onClick={onClose}
								className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded p-1 transition-colors duration-200 text-2xl leading-none w-8 h-8 flex items-center justify-center"
								aria-label="Close modal"
							>
								×
							</button>
						</div>
					</div>
				<div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-6">
					{children}
				</div>
			</div>
			</div>
		</div>
	);
};

export default Modal;
