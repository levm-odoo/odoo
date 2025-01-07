import {
    insertSnippet,
    registerWebsitePreviewTour,
    clickOnSnippet,
} from "@website/js/tours/tour_utils";

const columnCountOptSelector =
    ".snippet-option-layout_column we-select[data-name='column_count_opt']";
const cardsSoftSnippetRow = ":iframe .s_cards_soft .row";
const cardsGridSnippetRow = ":iframe .s_cards_grid .row";
const card_soft_verticalAlignmentOptSelector = ".o_we_customize_panel we-customizeblock-options:has(we-title:contains('Cards Soft'))";
const card_grid_verticalAlignmentOptSelector = ".o_we_customize_panel we-customizeblock-options:has(we-title:contains('Cards Grid'))";

registerWebsitePreviewTour(
    "snippet_cards_soft",
    {
        url: "/",
        edition: true,
    },
    () => [
        // Test column count for s_cards_soft
        ...insertSnippet({
            id: "s_cards_soft",
            name: "Cards Soft",
            groupName: "Columns",
        }),
        ...clickOnSnippet({
            id: "s_cards_soft",
            name: "Cards Soft",
        }),
        {
            content: "Open the columns count select",
            trigger: columnCountOptSelector,
            run: "click",
        },
        {
            content: "Set 4 columns on desktop",
            trigger: `${columnCountOptSelector} we-button[data-select-count='4']`,
            run: "click",
        },
        {
            content: "Check that there are now 4 items on 4 columns",
            trigger: `${cardsSoftSnippetRow}:has(.col-lg-3:nth-child(4))`,
        },
        {
            content: "Open the columns count select",
            trigger: columnCountOptSelector,
            run: "click",
        },
        {
            content: "Set 2 columns on desktop",
            trigger: `${columnCountOptSelector} we-button[data-select-count='2']`,
            run: "click",
        },
        {
            content: "Check that there are still 4 items in the row",
            trigger: `${cardsSoftSnippetRow} > :nth-child(4)`,
        },
        // Test vertical alignment for s_cards_soft
        {
            content: "Open the vertical alignment options",
            trigger: `${card_soft_verticalAlignmentOptSelector} we-title:contains('Vert. Alignment')`,
            run: "click",
        },
        {
            content: "Set vertical alignment to center",
            trigger: `${card_soft_verticalAlignmentOptSelector} we-button[data-select-class='align-items-center']`,
            run: "click",
        },
        {
            content: "Check that the vertical alignment is set to center",
            trigger: `${cardsSoftSnippetRow}.align-items-center`,
        },
        {
            content: "Set vertical alignment to start",
            trigger: `${card_soft_verticalAlignmentOptSelector} we-button[data-select-class='align-items-start']`,
            run: "click",
        },
        {
            content: "Check that the vertical alignment is set to start",
            trigger: `${cardsSoftSnippetRow}.align-items-start`,
        },
        {
            content: "Set vertical alignment to end",
            trigger: `${card_soft_verticalAlignmentOptSelector} we-button[data-select-class='align-items-end']`,
            run: "click",
        },
        {
            content: "Check that the vertical alignment is set to end",
            trigger: `${cardsSoftSnippetRow}.align-items-end`,
        },
    ]
);

registerWebsitePreviewTour(
    "snippet_cards_grid",
    {
        url: "/",
        edition: true,
    },
    () => [
        // Test column count for s_cards_grid
        ...insertSnippet({
            id: "s_cards_grid",
            name: "Cards Grid",
            groupName: "Columns",
        }),
        ...clickOnSnippet({
            id: "s_cards_grid",
            name: "Cards Grid",
        }),
        {
            content: "Open the columns count select",
            trigger: columnCountOptSelector,
            run: "click",
        },
        {
            content: "Set 3 columns on desktop",
            trigger: `${columnCountOptSelector} we-button[data-select-count='3']`,
            run: "click",
        },
        {
            content: "Check that there are now 3 items on 3 columns",
            trigger: `${cardsGridSnippetRow}:has(.col-lg-4:nth-child(3))`,
        },
        {
            content: "Open the columns count select",
            trigger: columnCountOptSelector,
            run: "click",
        },
        {
            content: "Set 1 column on desktop",
            trigger: `${columnCountOptSelector} we-button[data-select-count='1']`,
            run: "click",
        },
        {
            content: "Check that there are still 3 items in the row",
            trigger: `${cardsGridSnippetRow} > :nth-child(3)`,
        },
        // Test vertical alignment for s_cards_soft
        {
            content: "Open the vertical alignment options",
            trigger: `${card_grid_verticalAlignmentOptSelector} we-title:contains('Vert. Alignment')`,
            run: "click",
        },
        {
            content: "Set vertical alignment to center",
            trigger: `${card_grid_verticalAlignmentOptSelector} we-button[data-select-class='align-items-center']`,
            run: "click",
        },
        {
            content: "Check that the vertical alignment is set to center",
            trigger: `${cardsGridSnippetRow}.align-items-center`,
        },
        {
            content: "Set vertical alignment to start",
            trigger: `${card_grid_verticalAlignmentOptSelector} we-button[data-select-class='align-items-start']`,
            run: "click",
        },
        {
            content: "Check that the vertical alignment is set to start",
            trigger: `${cardsGridSnippetRow}.align-items-start`,
        },
        {
            content: "Set vertical alignment to end",
            trigger: `${card_grid_verticalAlignmentOptSelector} we-button[data-select-class='align-items-end']`,
            run: "click",
        },
        {
            content: "Check that the vertical alignment is set to end",
            trigger: `${cardsGridSnippetRow}.align-items-end`,
        },
    ]
);
