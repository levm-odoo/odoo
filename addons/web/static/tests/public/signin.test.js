import { describe, expect, test } from "@odoo/hoot";
import { setupInteractionWhiteList, startInteractions } from "@web/../tests/public/helpers";

setupInteractionWhiteList("public.signin");
describe.current.tags("interaction_dev");

test("add and remove loading effect", async () => {
    const { core, el } = await startInteractions(`
        <div class="oe_login_form">
            <button type="submit">log in</button>
        </div>`);
    expect(core.interactions.length).toBe(1);
    const ev = new Event("submit");
    el.querySelector(".oe_login_form").dispatchEvent(ev);
    expect(el.querySelector("button")).toHaveClass(["o_btn_loading", "disabled"]);
    ev.preventDefault();
    expect(el.querySelector("button")).not.toHaveClass(["o_btn_loading", "disabled"]);
});
