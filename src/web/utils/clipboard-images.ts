export function getClipboardImageFiles(clipboardData: DataTransfer | null): File[] {
	if (!clipboardData?.items) {
		return [];
	}
	const files: File[] = [];
	for (const item of Array.from(clipboardData.items)) {
		if (item.kind !== "file" || !item.type.startsWith("image/")) {
			continue;
		}
		const file = item.getAsFile();
		if (file) {
			files.push(file);
		}
	}
	return files;
}
