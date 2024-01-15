export function trimPretty(item: string, maxLength: number) {
	if (item.length > maxLength) {
		return `${item.slice(0, Math.max(0, maxLength - 1))}...`;
	}

	return item;
}
