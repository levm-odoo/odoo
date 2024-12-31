import { test } from "@odoo/hoot";
import { testEditor } from "./_helpers/editor";

test("should remove empty class attribute", async () => {
    // content after is compared after cleaning up DOM
    await testEditor({
        contentBefore: '<pre class=""><br></pre>',
        contentAfter: "<pre><br></pre>",
    });
});
