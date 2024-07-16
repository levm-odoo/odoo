/** @odoo-module */

import wTourUtils from "@website/js/tours/tour_utils";

wTourUtils.registerWebsitePreviewTour('website_image_quality', {
    test: true,
    url: '/',
    edition: true,
}, () => [
    ...wTourUtils.dragNDrop({
        id: 's_text_image',
        name: 'Text - Image',
    }),
    {
        content: "Select image",
        trigger: ':iframe .s_text_image img',
        run: "click",
    },
    {
        content: "Set low quality",
        trigger: 'we-customizeblock-options:has(we-title:contains("Image")) we-range[data-set-quality] input',
        run: 'range 5',
    },
    {
        content: "Wait for image update: NOT original image",
        trigger: ':iframe .s_text_image img:not([src$="s_text_image_default_image"])',
    },
    {
        content: "Check image size",
        // Reached size cannot be hardcoded because it changes with
        // different versions of Chrome.
        trigger: 'we-customizeblock-options:has(we-title:contains("Image")) .o_we_image_weight:contains(" kb"):not(:contains("16.2 kb"))',
        run() {
            // Make sure the reached size is smaller than the original one.
            if (parseFloat(this.anchor.innerText) >= 20) {
                console.error("Image size should be smaller than original");
            }
        },
    },
    {
        content: "Set high quality",
        trigger: 'we-customizeblock-options:has(we-title:contains("Image")) we-range[data-set-quality] input',
        run: 'range 99',
    },
    {
        content: "Wait for image update: back to original image",
        trigger: ':iframe .s_text_image img[src$="JJJLJJJJJJJvJPJm0k+HT2Kf+iiPOHz13r//2Q=="]',
    },
    {
        content: "Check image size",
        trigger: 'we-customizeblock-options:has(we-title:contains("Image")) .o_we_image_weight:contains("16.2 kb")',
    },
]);
