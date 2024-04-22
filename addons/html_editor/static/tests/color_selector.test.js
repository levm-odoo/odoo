import { describe, expect, test } from "@odoo/hoot";
import { click, waitFor, queryOne, hover, press } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import { setupEditor, setupWysiwyg } from "./_helpers/editor";
import { getContent, setContent } from "./_helpers/selection";

test("can set foreground color", async () => {
    const { el } = await setupEditor("<p>[test]</p>");

    await waitFor(".o-we-toolbar");
    expect(".o_font_color_selector").toHaveCount(0);

    click(".o-select-color-foreground");
    await animationFrame();
    expect(".o_font_color_selector").toHaveCount(1);

    click(".o_color_button[data-color='#6BADDE']");
    await animationFrame();
    expect(".o-we-toolbar").toHaveCount(1); // toolbar still open
    expect(".o_font_color_selector").toHaveCount(0); // selector closed
    expect(getContent(el)).toBe(`<p><font style="color: rgb(107, 173, 222);">[test]</font></p>`);
});

test("can set background color", async () => {
    const { el } = await setupEditor("<p>[test]</p>");

    await waitFor(".o-we-toolbar");
    expect(".o_font_color_selector").toHaveCount(0);

    click(".o-select-color-background");
    await animationFrame();
    expect(".o_font_color_selector").toHaveCount(1);

    click(".o_color_button[data-color='#6BADDE']");
    await animationFrame();
    expect(".o-we-toolbar").toHaveCount(1); // toolbar still open
    expect(".o_font_color_selector").toHaveCount(0); // selector closed
    expect(getContent(el)).toBe(
        `<p><font style="background: rgb(107, 173, 222);">[test]</font></p>`
    );
});

test("can render and apply color theme", async () => {
    await setupEditor("<p>[test]</p>");

    await waitFor(".o-we-toolbar");
    expect(".o_font_color_selector").toHaveCount(0);
    click(".o-select-color-foreground");
    await animationFrame();
    expect(".o_font_color_selector").toHaveCount(1);
    expect("button[data-color='o-color-1']").toHaveCount(1);
    expect(queryOne("button[data-color='o-color-1']").style.backgroundColor).toBe(
        "var(--o-color-1)"
    );

    expect(".text-o-color-1").toHaveCount(0);
    click("button[data-color='o-color-1']");
    await waitFor(".text-o-color-1");
    expect(".text-o-color-1").toHaveCount(1);
});

test("can render and apply gradient color", async () => {
    await setupEditor("<p>[test]</p>");

    await waitFor(".o-we-toolbar");
    click(".o-select-color-foreground");
    await animationFrame();
    expect(queryOne("button[data-color='o-color-1']").style.backgroundColor).toBe(
        "var(--o-color-1)"
    );
    click(".btn:contains('Gradient')");
    await animationFrame();
    click(
        "button[data-color='linear-gradient(135deg, rgb(255, 204, 51) 0%, rgb(226, 51, 255) 100%)']"
    );
    await animationFrame();
    expect("i.fa-font").toHaveStyle({
        borderImage:
            "linear-gradient(135deg, rgb(255, 204, 51) 0%, rgb(226, 51, 255) 100%) 1 / 1 / 0 stretch",
    });
    expect("font.text-gradient").toHaveCount(1);
    expect("font.text-gradient").toHaveStyle({
        backgroundImage: "linear-gradient(135deg, rgb(255, 204, 51) 0%, rgb(226, 51, 255) 100%)",
    });
});

test("custom colors used in the editor are shown in the colorpicker", async () => {
    await setupEditor(
        `<p>
            <font style="color: rgb(255, 0, 0);">[test]</font>
            <font style="color: rgb(0, 255, 0);">test</font>
        </p>`
    );
    await waitFor(".o-we-toolbar");
    expect(".o_font_color_selector").toHaveCount(0);
    click(".o-select-color-foreground");
    await animationFrame();
    click(".btn:contains('Custom')");
    await animationFrame();
    expect("button[data-color='rgb(255, 0, 0)']").toHaveCount(1);
    expect(queryOne("button[data-color='rgb(255, 0, 0)']").style.backgroundColor).toBe(
        "rgb(255, 0, 0)"
    );
    expect("button[data-color='rgb(0, 255, 0)']").toHaveCount(1);
    expect(queryOne("button[data-color='rgb(0, 255, 0)']").style.backgroundColor).toBe(
        "rgb(0, 255, 0)"
    );
});

test.tags("desktop")(
    "selected text color is shown in the toolbar and update when hovering",
    async () => {
        await setupEditor(
            `<p>
            <font style="color: rgb(255, 0, 0);">[test]</font>
        </p>`
        );

        await waitFor(".o-we-toolbar");
        expect(".o_font_color_selector").toHaveCount(0);
        await animationFrame();
        expect("i.fa-font").toHaveStyle({ borderBottomColor: "rgb(255, 0, 0)" });
        click(".o-select-color-foreground");
        await animationFrame();
        // Hover a color
        hover(queryOne("button[data-color='#FF00FF']"));
        await animationFrame();
        expect("i.fa-font").toHaveStyle({ borderBottomColor: "rgb(255, 0, 255)" });
        // Hover out
        hover(queryOne(".o-select-color-foreground"));
        await animationFrame();
        expect("i.fa-font").toHaveStyle({ borderBottomColor: "rgb(255, 0, 0)" });
    }
);

test("selected text color is shown in the toolbar and update when clicking", async () => {
    await setupEditor(
        `<p>
            <font style="color: rgb(255, 0, 0);">[test]</font>
        </p>`
    );

    await waitFor(".o-we-toolbar");
    expect(".o_font_color_selector").toHaveCount(0);
    await animationFrame();
    expect("i.fa-font").toHaveStyle({ borderBottomColor: "rgb(255, 0, 0)" });
    click(".o-select-color-foreground");
    await animationFrame();
    click("button[data-color='#FF00FF']");
    await animationFrame();
    expect("i.fa-font").toHaveStyle({ borderBottomColor: "rgb(255, 0, 255)" });
});

test("collapsed selection color is shown in the permanent toolbar", async () => {
    await setupWysiwyg({
        toolbar: true,
        config: { content: `<font style="color: rgb(255, 0, 0);">t[]est</font>` },
    });
    await animationFrame();
    expect("i.fa-font").toHaveStyle({ borderBottomColor: "rgb(255, 0, 0)" });
});

test("selected color is shown and updates when selection change", async () => {
    const { el } = await setupEditor(
        `<p><font style="color: rgb(255, 156, 0);">test1</font> [test2]</p>`
    );
    await waitFor(".o-we-toolbar");
    expect(".o_font_color_selector").toHaveCount(0);
    await animationFrame();
    expect("i.fa-font").toHaveStyle({ borderBottomColor: "rgb(73, 80, 87)" });
    setContent(el, `<p><font style="color: rgb(255, 156, 0);">[test1]</font> test2</p>`);
    await animationFrame();
    expect("i.fa-font").toHaveStyle({ borderBottomColor: "rgb(255, 156, 0)" });
});

test("selected background color is shown in the toolbar and update when clicking", async () => {
    await setupEditor(
        `<p>
            <font style="background: rgb(255, 0, 0);">[test]</font>
        </p>`
    );

    await waitFor(".o-we-toolbar");
    await animationFrame();
    expect("i.fa-paint-brush").toHaveStyle({ borderBottomColor: "rgb(255, 0, 0)" });
    click(".o-select-color-background");
    await animationFrame();
    click("button[data-color='#FF00FF']");
    await animationFrame();
    expect("i.fa-paint-brush").toHaveStyle({ borderBottomColor: "rgb(255, 0, 255)" });
});

describe.tags("desktop")("color preview", () => {
    test("preview color should work and be reverted", async () => {
        await setupEditor("<p>[test]</p>");

        await waitFor(".o-we-toolbar");
        expect(".o_font_color_selector").toHaveCount(0);
        click(".o-select-color-foreground");
        await animationFrame();
        hover(queryOne("button[data-color='o-color-1']"));
        await animationFrame();
        expect("font").toHaveCount(1);
        expect("font").toHaveClass("text-o-color-1");
        hover(queryOne(".o-select-color-foreground"));
        await animationFrame();
        expect("font").toHaveCount(0);
    });

    test("preview color and close dropdown should revert the preview", async () => {
        await setupEditor("<p>[test]</p>");

        await waitFor(".o-we-toolbar");
        expect(".o_font_color_selector").toHaveCount(0);
        click(".o-select-color-foreground");
        await animationFrame();
        hover(queryOne("button[data-color='o-color-1']"));
        await animationFrame();
        expect("font").toHaveCount(1);
        expect("font").toHaveClass("text-o-color-1");
        press("escape");
        await animationFrame();
        expect("font").toHaveCount(0);
    });

    test("preview color and then apply works with undo/redo", async () => {
        const { editor } = await setupEditor("<p>[test]</p>");

        await waitFor(".o-we-toolbar");
        expect(".o_font_color_selector").toHaveCount(0);
        click(".o-select-color-foreground");
        await animationFrame();
        hover(queryOne("button[data-color='o-color-1']"));
        await animationFrame();
        expect("font").toHaveCount(1);
        expect("font").toHaveClass("text-o-color-1");
        hover(queryOne("button[data-color='o-color-2']"));
        await animationFrame();
        expect("font").toHaveCount(1);
        expect("font").toHaveClass("text-o-color-2");
        click("button[data-color='o-color-2']");
        await animationFrame();
        expect("font").toHaveCount(1);
        expect("font").toHaveClass("text-o-color-2");
        await animationFrame();
        editor.dispatch("HISTORY_UNDO");
        expect("font").toHaveCount(0);
        editor.dispatch("HISTORY_REDO");
        expect("font").toHaveCount(1);
        expect("font").toHaveClass("text-o-color-2");
    });

    test("preview color are not restored when undo", async () => {
        const { editor } = await setupEditor("<p>[test]</p>");

        await waitFor(".o-we-toolbar");
        expect(".o_font_color_selector").toHaveCount(0);
        click(".o-select-color-foreground");
        await animationFrame();
        hover(queryOne("button[data-color='o-color-1']"));
        await animationFrame();
        expect("font").toHaveCount(1);
        expect("font").toHaveClass("text-o-color-1");
        hover(queryOne("button[data-color='o-color-2']"));
        await animationFrame();
        expect("font").toHaveCount(1);
        expect("font").toHaveClass("text-o-color-2");
        press("escape");
        await animationFrame();
        expect("font").toHaveCount(0);
        editor.dispatch("HISTORY_UNDO");
        expect("font").toHaveCount(0);
    });
});
