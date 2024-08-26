/** @odoo-module **/

import { goToCart, assertCartContains } from '@website_sale/js/tours/tour_utils';
import {
    registerWebsitePreviewTour,
    clickOnEditAndWaitEditMode,
    clickOnSnippet,
    dragNDrop,
    selectElementInWeSelectWidget,
    clickOnSave,
    clickOnElement,
} from "@website/js/tours/tour_utils";

function editAddToCartSnippet() {
    return [
        ...clickOnEditAndWaitEditMode(),
        ...clickOnSnippet({id: 's_add_to_cart'})
    ]
}

registerWebsitePreviewTour('add_to_cart_snippet_tour', {
        url: '/',
        edition: true,
        test: true,
    },
    () => [
        ...dragNDrop({name: 'Add to Cart Button'}),

        // Basic product with no variants
        ...clickOnSnippet({id: 's_add_to_cart'}),
        ...selectElementInWeSelectWidget('product_template_picker_opt', 'Pedal Bin', true),
        ...clickOnSave(),
        clickOnElement('add to cart button', ':iframe .s_add_to_cart_btn'),

        // Product with 2 variants with visitor choice (will open modal)
        ...editAddToCartSnippet(),
        ...selectElementInWeSelectWidget('product_template_picker_opt', 'Conference Chair', true),
        ...clickOnSave(),
        clickOnElement('add to cart button', ':iframe .s_add_to_cart_btn'),
        clickOnElement("continue shopping", ":iframe .modal button:contains(Continue Shopping)"),

        // Product with 2 variants with a variant selected
        ...editAddToCartSnippet(),
        ...selectElementInWeSelectWidget('product_template_picker_opt', 'Conference Chair', true),
        ...selectElementInWeSelectWidget('product_variant_picker_opt', 'Conference Chair (Aluminium)'),
        ...clickOnSave(),
        clickOnElement('add to cart button', ':iframe .s_add_to_cart_btn'),

        // Basic product with no variants and action=buy now
        ...editAddToCartSnippet(),
        ...selectElementInWeSelectWidget('product_template_picker_opt', 'Pedal Bin', true),
        ...selectElementInWeSelectWidget('action_picker_opt', 'Buy Now'),
        ...clickOnSave(),
        clickOnElement('add to cart button', ':iframe .s_add_to_cart_btn'),
        {
            // wait for the page to load, as the next check was sometimes too fast
            content: "Wait for the redirection to the payment page",
            trigger: ":iframe h3:contains(order overview)",
        },
        {
            content: `Check if we have been redirected to /shop/cart`,
            trigger: ":iframe a[href='/shop/cart']",
            run() {
                if (!window.location.pathname.startsWith("/shop/cart")) {
                    console.error(`We should be on /shop/cart.`);
                }
            },
        },
        goToCart({quantity: 4, backend: true}),
        assertCartContains({productName: 'Pedal Bin', backend: true}),
        assertCartContains({productName: 'Conference Chair (Steel)', backend: true}),
        assertCartContains({productName: 'Conference Chair (Aluminium)', backend: true}),
    ],
);
