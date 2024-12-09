/** @odoo-module **/
import wTourUtils from "@website/js/tours/tour_utils";

wTourUtils.registerWebsitePreviewTour("website_font_family", {
    test: true,
    url: "/",
    edition: true,
}, () => [
    ...wTourUtils.goToTheme(),
    {
        content: "Click on the heading font family selector",
        trigger: "we-select[data-variable='headings-font']",
        run: "click",
    },
    {
        content: "Click on the 'Arvo' font we-button from the font selection list.",
        trigger: "we-selection-items we-button[data-font-family='Arvo']",
        run: "click",
    },
    {
        content: "Verify that the 'Arvo' font family is correctly applied to the heading.",
        trigger: "we-toggler[style*='font-family: Arvo;']",
    },
    {
        content: "Open the heading font family selector",
        trigger: "we-toggler[style*='font-family: Arvo;']",
        run: "click",
    },
    {
        content: "Click on the 'Add a custom font' button",
        trigger: "we-select[data-variable='headings-font'] .o_we_add_font_btn",
        run: "click",
    },
    {
        content: "Wait for the modal to open and then refresh",
        trigger: "button.btn-secondary",
        run: function () {
            setTimeout(() => {
                this.anchor.click();
            }, 2000);
        },
    },
    {
        content: "Check that 'Arvo' font family is still applied and not reverted",
        trigger: "we-toggler[style*='font-family: Arvo;']",
    },
]);
