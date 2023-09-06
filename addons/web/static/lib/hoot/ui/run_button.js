/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { compactXML } from "../utils";

/** @extends Component<{}, import("../setup").Environment> */
export class RunButton extends Component {
    static template = compactXML/* xml */ `
        <button
            class="hoot-abort hoot-btn hoot-row hoot-p-2 hoot-gap-1"
            t-on-click="onClick"
            t-att-title="state.text"
        >
            <t t-esc="state.text" />
        </button>
    `;

    setup() {
        const { runner } = this.env;
        this.state = useState({ text: "Start" });

        runner.beforeAll(() => {
            this.state.text = "Abort";
        });

        runner.afterAll(() => {
            this.state.text = "Run";
        });
    }

    onClick() {
        const { runner, url } = this.env;
        if (runner.status === "ready") {
            url.refresh();
        } else {
            runner.stop();
        }
    }
}
