import { test } from "@odoo/hoot";
import { testEditor } from "../_helpers/editor";
import { splitBlock } from "../_helpers/user_actions";

test("should replace splitElementBlock with insertLineBreak (selection start)", async () => {
    await testEditor({
        contentBefore: `<div class="oe_unbreakable">[]ab</div>`,
        stepFunction: splitBlock,
        contentAfter: `<div class="oe_unbreakable"><br>[]ab</div>`,
    });
});
test("should replace splitElementBlock with insertLineBreak (selection between)", async () => {
    await testEditor({
        contentBefore: `<div class="oe_unbreakable">a[]b</div>`,
        stepFunction: splitBlock,
        contentAfter: `<div class="oe_unbreakable">a<br>[]b</div>`,
    });
});
test("should replace splitElementBlock with insertLineBreak (selection end)", async () => {
    await testEditor({
        contentBefore: `<div class="oe_unbreakable">ab[]</div>`,
        stepFunction: splitBlock,
        contentAfter: `<div class="oe_unbreakable">ab<br>[]<br></div>`,
    });
});
