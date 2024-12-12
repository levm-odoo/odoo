import { registry } from "@web/core/registry";

export const card_parent_handlers =
    ".s_three_columns .row > div, .s_comparisons .row > div, .s_cards_grid .row > div, .s_cards_soft .row > div, .s_product_list .row > div";

registry.category("sidebar-element-option").add("BorderOption", {
    template: "html_builder.BorderOption",
    selector: "section .row > div",
    exclude: `.s_col_no_bgcolor, .s_col_no_bgcolor.row > div, .s_image_gallery .row > div, .s_masonry_block .s_col_no_resize, .s_text_cover .row > .o_not_editable, ${card_parent_handlers}`,
    // TODO add border shadow.
});
