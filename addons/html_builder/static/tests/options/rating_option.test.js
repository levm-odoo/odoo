import { defineWebsiteModels, setupWebsiteBuilder } from "../helpers";
import { expect, test } from "@odoo/hoot";
import { animationFrame, clear, click, fill } from "@odoo/hoot-dom";
import { contains } from "@web/../tests/web_test_helpers";

defineWebsiteModels();

test("change rating score", async () => {
    await setupWebsiteBuilder(
        `<div class="s_rating pt16 pb16" data-icon="fa-star" data-snippet="s_rating" data-name="Rating">
            <h4 class="s_rating_title">Quality</h4>
            <div class="s_rating_icons">
                <span class="s_rating_active_icons">
                    <i class="fa fa-star"></i>
                    <i class="fa fa-star"></i>
                    <i class="fa fa-star"></i>
                </span>
                <span class="s_rating_inactive_icons">
                    <i class="fa fa-star-o"></i>
                    <i class="fa fa-star-o"></i>
                </span>
            </div>
        </div>`
    );
    expect(":iframe .s_rating .s_rating_active_icons i").toHaveCount(3);
    expect(":iframe .s_rating .s_rating_inactive_icons i").toHaveCount(2);
    await contains(":iframe .s_rating").click();
    await contains(".options-container [data-action-id='activeIconsNumber'] input").click();
    await clear();
    await fill("1");
    expect(":iframe .s_rating .s_rating_active_icons i").toHaveCount(1);
    await contains(".options-container [data-action-id='totalIconsNumber'] input").click();
    await clear();
    await fill("4");
    expect(":iframe .s_rating .s_rating_inactive_icons i").toHaveCount(3);
});
test("Ensure order of operations when clicking very fast on two options", async () => {
    await setupWebsiteBuilder(
        `<div class="s_rating pt16 pb16" data-icon="fa-star" data-snippet="s_rating" data-name="Rating">
            <h4 class="s_rating_title">Quality</h4>
            <div class="s_rating_icons">
                <span class="s_rating_active_icons">
                    <i class="fa fa-star"></i>
                    <i class="fa fa-star"></i>
                    <i class="fa fa-star"></i>
                </span>
                <span class="s_rating_inactive_icons">
                    <i class="fa fa-star-o"></i>
                    <i class="fa fa-star-o"></i>
                </span>
            </div>
        </div>`
    );
    await contains(":iframe .s_rating").click();
    expect("[data-label='Icon'] .btn-primary.dropdown-toggle").toHaveText("Stars");
    expect(":iframe .s_rating").not.toHaveAttribute("data-active-custom-icon");
    await click(".options-container [data-action-id='customIcon']");
    await click(".options-container [data-class-action='fa-2x']");
    await animationFrame();
    expect(":iframe .s_rating_icons").not.toHaveClass("fa-2x");
    await contains(".modal-dialog .fa-glass").click();
    expect(":iframe .s_rating").toHaveAttribute("data-active-custom-icon", "fa fa-glass");
    expect("[data-label='Icon'] .btn-primary.dropdown-toggle").toHaveText("Custom");
    expect(":iframe .s_rating_icons").toHaveClass("fa-2x");
    await contains(".o-snippets-top-actions .fa-undo").click();
    expect("[data-label='Icon'] .btn-primary.dropdown-toggle").toHaveText("Custom");
    expect(":iframe .s_rating").toHaveAttribute("data-active-custom-icon", "fa fa-glass");
    expect(":iframe .s_rating_icons").not.toHaveClass("fa-2x");
    await contains(".o-snippets-top-actions .fa-undo").click();
    expect("[data-label='Icon'] .btn-primary.dropdown-toggle").toHaveText("Stars");
    expect(":iframe .s_rating").not.toHaveAttribute("data-active-custom-icon");
    expect(":iframe .s_rating_icons").not.toHaveClass("fa-2x");
});
