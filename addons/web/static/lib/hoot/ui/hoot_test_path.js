/** @odoo-module */

import { Component, xml } from "@odoo/owl";
import { Suite } from "../core/suite";
import { Test } from "../core/test";
import { HootCopyButton } from "./hoot_copy_button";
import { HootLink } from "./hoot_link";
import { HootTagButton } from "./hoot_tag_button";

/**
 * @typedef {{
 *  canCopy?: boolean;
 *  test: Test;
 * }} HootTestPathProps
 */

/** @extends {Component<HootTestPathProps, import("../hoot").Environment>} */
export class HootTestPath extends Component {
    static components = { HootCopyButton, HootLink, HootTagButton };

    static props = {
        canCopy: Boolean,
        test: Test,
    };

    static template = xml`
        <t t-set="statusInfo" t-value="getStatusInfo()" />
        <div class="hoot-path flex items-center gap-1 whitespace-nowrap overflow-hidden">
            <span t-attf-class="inline-flex min-w-3 min-h-3 rounded-full bg-{{ statusInfo.className }}" t-att-title="statusInfo.text" />
            <span class="flex items-center overflow-hidden">
                <t t-foreach="props.test.path.slice(0, -1)" t-as="suite" t-key="suite.id">
                    <HootLink
                        type="'suite'"
                        id="suite.id"
                        class="'hoot-link text-muted whitespace-nowrap font-bold p-1 select-text hidden md:inline transition-colors'"
                        title="'Run ' + suite.fullName"
                        t-esc="suite.name"
                    />
                    <span class="select-none hidden md:inline" t-att-class="{ 'text-skip': suite.config.skip }">/</span>
                </t>
                <span
                    class="text-primary truncate font-bold p-1"
                    t-att-class="{ 'text-skip': props.test.config.skip }"
                    t-att-title="props.test.name"
                >
                    <t t-esc="props.test.name" />
                    <t t-if="!props.test.config.skip">
                        <t t-set="expectLength" t-value="props.test.lastResults?.assertions?.length or 0" />
                        <span class="select-none" t-attf-title="{{ expectLength }} assertions passed">
                            (<t t-esc="expectLength" />)
                        </span>
                    </t>
                </span>
                <t t-if="props.canCopy">
                    <HootCopyButton text="props.test.name" altText="props.test.id" />
                </t>
                <t t-if="props.test.config.multi">
                    <strong class="text-abort whitespace-nowrap mx-1">
                        x<t t-esc="props.test.visited" />
                        <t t-if="props.test.visited lt props.test.config.multi">
                            <t t-esc="'/' + props.test.config.multi" />
                        </t>
                    </strong>
                </t>
            </span>
            <t t-if="props.test.tags.length">
                <ul class="flex items-center gap-1">
                    <t t-foreach="props.test.tags.slice(0, 5)" t-as="tag" t-key="tag.id">
                        <li class="flex">
                            <HootTagButton tag="tag" />
                        </li>
                    </t>
                </ul>
            </t>
        </div>
    `;

    getStatusInfo() {
        switch (this.props.test.status) {
            case Test.ABORTED: {
                return { className: "abort", text: "aborted" };
            }
            case Test.FAILED: {
                if (this.props.test.config.todo) {
                    return { className: "todo", text: "todo" };
                } else {
                    return { className: "fail", text: "failed" };
                }
            }
            case Test.PASSED: {
                if (this.props.test.config.todo) {
                    return { className: "todo", text: "todo" };
                } else {
                    return { className: "pass", text: "passed" };
                }
            }
            default: {
                return { className: "skip", text: "skipped" };
            }
        }
    }

    /**
     * @param {Suite} suite
     */
    getSuiteInfo(suite) {
        let suites = 0;
        let tests = 0;
        let assertions = 0;
        for (const job of suite.jobs) {
            if (job instanceof Test) {
                tests++;
                assertions += job.lastResults?.assertions.length || 0;
            } else {
                suites++;
            }
        }
        return {
            id: suite.id,
            name: suite.name,
            parent: suite.parent?.name || null,
            suites,
            tests,
            assertions,
        };
    }
}
