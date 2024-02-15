/** @odoo-module alias=@web/../tests/core/overlay_service_tests default=false */

import { Component, xml } from "@odoo/owl";
import { MainComponentsContainer } from "@web/core/main_components_container";
import { overlayService } from "@web/core/overlay/overlay_service";
import { registry } from "@web/core/registry";
import { makeTestEnv } from "../helpers/mock_env";
import { getFixture, mount, nextTick } from "../helpers/utils";

let target = null;
let overlay = null;

function getOverlay(i) {
    return target.querySelector(`.o-overlay-container :nth-child(${i}) :nth-child(1)`);
}

QUnit.module("overlay service", {
    async beforeEach() {
        registry.category("services").add("overlay", overlayService);

        target = getFixture();
        const env = await makeTestEnv();
        await mount(MainComponentsContainer, target, { env });

        overlay = env.services.overlay;
    },
});

QUnit.test("simple case", async (assert) => {
    assert.containsOnce(target, ".o-overlay-container");

    class MyComp extends Component {
        static template = xml`
            <div class="overlayed"></div>
        `;
        static props = ["*"];
    }

    const remove = overlay.add(MyComp, {});
    await nextTick();
    assert.containsOnce(target, ".o-overlay-container .overlayed");

    remove();
    await nextTick();
    assert.containsNone(target, ".o-overlay-container .overlayed");
});

QUnit.test("onRemove callback", async (assert) => {
    class MyComp extends Component {
        static template = xml``;
        static props = ["*"];
    }

    const onRemove = () => assert.step("onRemove");
    const remove = overlay.add(MyComp, {}, { onRemove });

    assert.verifySteps([]);
    remove();
    assert.verifySteps(["onRemove"]);
});

QUnit.test("multiple overlays", async (assert) => {
    class MyComp extends Component {
        static template = xml`
            <div class="overlayed" t-att-class="props.className"></div>
        `;
        static props = ["*"];
    }

    const remove1 = overlay.add(MyComp, { className: "o1" });
    const remove2 = overlay.add(MyComp, { className: "o2" });
    const remove3 = overlay.add(MyComp, { className: "o3" });
    await nextTick();
    assert.containsN(target, ".overlayed", 3);
    assert.hasClass(getOverlay(1), "o1");
    assert.hasClass(getOverlay(2), "o2");
    assert.hasClass(getOverlay(3), "o3");

    remove1();
    await nextTick();
    assert.containsN(target, ".overlayed", 2);
    assert.hasClass(getOverlay(1), "o2");
    assert.hasClass(getOverlay(2), "o3");

    remove2();
    await nextTick();
    assert.containsOnce(target, ".overlayed");
    assert.hasClass(getOverlay(1), "o3");

    remove3();
    await nextTick();
    assert.containsNone(target, ".overlayed");
});

QUnit.test("sequence", async (assert) => {
    class MyComp extends Component {
        static template = xml`
            <div class="overlayed" t-att-class="props.className"></div>
        `;
        static props = ["*"];
    }

    const remove1 = overlay.add(MyComp, { className: "o1" }, { sequence: 50 });
    const remove2 = overlay.add(MyComp, { className: "o2" }, { sequence: 60 });
    const remove3 = overlay.add(MyComp, { className: "o3" }, { sequence: 40 });
    await nextTick();
    assert.containsN(target, ".overlayed", 3);
    assert.hasClass(getOverlay(1), "o3");
    assert.hasClass(getOverlay(2), "o1");
    assert.hasClass(getOverlay(3), "o2");

    remove1();
    await nextTick();
    assert.containsN(target, ".overlayed", 2);
    assert.hasClass(getOverlay(1), "o3");
    assert.hasClass(getOverlay(2), "o2");

    remove2();
    await nextTick();
    assert.containsOnce(target, ".overlayed");
    assert.hasClass(getOverlay(1), "o3");

    remove3();
    await nextTick();
    assert.containsNone(target, ".overlayed");
});
