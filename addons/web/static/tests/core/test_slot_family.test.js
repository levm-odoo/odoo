import { test } from "@odoo/hoot";
import { Component, xml } from "@odoo/owl";
import { mountWithCleanup } from "@web/../tests/web_test_helpers";

test.debug("simple rendering", async function () {
    class B extends Component {
        static template = xml`
            <t t-foreach="props.slots" t-as="slotName" t-key="slot_index">
                <t t-slot="{{ props.slots[slotName] }}"/>
            </t>
        `;
    }
    class Parent extends Component {
        components = { B };
        static template = xml`
            <t t-set="bSlots" t-value="{}"/>
            <t t-foreach="xs" t-as="x">
                <t t-set-block="bSlots[x_index]" t-block-scope="">
                    <span t-esc="x"/>
                </t>
            </t>
            <B slots="bSlots"/>
            <C slots="bSlots"/>
        `;
        xs = ["a", "b", "c"];
    }
    mountWithCleanup(Parent);
});
