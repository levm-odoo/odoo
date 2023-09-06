/** @odoo-module **/

import { Component } from "@odoo/owl";
import { Test } from "../core/test";
import { compactXML } from "../utils";
import { ICONS } from "./icons";
import { TagButton } from "./tag_button";
import { navigator } from "../globals";

/** @extends Component<{}, import("../setup").Environment> */
export class TestPath extends Component {
    static components = { TagButton };

    static props = { test: Test };

    static template = compactXML/* xml */ `
        <span class="hoot-path hoot-row">
            <span class="hoot-suites hoot-row hoot-hide-sm">
                <t t-foreach="props.test.path.slice(0, -1)" t-as="suite" t-key="suite.id">
                    <a
                        t-att-href="env.url.withParams('suite', suite.id)"
                        class="hoot-suite hoot-truncate hoot-result-button-text hoot-row hoot-p-1"
                        t-att-class="{ 'hoot-skipped': suite.skip }"
                        draggable="false"
                        t-attf-title='Run suite "{{ suite.name }}"'
                    >
                        ${ICONS.play}
                        <span class="hoot-text" t-esc="suite.name" />
                    </a>
                    <span class="hoot-mx-1" t-att-class="{ 'hoot-skipped': suite.skip }">&gt;</span>
                </t>
            </span>
            <span
                class="hoot-test hoot-truncate hoot-row hoot-gap-1"
                t-att-class="{ 'hoot-skipped': props.test.skip }"
                t-att-title="props.test.name"
                draggable="false"
            >
                <t t-esc="props.test.name" />
                <span class="hoot-select-none" t-if="!props.test.skip">
                    (<t t-esc="props.test.lastResults.assertions?.length or 0" />)
                </span>
                <button class="hoot-copy" t-on-click="copy">
                    copy
                </button>
            </span>
        </span>
        <t t-if="props.test.tags.length">
            <ul class="hoot-tags hoot-row">
                <t t-foreach="props.test.tags" t-as="tag" t-key="tag.id">
                    <li>
                        <TagButton tag="tag" />
                    </li>
                </t>
            </ul>
        </t>
    `;

    copy() {
        navigator.clipboard.writeText(this.props.test.name);
    }
}
