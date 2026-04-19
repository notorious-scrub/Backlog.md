import { describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import React from "react";
import { renderToString } from "react-dom/server";
import GovernancePage from "../web/components/GovernancePage";

function setupDom() {
	const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
	globalThis.window = dom.window as unknown as Window & typeof globalThis;
	globalThis.document = dom.window.document as Document;
	globalThis.navigator = dom.window.navigator as Navigator;
	globalThis.localStorage = dom.window.localStorage;
}

describe("GovernancePage", () => {
	it("renders the governance report surface", () => {
		setupDom();

		const html = renderToString(<GovernancePage />);

		expect(html).toContain("Governance Reports");
		expect(html).toContain("Missing documentation");
		expect(html).toContain("Loading governance report");
	});
});
