import { describe, expect, test } from "@odoo/hoot";
import { animationFrame, queryAllTexts, queryFirst } from "@odoo/hoot-dom";
import { Component, onWillStart, xml } from "@odoo/owl";
import { contains, patchWithCleanup } from "@web/../tests/web_test_helpers";
import { addOption, defineWebsiteModels, setupWebsiteBuilder } from "../helpers";
import { defaultBuilderComponents } from "../../src/builder/builder_components/default_builder_components";
import { OptionsContainer } from "../../src/builder/components/option_container";
import { setSelection } from "@html_editor/../tests/_helpers/selection";

defineWebsiteModels();

test("Open custom tab with template option", async () => {
    addOption({
        selector: ".test-options-target",
        template: xml`
        <BuilderRow label="'Row 1'">
            Test
        </BuilderRow>`,
    });
    await setupWebsiteBuilder(`<div class="test-options-target" data-name="Yop">b</div>`);
    await contains(":iframe .test-options-target").click();
    expect(".options-container").toBeDisplayed();
    expect(queryAllTexts(".options-container > div")).toEqual(["Yop", "Row 1\nTest"]);
});

test("Open custom tab with Component option", async () => {
    class TestOption extends Component {
        static template = xml`
            <BuilderRow label="'Row 1'">
                Test
            </BuilderRow>`;
        static components = { ...defaultBuilderComponents };
        static props = {};
    }
    addOption({
        selector: ".test-options-target",
        Component: TestOption,
    });
    await setupWebsiteBuilder(`<div class="test-options-target" data-name="Yop">b</div>`);
    await contains(":iframe .test-options-target").click();
    expect(".options-container").toBeDisplayed();
    expect(queryAllTexts(".options-container > div")).toEqual(["Yop", "Row 1\nTest"]);
});

test("Don't display option base on exclude", async () => {
    addOption({
        selector: ".test-options-target",
        exclude: ".test-exclude",
        template: xml`<BuilderRow label="'Row 1'">a</BuilderRow>`,
    });
    addOption({
        selector: ".test-options-target",
        exclude: ".test-exclude-2",
        template: xml`<BuilderRow label="'Row 2'">b</BuilderRow>`,
    });
    addOption({
        selector: ".test-options-target",
        template: xml`<BuilderRow label="'Row 3'">
            <BuilderButton classAction="'test-exclude-2'">c</BuilderButton>
        </BuilderRow>`,
    });
    await setupWebsiteBuilder(`<div class="test-options-target test-exclude">b</div>`);
    await contains(":iframe .test-options-target").click();
    expect(queryAllTexts(".options-container .hb-row")).toEqual(["Row 2\nb", "Row 3\nc"]);

    await contains("[data-class-action='test-exclude-2']").click();
    expect(queryAllTexts(".options-container .hb-row")).toEqual(["Row 3\nc"]);
});

test("basic multi options containers", async () => {
    addOption({
        selector: ".test-options-target",
        template: xml`
        <BuilderRow label="'Row 1'">A</BuilderRow>`,
    });
    addOption({
        selector: ".a",
        template: xml`
        <BuilderRow label="'Row 2'">B</BuilderRow>`,
    });
    addOption({
        selector: ".main",
        template: xml`
        <BuilderRow label="'Row 3'">C</BuilderRow>`,
    });
    await setupWebsiteBuilder(`<div class="main"><p class="test-options-target a">b</p></div>`);
    await contains(":iframe .test-options-target").click();
    expect(".options-container").toHaveCount(2);
    expect(queryAllTexts(".options-container:first .we-bg-options-container > div > div")).toEqual([
        "Row 3",
        "C",
    ]);
    expect(
        queryAllTexts(".options-container:nth-child(2) .we-bg-options-container > div > div")
    ).toEqual(["Row 1", "A", "Row 2", "B"]);
});

test("option that matches several elements", async () => {
    addOption({
        selector: ".a",
        template: xml`<BuilderRow label="'Row'">
            <BuilderButton classAction="'my-custom-class'">Test</BuilderButton>
        </BuilderRow>`,
    });

    await setupWebsiteBuilder(`<div class="a"><div class="a test-target">b</div></div>`);
    await contains(":iframe .test-target").click();
    expect(".options-container:not(.d-none)").toHaveCount(2);
    expect(queryAllTexts(".options-container:not(.d-none)")).toEqual([
        "Block\nRow\nTest",
        "Block\nRow\nTest",
    ]);
});

test("Snippets options respect sequencing", async () => {
    addOption({
        selector: ".test-options-target",
        template: xml`
        <BuilderRow label="'Row 2'">
            Test
        </BuilderRow>`,
        sequence: 2,
    });
    addOption({
        selector: ".test-options-target",
        template: xml`
        <BuilderRow label="'Row 1'">
            Test
        </BuilderRow>`,
        sequence: 1,
    });
    addOption({
        selector: ".test-options-target",
        template: xml`
        <BuilderRow label="'Row 3'">
            Test
        </BuilderRow>`,
        sequence: 3,
    });
    await setupWebsiteBuilder(`<div class="test-options-target" data-name="Yop">b</div>`);
    await contains(":iframe .test-options-target").click();
    expect(".options-container").toBeDisplayed();
    expect(queryAllTexts(".options-container .we-bg-options-container > div > div")).toEqual([
        "Row 1",
        "Test",
        "Row 2",
        "Test",
        "Row 3",
        "Test",
    ]);
});

test("hide empty OptionContainer and display OptionContainer with content", async () => {
    addOption({
        selector: ".parent-target",
        template: xml`<BuilderRow label="'Row 1'">
            <BuilderButton applyTo="'.child-target'" classAction="'my-custom-class'"/>
        </BuilderRow>`,
    });
    addOption({
        selector: ".parent-target > div",
        template: xml`<BuilderRow label="'Row 3'">
            <BuilderButton applyTo="'.my-custom-class'" classAction="'test'"/>
        </BuilderRow>`,
    });
    await setupWebsiteBuilder(
        `<div class="parent-target"><div><div class="child-target">b</div></div></div>`
    );

    await contains(":iframe .parent-target > div").click();
    expect(".options-container:not(.d-none)").toHaveCount(1);

    await contains("[data-class-action='my-custom-class']").click();
    expect(".options-container:not(.d-none)").toHaveCount(2);
});

test("hide empty OptionContainer and display OptionContainer with content (with BuilderButtonGroup)", async () => {
    addOption({
        selector: ".parent-target",
        template: xml`<BuilderRow label="'Row 1'">
            <BuilderButton applyTo="'.child-target'" classAction="'my-custom-class'"/>
        </BuilderRow>`,
    });

    addOption({
        selector: ".parent-target > div",
        template: xml`
            <BuilderRow label="'Row 2'">
                <BuilderButtonGroup>
                    <BuilderButton applyTo="'.my-custom-class'" classAction="'test'">Test</BuilderButton>
                </BuilderButtonGroup>
            </BuilderRow>`,
    });

    await setupWebsiteBuilder(
        `<div class="parent-target"><div><div class="child-target">b</div></div></div>`
    );
    await contains(":iframe .parent-target > div").click();
    expect(".options-container:not(.d-none)").toHaveCount(1);

    await contains("[data-class-action='my-custom-class']").click();
    expect(".options-container:not(.d-none)").toHaveCount(2);
    expect(".options-container:not(.d-none):nth-child(2)").toHaveText("Block\nRow 2\nTest");
});

test("hide empty OptionContainer and display OptionContainer with content (with BuilderButtonGroup) - 2", async () => {
    addOption({
        selector: ".parent-target",
        template: xml`<BuilderRow label="'Row 1'">
            <BuilderButton applyTo="'.child-target'" classAction="'my-custom-class'"/>
        </BuilderRow>`,
    });

    addOption({
        selector: ".parent-target > div",
        template: xml`
            <BuilderRow label="'Row 2'">
                <BuilderButtonGroup applyTo="'.my-custom-class'">
                    <BuilderButton  classAction="'test'">Test</BuilderButton>
                </BuilderButtonGroup>
            </BuilderRow>`,
    });

    await setupWebsiteBuilder(
        `<div class="parent-target"><div><div class="child-target">b</div></div></div>`
    );
    await contains(":iframe .parent-target > div").click();
    expect(".options-container:not(.d-none)").toHaveCount(1);

    await contains("[data-class-action='my-custom-class']").click();
    expect(".options-container:not(.d-none)").toHaveCount(2);
    expect(".options-container:not(.d-none):nth-child(2)").toHaveText("Block\nRow 2\nTest");
});

test("fallback on the 'Blocks' tab if no option match the selected element", async () => {
    await setupWebsiteBuilder(`<div class="parent-target"><div class="child-target">b</div></div>`);
    await contains(":iframe .parent-target > div").click();
    expect(".o-snippets-tabs button:contains('BLOCKS')").toHaveClass("active");
});

test("display empty message if no option container is visible", async () => {
    addOption({
        selector: ".parent-target",
        template: xml`<BuilderRow label="'Row 1'">
            <BuilderButton applyTo="'.invalid'" classAction="'my-custom-class'"/>
        </BuilderRow>`,
    });

    await setupWebsiteBuilder(`<div class="parent-target"><div class="child-target">b</div></div>`);
    await contains(":iframe .parent-target > div").click();
    await animationFrame();
    expect(".o_customize_tab").toHaveText("Select a block on your page to style it.");
});
test("hide/display option base on selector", async () => {
    addOption({
        selector: ".parent-target",
        template: xml`<BuilderRow label="'Row 1'">
            <BuilderButton classAction="'my-custom-class'"/>
        </BuilderRow>`,
    });
    addOption({
        selector: ".my-custom-class",
        template: xml`<BuilderRow label="'Row 2'">
            <BuilderButton classAction="'test'"/>
        </BuilderRow>`,
    });

    await setupWebsiteBuilder(`<div class="parent-target"><div class="child-target">b</div></div>`);
    await contains(":iframe .parent-target").click();
    expect("[data-class-action='test']").not.toBeDisplayed();

    await contains("[data-class-action='my-custom-class']").click();
    expect("[data-class-action='test']").toBeDisplayed();
});

test("hide/display option container base on selector", async () => {
    addOption({
        selector: ".parent-target",
        template: xml`<BuilderRow label="'Row 1'">
            <BuilderButton applyTo="'.child-target'" classAction="'my-custom-class'"/>
        </BuilderRow>`,
    });
    addOption({
        selector: ".my-custom-class",
        template: xml`<BuilderRow label="'Row 2'">
            <BuilderButton classAction="'test'"/>
        </BuilderRow>`,
    });

    addOption({
        selector: ".sub-child-target",
        template: xml`<BuilderRow label="'Row 3'">
            <BuilderButton classAction="'another-custom-class'"/>
        </BuilderRow>`,
    });

    await setupWebsiteBuilder(`
        <div class="parent-target">
            <div class="child-target">
                <div class="sub-child-target">b</div>
            </div>
        </div>`);
    await contains(":iframe .sub-child-target").click();
    expect("[data-class-action='test']").not.toBeDisplayed();
    const selectorRowLabel = ".options-container .hb-row:not(.d-none) > div:nth-child(1)";
    expect(queryAllTexts(selectorRowLabel)).toEqual(["Row 1", "Row 3"]);

    await contains("[data-class-action='my-custom-class']").click();
    expect("[data-class-action='test']").toBeDisplayed();
    expect(queryAllTexts(selectorRowLabel)).toEqual(["Row 1", "Row 2", "Row 3"]);
});

test("don't rerender the OptionsContainer every time you click on the same element", async () => {
    addOption({
        selector: ".parent-target",
        template: xml`<BuilderRow label="'Row 1'">
            <BuilderButton applyTo="'.child-target'" classAction="'my-custom-class'"/>
        </BuilderRow>`,
    });

    patchWithCleanup(OptionsContainer.prototype, {
        setup() {
            super.setup();
            onWillStart(() => {
                expect.step("onWillStart");
            });
        },
    });

    await setupWebsiteBuilder(`
        <div class="parent-target">
            <div class="child-target">
                <div class="sub-child-target">b</div>
            </div>
        </div>`);
    await contains(":iframe .sub-child-target").click();
    expect("[data-class-action='test']").not.toBeDisplayed();
    expect.verifySteps(["onWillStart"]);

    await contains(":iframe .sub-child-target").click();
    expect.verifySteps([]);
});

test("no need to define 'isActive' method for custom action if the widget already has a generic action", async () => {
    addOption({
        selector: ".s_test",
        template: xml`
        <BuilderRow label.translate="Type">
            <BuilderSelect>
                <BuilderSelectItem classAction="'alert-info'" action="'alertIcon'" actionParam="'fa-info-circle'">Info</BuilderSelectItem>
            </BuilderSelect>
        </BuilderRow>
    `,
    });

    await setupWebsiteBuilder(`
        <div class="s_test alert-info">
        a
        </div>`);
    await contains(":iframe .s_test").click();
    expect(".options-container button").toHaveText("Info");
});

describe("dependencies", () => {
    test("a button should not be visible if its dependency isn't (with undo)", async () => {
        addOption({
            selector: ".test-options-target",
            template: xml`
                <BuilderButton attributeAction="'my-attribute1'" attributeActionValue="'x'" id="'id1'">b1</BuilderButton>
                <BuilderButton attributeAction="'my-attribute1'" attributeActionValue="'y'"  id="'id2'">b2</BuilderButton>
                <BuilderButton attributeAction="'my-attribute2'" attributeActionValue="'1'" dependencies="'id1'">b3</BuilderButton>
                <BuilderButton attributeAction="'my-attribute2'" attributeActionValue="'2'" dependencies="'id2'">b4</BuilderButton>
            `,
        });
        await setupWebsiteBuilder(`<div class="test-options-target">b</div>`);
        setSelection({
            anchorNode: queryFirst(":iframe .test-options-target").childNodes[0],
            anchorOffset: 0,
        });
        await contains(":iframe .test-options-target").click();
        expect(".options-container").toBeDisplayed();
        expect(
            "[data-attribute-action='my-attribute2'][data-attribute-action-value='1']"
        ).not.toBeDisplayed();
        expect(
            "[data-attribute-action='my-attribute2'][data-attribute-action-value='2']"
        ).not.toBeDisplayed();
        await contains(
            "[data-attribute-action='my-attribute1'][data-attribute-action-value='x']"
        ).click();
        expect(":iframe .test-options-target").toHaveAttribute("my-attribute1", "x");
        expect(
            "[data-attribute-action='my-attribute2'][data-attribute-action-value='1']"
        ).toBeDisplayed();
        expect(
            "[data-attribute-action='my-attribute2'][data-attribute-action-value='2']"
        ).not.toBeDisplayed();
        await contains(
            "[data-attribute-action='my-attribute1'][data-attribute-action-value='y']"
        ).click();
        expect(":iframe .test-options-target").toHaveAttribute("my-attribute1", "y");
        expect(
            "[data-attribute-action='my-attribute2'][data-attribute-action-value='1']"
        ).not.toBeDisplayed();
        expect(
            "[data-attribute-action='my-attribute2'][data-attribute-action-value='2']"
        ).toBeDisplayed();
        await contains(".fa-undo").click();
        expect(":iframe .test-options-target").toHaveAttribute("my-attribute1", "x");
        expect(
            "[data-attribute-action='my-attribute2'][data-attribute-action-value='1']"
        ).toBeDisplayed();
        expect(
            "[data-attribute-action='my-attribute2'][data-attribute-action-value='2']"
        ).not.toBeDisplayed();
        await contains(".fa-undo").click();
        expect(
            "[data-attribute-action='my-attribute2'][data-attribute-action-value='1']"
        ).not.toBeDisplayed();
        expect(
            "[data-attribute-action='my-attribute2'][data-attribute-action-value='2']"
        ).not.toBeDisplayed();
    });
    test("a button should not be visible if the dependency is active", async () => {
        addOption({
            selector: ".test-options-target",
            template: xml`
                <BuilderButton attributeAction="'my-attribute1'" attributeActionValue="'x'" id="'id1'">b1</BuilderButton>
                <BuilderButton attributeAction="'my-attribute2'" attributeActionValue="'1'" dependencies="'!id1'">b3</BuilderButton>
            `,
        });
        await setupWebsiteBuilder(`<div class="test-options-target">b</div>`);
        await contains(":iframe .test-options-target").click();
        expect(".options-container").toBeDisplayed();
        expect(
            "[data-attribute-action='my-attribute2'][data-attribute-action-value='1']"
        ).toBeDisplayed();
        await contains(
            "[data-attribute-action='my-attribute1'][data-attribute-action-value='x']"
        ).click();
        expect(":iframe .test-options-target").toHaveAttribute("my-attribute1", "x");
        expect(
            "[data-attribute-action='my-attribute2'][data-attribute-action-value='1']"
        ).not.toBeDisplayed();
    });
    test("a button should not be visible if the dependency is active (when a dependency is added after a dependent)", async () => {
        addOption({
            selector: ".test-options-target",
            template: xml`
                <BuilderButton attributeAction="'my-attribute2'" attributeActionValue="'1'" dependencies="'id'">b1</BuilderButton>
                <BuilderButton attributeAction="'my-attribute2'" attributeActionValue="'2'" dependencies="'!id'">b2</BuilderButton>
                <BuilderRow label="'dependency'">
                    <BuilderButton attributeAction="'my-attribute1'" attributeActionValue="'x'" id="'id'">b3</BuilderButton>
                </BuilderRow>
            `,
        });
        await setupWebsiteBuilder(`<div class="test-options-target">b</div>`);
        await contains(":iframe .test-options-target").click();
        expect(".options-container").toBeDisplayed();
        expect(
            "[data-attribute-action='my-attribute2'][data-attribute-action-value='1']"
        ).not.toBeDisplayed();
        expect(
            "[data-attribute-action='my-attribute2'][data-attribute-action-value='2']"
        ).toBeDisplayed();
        await contains(
            "[data-attribute-action='my-attribute1'][data-attribute-action-value='x']"
        ).click();
        expect(
            "[data-attribute-action='my-attribute2'][data-attribute-action-value='1']"
        ).toBeDisplayed();
        expect(
            "[data-attribute-action='my-attribute2'][data-attribute-action-value='2']"
        ).not.toBeDisplayed();
    });
});
