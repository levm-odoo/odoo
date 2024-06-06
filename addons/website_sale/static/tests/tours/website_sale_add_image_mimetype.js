/** @odoo-module **/

import wTourUtils from "@website/js/tours/tour_utils";
import {
    mockCanvasToDataURLStep,
    uploadImageFromDialog
} from "@website/../tests/tours/snippet_image_mimetype";

const DUMMY_WEBP = "UklGRiwAAABXRUJQVlA4TB8AAAAv/8F/EAcQEREQCCT7e89QRP8z/vOf//znP//5z/8BAA==";

function testWebpUploadImplicitConversion(expectedMimetype) {
    return [
        {
            content: "Go to product page",
            trigger: "iframe .oe_product_cart a",
            run() {
                this.$anchor[0].click(); // for some reason the default action doesn't work
            }
        },
        ...wTourUtils.clickOnEditAndWaitEditMode(),
        {
            content: "Click on the product image",
            trigger: "iframe #o-carousel-product .product_detail_img",
        },
        {
            content: "Open add image dialog",
            trigger: 'we-button[data-add-images="true"]',
        },
        ...uploadImageFromDialog(
            "image/webp",
            "fake_file.webp",
            DUMMY_WEBP,
            ".o_we_existing_attachments .o_we_attachment_selected img",
        ),
        {
            content: "Confirm choice",
            trigger: '.o_select_media_dialog footer button:contains("Add")',
            extraTrigger: ".o_we_existing_attachments .o_we_attachment_selected",
        },
        {
            content: "Go to last carousel image",
            trigger: 'iframe [data-bs-target="#o-carousel-product"][data-bs-slide-to="1"]',
        },
        ...wTourUtils.waitForImageToLoad("iframe #o-carousel-product .carousel-item:nth-child(2) img"),
        ...wTourUtils.clickOnSave(),
        {
            content: "Go to last carousel image",
            trigger: 'iframe [data-bs-target="#o-carousel-product"][data-bs-slide-to="1"]',
        },
        {
            content: `Verify image mimetype is ${expectedMimetype}`,
            trigger: "iframe #o-carousel-product .carousel-item:nth-child(2) img",
            async run() {
                const img = this.$anchor[0];

                async function convertToBase64(file) {
                    return await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                }

                const imgBlob = await (await fetch(img.src)).blob();
                const dataURL = await convertToBase64(imgBlob);
                const mimetype = dataURL.split(':')[1].split(';')[0];
                if (mimetype !== expectedMimetype) {
                    console.error(`Wrong mimetype ${mimetype} - Expected ${expectedMimetype}`);
                }
            }
        },
    ];
}

wTourUtils.registerWebsitePreviewTour("website_sale_add_image_mimetype", {
    test: true,
    edition: false,
    url: "/shop?search=customizable desk",
}, () => [
    ...testWebpUploadImplicitConversion("image/webp"),
]);

wTourUtils.registerWebsitePreviewTour("website_sale_add_image_mimetype_no_webp", {
    test: true,
    edition: false,
    url: "/shop?search=customizable desk",
}, () => [
    mockCanvasToDataURLStep,
    ...testWebpUploadImplicitConversion("image/png"),
]);
