import { setSelection } from "@html_editor/../tests/_helpers/selection";
import { insertText, undo } from "@html_editor/../tests/_helpers/user_actions";
import { expect, test } from "@odoo/hoot";
import { click, queryAll, queryAllTexts } from "@odoo/hoot-dom";
import { contains } from "@web/../tests/web_test_helpers";
import { defineWebsiteModels, setupWebsiteBuilder } from "../helpers";
import { insertStructureSnippet } from "./helpers";

defineWebsiteModels();

test("edit title in content with table of content", async () => {
    const { getEditor } = await setupWebsiteBuilder("<div></div>");
    const editor = getEditor();
    await insertStructureSnippet(editor, "s_table_of_content");
    expect(":iframe .s_table_of_content").toHaveCount(1);
    expect(queryAllTexts(":iframe .s_table_of_content_navbar a")).toEqual([
        "Intuitive system",
        "Design features",
    ]);
    expect(queryAllTexts(":iframe .s_table_of_content_main h2")).toEqual([
        "Intuitive system",
        "Design features",
    ]);

    const h2 = queryAll(":iframe .s_table_of_content_main h2:contains('Intuitive system')")[0];
    setSelection({ anchorNode: h2, anchorOffset: 0 });
    await insertText(editor, "New Title:");
    expect(queryAllTexts(":iframe .s_table_of_content_navbar a")).toEqual([
        "New Title:Intuitive system",
        "Design features",
    ]);
    expect(queryAllTexts(":iframe .s_table_of_content_main h2")).toEqual([
        "New Title:Intuitive system",
        "Design features",
    ]);

    undo(editor);
    expect(queryAllTexts(":iframe .s_table_of_content_navbar a")).toEqual([
        "New TitleIntuitive system",
        "Design features",
    ]);
    expect(queryAllTexts(":iframe .s_table_of_content_main h2")).toEqual([
        "New TitleIntuitive system",
        "Design features",
    ]);
});

test("click on addItem option button", async () => {
    const { getEditor } = await setupWebsiteBuilder("<div><p>Text</p></div>");
    const editor = getEditor();
    await insertStructureSnippet(editor, "s_table_of_content");
    expect(queryAllTexts(":iframe .s_table_of_content_navbar a")).toEqual([
        "Intuitive system",
        "Design features",
    ]);
    expect(queryAllTexts(":iframe .s_table_of_content_main h2")).toEqual([
        "Intuitive system",
        "Design features",
    ]);

    await contains(":iframe .s_table_of_content_main h2").click();
    await contains("[data-action-id='addItem']").click();
    expect(queryAllTexts(":iframe .s_table_of_content_vertical_navbar a")).toEqual([
        "Intuitive system",
        "Design features",
        "Design features",
    ]);
    expect(queryAllTexts(":iframe .s_table_of_content_main h2")).toEqual([
        "Intuitive system",
        "Design features",
        "Design features",
    ]);

    undo(editor);
    expect(queryAllTexts(":iframe .s_table_of_content_vertical_navbar a")).toEqual([
        "Intuitive system",
        "Design features",
    ]);
    expect(queryAllTexts(":iframe .s_table_of_content_main h2")).toEqual([
        "Intuitive system",
        "Design features",
    ]);
});

test("hide title in content with table of content", async () => {
    const { getEditor } = await setupWebsiteBuilder("<div></div>");
    const editor = getEditor();
    await insertStructureSnippet(editor, "s_table_of_content");
    expect(":iframe .s_table_of_content").toHaveCount(1);
    expect(queryAllTexts(":iframe .s_table_of_content_navbar a")).toEqual([
        "Intuitive system",
        "Design features",
    ]);

    // Hide title
    await contains(":iframe .s_table_of_content_main h2").click();
    const sectionOptionContainer = queryAll(".options-container").pop();
    expect(sectionOptionContainer.querySelector("div")).toHaveText("Section");
    await click(sectionOptionContainer.querySelector("[data-action-id='toggleDeviceVisibility']"));
    expect(queryAllTexts(":iframe .s_table_of_content_navbar a")).toEqual(["Design features"]);

    undo(editor);
    expect(queryAllTexts(":iframe .s_table_of_content_navbar a")).toEqual([
        "Intuitive system",
        "Design features",
    ]);
});
