import { MAIN_PLUGINS } from "@html_editor/plugin_sets";
import { expect, test } from "@odoo/hoot";
import { click, queryFirst } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import {
    Component,
    onMounted,
    onWillDestroy,
    onWillUnmount,
    useRef,
    useState,
    useSubEnv,
    xml,
} from "@odoo/owl";
import { mountWithCleanup } from "@web/../tests/web_test_helpers";
import { OwlComponentPlugin } from "../src/others/owl_component_plugin";
import { useWysiwyg } from "../src/wysiwyg";
import { setupEditor } from "./_helpers/editor";
import { getContent, setSelection } from "./_helpers/selection";
import { deleteBackward, undo } from "./_helpers/user_actions";

class Counter extends Component {
    static props = [];
    static template = xml`
        <span t-ref="root" class="counter" t-on-click="increment">Counter: <t t-esc="state.value"/></span>`;

    state = useState({ value: 0 });
    ref = useRef("root");

    increment() {
        this.state.value++;
    }
}

function getConfig(name, Comp) {
    return {
        Plugins: [...MAIN_PLUGINS, OwlComponentPlugin],
        resources: {
            inlineComponents: [{ name, Component: Comp }],
        },
    };
}

test("can mount a inline component", async () => {
    const { el } = await setupEditor(`<div><span data-embedded="counter"></span></div>`, {
        config: getConfig("counter", Counter),
    });
    expect(getContent(el)).toBe(
        `<div><span data-embedded="counter" contenteditable="false" data-oe-protected="true" data-oe-transient-content="true" data-oe-has-removable-handler="true"><span class="counter">Counter: 0</span></span></div>`
    );
    click(".counter");
    await animationFrame();
    expect(getContent(el)).toBe(
        `<div><span data-embedded="counter" contenteditable="false" data-oe-protected="true" data-oe-transient-content="true" data-oe-has-removable-handler="true"><span class="counter">Counter: 1</span></span></div>`
    );
});

test("inline component are mounted and destroyed", async () => {
    const steps = [];
    class Test extends Counter {
        setup() {
            onMounted(() => {
                steps.push("mounted");
                expect(this.ref.el.isConnected).toBe(true);
            });
            onWillUnmount(() => {
                steps.push("willunmount");
                expect(this.ref.el.isConnected).toBe(true);
            });
            onWillDestroy(() => steps.push("willdestroy"));
        }
    }
    const { el, editor } = await setupEditor(`<div><span data-embedded="counter"></span></div>`, {
        config: getConfig("counter", Test),
    });
    expect(steps).toEqual(["mounted"]);

    editor.destroy();
    expect(steps).toEqual(["mounted", "willunmount", "willdestroy"]);
    expect(getContent(el)).toBe(
        `<div><span data-embedded="counter" data-oe-protected="true" data-oe-transient-content="true"></span></div>`
    );
});

test("inline component get proper env", async () => {
    /** @type { any } */
    let env;
    class Test extends Counter {
        setup() {
            env = this.env;
        }
    }

    class Parent extends Component {
        static template = xml`<div t-ref="root"/>`;
        static props = [];

        setup() {
            useSubEnv({ somevalue: 1 });
            useWysiwyg(
                "root",
                Object.assign(getConfig("counter", Test), {
                    content: `<div><span data-embedded="counter"></span></div>`,
                })
            );
        }
    }

    await mountWithCleanup(Parent);
    expect(env.somevalue).toBe(1);
});

test("inline component are destroyed when deleted", async () => {
    const steps = [];
    class Test extends Counter {
        setup() {
            onMounted(() => {
                steps.push("mounted");
                expect(this.ref.el.isConnected).toBe(true);
            });
            onWillUnmount(() => {
                steps.push("willunmount");
                expect(this.ref.el?.isConnected).toBe(true);
            });
        }
    }
    const { el, editor } = await setupEditor(
        `<div>a<span data-embedded="counter"></span>[]</div>`,
        {
            config: getConfig("counter", Test),
        }
    );

    expect(getContent(el)).toBe(
        `<div>a<span data-embedded="counter" contenteditable="false" data-oe-protected="true" data-oe-transient-content="true" data-oe-has-removable-handler="true"><span class="counter">Counter: 0</span></span>[]</div>`
    );
    expect(steps).toEqual(["mounted"]);

    deleteBackward(editor);
    expect(steps).toEqual(["mounted", "willunmount"]);
    expect(getContent(el)).toBe(`<div>a[]</div>`);
});

test("select content of a component shouldn't open the toolbar", async () => {
    const { el } = await setupEditor(`<div><p>[a]</p><span data-embedded="counter"></span></div>`, {
        config: getConfig("counter", Counter),
    });
    await animationFrame();
    expect(".o-we-toolbar").toHaveCount(1);
    expect(getContent(el)).toBe(
        `<div><p>[a]</p><span data-embedded="counter" contenteditable="false" data-oe-protected="true" data-oe-transient-content="true" data-oe-has-removable-handler="true"><span class="counter">Counter: 0</span></span></div>`
    );

    const node = queryFirst(".counter", {}).firstChild;
    setSelection({ anchorNode: node, anchorOffset: 1, focusNode: node, focusOffset: 3 });
    await animationFrame();
    expect(getContent(el)).toBe(
        `<div><p>a</p><span data-embedded="counter" contenteditable="false" data-oe-protected="true" data-oe-transient-content="true" data-oe-has-removable-handler="true"><span class="counter">C[ou]nter: 0</span></span></div>`
    );
    expect(".o-we-toolbar").toHaveCount(0);
});

test("components delete can be undone", async () => {
    let steps = [];
    class Test extends Counter {
        setup() {
            onMounted(() => {
                steps.push("mounted");
                expect(this.ref.el.isConnected).toBe(true);
            });
            onWillUnmount(() => {
                console.trace();
                steps.push("willunmount");
                expect(this.ref.el?.isConnected).toBe(true);
            });
        }
    }
    const { el, editor } = await setupEditor(
        `<div>a<span data-embedded="counter"></span>[]</div>`,
        {
            config: getConfig("counter", Test),
        }
    );

    editor.dispatch("HISTORY_STAGE_SELECTION");

    expect(getContent(el)).toBe(
        `<div>a<span data-embedded="counter" contenteditable="false" data-oe-protected="true" data-oe-transient-content="true" data-oe-has-removable-handler="true"><span class="counter">Counter: 0</span></span>[]</div>`
    );
    expect(steps).toEqual(["mounted"]);

    deleteBackward(editor);
    expect(steps).toEqual(["mounted", "willunmount"]);
    expect(getContent(el)).toBe(`<div>a[]</div>`);

    // now, we undo and check that component still works
    steps = [];
    undo(editor);
    expect(getContent(el)).toBe(
        `<div>a<span data-embedded="counter" contenteditable="false" data-oe-protected="true" data-oe-transient-content="true" data-oe-has-removable-handler="true"></span>[]</div>`
    );
    await animationFrame();
    expect(steps).toEqual(["mounted"]);
    expect(getContent(el)).toBe(
        `<div>a<span data-embedded="counter" contenteditable="false" data-oe-protected="true" data-oe-transient-content="true" data-oe-has-removable-handler="true"><span class="counter">Counter: 0</span></span>[]</div>`
    );
    click(".counter");
    await animationFrame();
    expect(getContent(el)).toBe(
        `<div>a<span data-embedded="counter" contenteditable="false" data-oe-protected="true" data-oe-transient-content="true" data-oe-has-removable-handler="true"><span class="counter">Counter: 1</span></span>[]</div>`
    );
});
